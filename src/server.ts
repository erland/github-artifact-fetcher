import {FixedWindowLimiter,securityHeaders,audit,requestId} from './security.js';
/** MCP transport and PostgreSQL readiness. GitHub fetching is deferred until DEV-006. */
import http from 'node:http';
import {createMcpHandler, McpServer, ResourceTemplate} from '@modelcontextprotocol/server';
import {toNodeHandler} from '@modelcontextprotocol/node';
import {createDatabaseProbe, databaseConfig, type DatabaseProbe} from './database.js';
import {OAuth, type PrincipalResolver} from './oauth.js';
import {Pool} from 'pg';
import {GitHubIdentity} from './github-identity.js';
import {ReleaseService} from './releases.js';
import {ActionsArtifacts} from './actions-artifacts.js';
import {RepositoryArchives} from './repository-archives.js';
import {EphemeralFiles} from './file-delivery.js';
import {stageHandoff} from './file-handoff-contract.js';
import {GitHubWebhooks} from './github-webhooks.js';
import {LIBRARY_UPLOAD_WIDGET_URI,libraryUploadWidgetHtml} from './library-upload-widget.js';
import * as z from 'zod/v4';
function mcpHandler(user:string,identity:GitHubIdentity|undefined,files:EphemeralFiles,publicBaseUrl:string){
 const handler=createMcpHandler(()=>{
  const server=new McpServer({name:'github-artifact-fetcher',version:'0.10.0-dev010'},{capabilities:{tools:{}}});
  server.registerTool('get_capabilities',{description:'Current supported sources',annotations:{readOnlyHint:true,openWorldHint:false},inputSchema:undefined},async()=>({content:[{type:'text',text:JSON.stringify({release:!!identity,actions:!!identity,repository:!!identity,packages:false,liveChatGptHandoff:false,externalOneTimeDownload:true,smallBinaryResource:true,maxResourceBytes:5242880,smallBinaryTool:true,maxToolBytes:5242880})}]}));
  if(identity){
   // An MCP App UI experiment: transfer bytes through the widget's network
   // request, not through the model-visible MCP result. No automatic upload.
   server.registerResource('library-upload-widget',LIBRARY_UPLOAD_WIDGET_URI,
    {mimeType:'text/html;profile=mcp-app',description:'Experimental ChatGPT Library file upload'},
    async()=>({contents:[{uri:LIBRARY_UPLOAD_WIDGET_URI,mimeType:'text/html;profile=mcp-app',
     text:libraryUploadWidgetHtml,
     _meta:{ui:{csp:{connectDomains:[new URL(publicBaseUrl).origin],resourceDomains:[]}},
       'openai/widgetDescription':'Experimental user-initiated upload to ChatGPT Library. GitHub download remains the fallback.'}
    }]}));
   server.registerTool('prepare_library_upload',
    {description:'EXPERIMENTAL: Prepare a public or authorized private GitHub release asset for a user-initiated ChatGPT Library upload widget. Does not transfer file bytes via MCP; the user must click Save and the host may not support this. Otherwise use list_release_assets and manual attachment.',
     inputSchema:z.object({repository:z.string(),tag:z.string(),assetName:z.string()}),
     _meta:{'openai/outputTemplate':LIBRARY_UPLOAD_WIDGET_URI,ui:{resourceUri:LIBRARY_UPLOAD_WIDGET_URI}}},
    async({repository,tag,assetName})=>{
      const releases=new ReleaseService(identity);
      const assets=await releases.list(user,repository,tag);
      const match=assets.find(a=>a.name===assetName);
      if(!match)throw Error('ASSET_NOT_FOUND');
      const staged=stageHandoff(files,await releases.fetch(user,repository,tag,assetName),publicBaseUrl,user);
      const githubUrl=match.githubUrl;
      const structuredContent={filename:staged.filename,mimeType:staged.mimeType,
       sizeBytes:staged.sizeBytes,sha256:staged.sha256,downloadUrl:staged.downloadUrl,
       expiresAt:staged.expiresAt,githubUrl};
      return {structuredContent,content:[{type:'text' as const,
       text:JSON.stringify({filename:staged.filename,sizeBytes:staged.sizeBytes,sha256:staged.sha256,
        expiresAt:staged.expiresAt,githubUrl,requiresUserClick:true,nativeAttachment:false})}]};
    });
   server.registerResource('binary-file',new ResourceTemplate('github-artifact-fetcher://files/{id}',{list:undefined}),{title:'Temporary binary file',description:'Owner-scoped binary ZIP, PDF or EPUB; maximum 5 MiB',mimeType:'application/octet-stream'},async(uri,{id})=>{
    const value=files.resource(String(id),user);
    if(!value)throw Error('FILE_NOT_FOUND_OR_EXPIRED');
    return {contents:[{uri:uri.href,mimeType:value.mimeType,blob:value.blob}]};
   });
   server.registerTool('read_small_file',{description:'Compatibility-only embedded binary transfer. Prefer GitHub browser links and ask the user to download and attach the file in ChatGPT. Use this tool only if the user explicitly requests automatic transfer of a file no larger than 256 KiB. Larger embedded binary responses may exhaust conversation context; the existing technical limit is 5 MiB. First use a fetch_* tool to obtain resourceUri. Not a native ChatGPT attachment.',annotations:{readOnlyHint:true},inputSchema:z.object({resourceUri:z.string().max(160)})},async({resourceUri})=>{
    const match=/^github-artifact-fetcher:\/\/files\/([a-f0-9]{64})$/.exec(resourceUri);
    if(!match)throw Error('INVALID_RESOURCE_URI');
    const value=files.resource(match[1],user);
    if(!value)throw Error('FILE_NOT_FOUND_OR_EXPIRED_OR_TOO_LARGE');
    return {content:[{type:'resource' as const,resource:{uri:resourceUri,mimeType:value.mimeType,blob:value.blob}}]};
   });
   const releases=new ReleaseService(identity);
   const actions=new ActionsArtifacts(identity);
   const archives=new RepositoryArchives(identity);
   server.registerTool('get_repository_archive_link',{description:'Preferred user-facing workflow: get a commit-pinned GitHub browser URL without downloading ZIP bytes. Ask the user to download and attach the archive in ChatGPT.',inputSchema:z.object({repository:z.string(),refKind:z.enum(['branch','tag','commit']),ref:z.string()})},async({repository,refKind,ref})=>({content:[{type:'text',text:JSON.stringify(await archives.link(user,repository,{kind:refKind,value:ref}))}]}));
   server.registerTool('fetch_repository_archive',{description:'Compatibility/integration only: fetch ZIP bytes into a temporary handoff. For ordinary ChatGPT use prefer get_repository_archive_link and manual file attachment.',inputSchema:z.object({repository:z.string(),refKind:z.enum(['branch','tag','commit']),ref:z.string()})},async({repository,refKind,ref})=>({content:[{type:'text',text:JSON.stringify(stageHandoff(files,await archives.download(user,repository,{kind:refKind,value:ref}),publicBaseUrl,user))}]}));
   server.registerTool('list_workflow_artifacts',{description:'Preferred user-facing workflow: list workflow artifacts and their GitHub run-page links without downloading files. Ask the user to download the desired artifact from GitHub and attach it.',inputSchema:z.object({repository:z.string(),runId:z.number().int().positive()})},async({repository,runId})=>({content:[{type:'text',text:JSON.stringify(await actions.list(user,repository,runId))}]}));
   server.registerTool('fetch_workflow_artifact',{description:'Compatibility/integration only: fetch artifact into temporary HTTPS handoff (not native ChatGPT attachment). For ordinary ChatGPT use list_workflow_artifacts and manual file attachment.',inputSchema:z.object({repository:z.string(),runId:z.number().int().positive(),artifactId:z.number().int().positive()})},async({repository,runId,artifactId})=>({content:[{type:'text',text:JSON.stringify(stageHandoff(files,await actions.download(user,repository,runId,artifactId),publicBaseUrl,user))}]}));
   server.registerTool('list_release_assets',{description:'Preferred user-facing workflow: list release asset metadata and GitHub browser download URLs without downloading binary files. Ask the user to download and attach the selected file.',inputSchema:z.object({repository:z.string(),tag:z.string()})},async({repository,tag})=>({content:[{type:'text',text:JSON.stringify(await releases.list(user,repository,tag))}]}));
   server.registerTool('fetch_release_asset',{description:'Compatibility/integration only: fetch a release asset into temporary HTTPS handoff (not native ChatGPT attachment). For ordinary ChatGPT use list_release_assets and ask the user to download and attach via githubUrl.',inputSchema:z.object({repository:z.string(),tag:z.string(),assetName:z.string()})},async({repository,tag,assetName})=>({content:[{type:'text',text:JSON.stringify(stageHandoff(files,await releases.fetch(user,repository,tag,assetName),publicBaseUrl,user))}]}));
  }
  return server;
 });
 return toNodeHandler(handler);
}
function json(res:http.ServerResponse,status:number,data:unknown){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));}
export function createServer(options:{database?:DatabaseProbe;oauth?:OAuth;identity?:GitHubIdentity}={}){
 const limiter=new FixedWindowLimiter(120,60_000);
 const dbAvailable=!!process.env.DATABASE_URL||['DB_HOST','DB_NAME','DB_USER','DB_PASSWORD'].every(key=>!!process.env[key]);
 const poolOptions=dbAvailable?databaseConfig():undefined;
 const webhook=poolOptions&&process.env.GITHUB_WEBHOOK_SECRET?new GitHubWebhooks(new Pool({...poolOptions,max:5}),process.env.GITHUB_WEBHOOK_SECRET):undefined;
 const ttlSeconds=Number(process.env.WIDGET_DOWNLOAD_TTL_SECONDS??120);
 if(!Number.isSafeInteger(ttlSeconds)||ttlSeconds<120||ttlSeconds>900)throw Error('INVALID_WIDGET_DOWNLOAD_TTL');
 const files=new EphemeralFiles(Date.now,16,ttlSeconds*1000);
 const diagnosticOpenCors=process.env.WIDGET_DOWNLOAD_CORS_ANY_ORIGIN==='true';
 const publicBaseUrl=process.env.PUBLIC_BASE_URL??'https://localhost';
 if(process.env.NODE_ENV==='production'){
  const base=new URL(publicBaseUrl);
  if(base.protocol!=='https:'||base.pathname!=='/'||base.search||base.hash||base.username||base.password)throw Error('INVALID_PUBLIC_BASE_URL');
  if(!poolOptions)throw Error('MISSING_DATABASE_CONFIG');
  for(const name of ['PUBLIC_BASE_URL','GITHUB_APP_CLIENT_ID','GITHUB_APP_CLIENT_SECRET','GITHUB_WEBHOOK_SECRET','ENCRYPTION_KEY','OAUTH_ALLOWED_REDIRECT_HOSTS'])if(!process.env[name])throw Error('MISSING_CONFIG_'+name);
 }
 const identity=options.identity??(poolOptions&&process.env.PUBLIC_BASE_URL&&process.env.GITHUB_APP_CLIENT_ID&&process.env.GITHUB_APP_CLIENT_SECRET&&process.env.ENCRYPTION_KEY?new GitHubIdentity({pool:new Pool({...poolOptions,max:5}),clientId:process.env.GITHUB_APP_CLIENT_ID,clientSecret:process.env.GITHUB_APP_CLIENT_SECRET,publicBaseUrl:process.env.PUBLIC_BASE_URL,encryptionKey:Buffer.from(process.env.ENCRYPTION_KEY,'base64')}):undefined);
 const oauth=options.oauth??(poolOptions&&process.env.PUBLIC_BASE_URL?new OAuth({issuer:process.env.PUBLIC_BASE_URL,pool:new Pool({...poolOptions,max:5}),principal:identity?req=>identity.principal(req):async()=>null}):undefined);
 const database=options.database??(poolOptions?createDatabaseProbe(poolOptions):undefined);
 return http.createServer(async(req,res)=>{
  securityHeaders(res);
  const rid=requestId(req);res.setHeader('x-request-id',rid);
  const remote=req.socket.remoteAddress??'unknown';
  if(!limiter.allow(remote)){audit('request',rid,'rate_limited');return json(res,429,{error:'RATE_LIMITED'});}
  const path=new URL(req.url??'/','http://localhost').pathname;
  if(path==='/webhooks/github'&&req.method==='POST'){
   if(!webhook)return json(res,503,{error:'WEBHOOK_NOT_CONFIGURED'});
   await webhook.handle(req,res);return;
  }
  if(path.startsWith('/downloads/')&&(req.method==='GET'||req.method==='OPTIONS')){
   const origin=req.headers.origin;
   const allowed=diagnosticOpenCors||origin==='https://web-sandbox.oaiusercontent.com';
   if(allowed&&origin){
    res.setHeader('access-control-allow-origin',diagnosticOpenCors?'*':origin);
    res.setHeader('vary','Origin');
   }
   res.setHeader('access-control-expose-headers','x-checksum-sha256, x-download-diagnostic');
   const id=path.slice('/downloads/'.length);
   if(req.method==='OPTIONS'){
    if(!allowed)return json(res,403,{error:'ORIGIN_NOT_ALLOWED'});
    res.writeHead(204,{'access-control-allow-methods':'GET, OPTIONS','access-control-allow-headers':'content-type','access-control-max-age':'300'});res.end();
    audit('widget_download',rid,'preflight_allowed');return;
   }
   const served=files.serve(id,res);
   // No bearer token, file bytes, capability ID or raw URL in logs.
   audit('widget_download',rid,served?'served': 'not_found_or_expired');
   if(!served)return json(res,404,{error:'FILE_NOT_FOUND_OR_EXPIRED'});
   return;
  }
  if(req.method==='GET'&&path==='/health')return json(res,200,{status:'ok',version:'0.10.0-dev010'});
  if(req.method==='GET'&&path==='/ready'){
   const ok=database?await database.ready():false;
   return json(res,ok?200:503,{status:ok?'ready':'not_ready',database:ok});
  }
  try { if(identity&&await identity.route(req,res,new URL(req.url??'/',process.env.PUBLIC_BASE_URL??'https://localhost')))return; }
  catch { if(!res.headersSent)json(res,500,{error:'GITHUB_LOGIN_FAILED'});else res.end();return; }
  try { if(oauth&&await oauth.handle(req,res,new URL(req.url??'/',oauth.issuer)))return; }
  catch { if(!res.headersSent)json(res,500,{error:'OAUTH_REQUEST_FAILED'});else res.end();return; }
  if(path!=='/mcp')return json(res,404,{error:'NOT_FOUND'});
  const subject=oauth?await oauth.subject(req):null;
  if(!subject){
   audit('mcp',rid,'unauthorized');
   res.writeHead(401,{'content-type':'application/json','WWW-Authenticate':`Bearer resource_metadata="${oauth?.issuer??'https://localhost'}/.well-known/oauth-protected-resource/mcp"`});res.end(JSON.stringify({error:'unauthorized'}));return;
  }
  try{await mcpHandler(subject,identity,files,publicBaseUrl)(req,res);audit('mcp',rid,'completed');}catch{audit('mcp',rid,'failed');if(!res.headersSent)json(res,500,{error:'MCP_REQUEST_FAILED'});else res.end();}
 });
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 if(!process.env.PUBLIC_BASE_URL)throw new Error('PUBLIC_BASE_URL required');
 createServer().listen(Number(process.env.PORT??3000),'0.0.0.0');
}

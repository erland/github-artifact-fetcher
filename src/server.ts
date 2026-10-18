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
import * as z from 'zod/v4';
function mcpHandler(user:string,identity:GitHubIdentity|undefined,files:EphemeralFiles,publicBaseUrl:string){
 const handler=createMcpHandler(()=>{
  const server=new McpServer({name:'github-artifact-fetcher',version:'0.10.0-dev010'},{capabilities:{tools:{}}});
  server.registerTool('get_capabilities',{description:'Current supported sources',annotations:{readOnlyHint:true,openWorldHint:false},inputSchema:undefined},async()=>({content:[{type:'text',text:JSON.stringify({release:!!identity,actions:!!identity,repository:!!identity,packages:false,liveChatGptHandoff:false,externalOneTimeDownload:true,smallBinaryResource:true,maxResourceBytes:262144,smallBinaryTool:true,maxToolBytes:262144,smallFileLimitBytes:262144,preferredLargeFileDelivery:'github_url'})}]}));
  if(identity){
   server.registerResource('binary-file',new ResourceTemplate('github-artifact-fetcher://files/{id}',{list:undefined}),{title:'Temporary binary file',description:'Owner-scoped binary ZIP, PDF or EPUB; maximum 256 KiB',mimeType:'application/octet-stream'},async(uri,{id})=>{
    const value=files.resource(String(id),user);
    if(!value)throw Error('FILE_NOT_FOUND_OR_EXPIRED');
    return {contents:[{uri:uri.href,mimeType:value.mimeType,blob:value.blob}]};
   });
   server.registerTool('read_small_file',{description:'Read a staged file at most 256 KiB as MCP base64 binary content. For larger files use GitHub links. Binary MCP content is not an ordinary ChatGPT attachment.',annotations:{readOnlyHint:true},inputSchema:z.object({resourceUri:z.string().max(160)})},async({resourceUri})=>{
    const match=/^github-artifact-fetcher:\/\/files\/([a-f0-9]{64})$/.exec(resourceUri);
    if(!match)throw Error('INVALID_RESOURCE_URI');
    const value=files.resource(match[1],user);
    if(!value)throw Error('FILE_NOT_FOUND_OR_EXPIRED_OR_TOO_LARGE');
    return {content:[{type:'resource' as const,resource:{uri:resourceUri,mimeType:value.mimeType,blob:value.blob}}]};
   });
   const releases=new ReleaseService(identity);
   const actions=new ActionsArtifacts(identity);
   const archives=new RepositoryArchives(identity);
   server.registerTool('get_small_release_asset',{description:'Fetch a GitHub release asset only if its metadata size is <= 256 KiB, and return its validated bytes as MCP base64 binary content. Larger assets must use list_release_assets githubUrl; do not fetch large binaries. Not a native ChatGPT attachment.',inputSchema:z.object({repository:z.string(),tag:z.string(),assetName:z.string()})},async({repository,tag,assetName})=>{
     const assets=await releases.list(user,repository,tag);
     const matches=assets.filter(a=>a.name===assetName);
     if(matches.length!==1)throw Error('ASSET_NOT_FOUND');
     if(!Number.isSafeInteger(matches[0].size)||matches[0].size<1||matches[0].size>262144)
       return {content:[{type:'text' as const,text:JSON.stringify({delivery:'github_url',reason:'FILE_EXCEEDS_256_KIB',filename:assetName,sizeBytes:matches[0].size,githubUrl:matches[0].githubUrl})}]};
     const file=await releases.fetch(user,repository,tag,assetName);
     if(file.sizeBytes>262144)throw Error('SMALL_FILE_SIZE_CHANGED');
     return {content:[{type:'resource' as const,resource:{uri:'github-artifact-fetcher://release/small',mimeType:file.mimeType,blob:file.dataBase64}},{type:'text' as const,text:JSON.stringify({filename:file.filename,sizeBytes:file.sizeBytes,sha256:file.sha256,githubUrl:matches[0].githubUrl,notNativeAttachment:true})}]};
   });
   server.registerTool('get_repository_archive_link',{description:'Preferred user-facing workflow: get a commit-pinned GitHub browser URL without downloading ZIP bytes. Ask the user to download and attach the archive in ChatGPT.',inputSchema:z.object({repository:z.string(),refKind:z.enum(['branch','tag','commit']),ref:z.string()})},async({repository,refKind,ref})=>({content:[{type:'text',text:JSON.stringify(await archives.link(user,repository,{kind:refKind,value:ref}))}]}));
   server.registerTool('fetch_repository_archive',{description:'Compatibility/integration only: fetch ZIP bytes into a temporary handoff. For ordinary ChatGPT use prefer get_repository_archive_link and manual file attachment.',inputSchema:z.object({repository:z.string(),refKind:z.enum(['branch','tag','commit']),ref:z.string()})},async({repository,refKind,ref})=>({content:[{type:'text',text:JSON.stringify(stageHandoff(files,await archives.download(user,repository,{kind:refKind,value:ref}),publicBaseUrl,user))}]}));
   server.registerTool('list_workflow_artifacts',{description:'Preferred user-facing workflow: list workflow artifacts and their GitHub run-page links without downloading files. Ask the user to download the desired artifact from GitHub and attach it.',inputSchema:z.object({repository:z.string(),runId:z.number().int().positive()})},async({repository,runId})=>({content:[{type:'text',text:JSON.stringify(await actions.list(user,repository,runId))}]}));
   server.registerTool('fetch_workflow_artifact',{description:'Compatibility/integration only: fetch artifact into temporary HTTPS handoff (not native ChatGPT attachment). For ordinary ChatGPT use list_workflow_artifacts and manual file attachment.',inputSchema:z.object({repository:z.string(),runId:z.number().int().positive(),artifactId:z.number().int().positive()})},async({repository,runId,artifactId})=>({content:[{type:'text',text:JSON.stringify(stageHandoff(files,await actions.download(user,repository,runId,artifactId),publicBaseUrl,user))}]}));
   server.registerTool('list_release_assets',{description:'Preferred user-facing workflow: list release asset metadata and GitHub browser download URLs without downloading binary files. Ask the user to download and attach the selected file.',inputSchema:z.object({repository:z.string(),tag:z.string()})},async({repository,tag})=>({content:[{type:'text',text:JSON.stringify(await releases.list(user,repository,tag))}]}));
   server.registerTool('fetch_release_asset',{description:'Legacy compatibility: for assets <=256 KiB stage an optional binary handoff. Larger release assets return the original GitHub download URL without fetching bytes. Prefer get_small_release_asset for small binary transfers.',inputSchema:z.object({repository:z.string(),tag:z.string(),assetName:z.string()})},async({repository,tag,assetName})=>{
    const assets=await releases.list(user,repository,tag);
    const matches=assets.filter(a=>a.name===assetName);
    if(matches.length!==1)throw Error('ASSET_NOT_FOUND');
    if(!Number.isSafeInteger(matches[0].size)||matches[0].size<1||matches[0].size>262144)
      return {content:[{type:'text' as const,text:JSON.stringify({delivery:'github_url',sizeBytes:matches[0].size,githubUrl:matches[0].githubUrl,filename:assetName})}]};
    const file=await releases.fetch(user,repository,tag,assetName);
    if(file.sizeBytes>262144)throw Error('SMALL_FILE_SIZE_CHANGED');
    return {content:[{type:'text' as const,text:JSON.stringify(stageHandoff(files,file,publicBaseUrl,user))}]};
   });
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
 const files=new EphemeralFiles();
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
  if(req.method==='GET'&&path.startsWith('/downloads/')){
   if(!files.serve(path.slice('/downloads/'.length),res))return json(res,404,{error:'FILE_NOT_FOUND_OR_EXPIRED'});
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

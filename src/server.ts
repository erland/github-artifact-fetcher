/** MCP transport and PostgreSQL readiness. GitHub fetching is deferred until DEV-006. */
import http from 'node:http';
import {createMcpHandler, McpServer} from '@modelcontextprotocol/server';
import {toNodeHandler} from '@modelcontextprotocol/node';
import {createDatabaseProbe, type DatabaseProbe} from './database.js';
import {OAuth, type PrincipalResolver} from './oauth.js';
import {Pool} from 'pg';
import {GitHubIdentity} from './github-identity.js';
import {ReleaseService} from './releases.js';
import {ActionsArtifacts} from './actions-artifacts.js';
import {RepositoryArchives} from './repository-archives.js';
import * as z from 'zod/v4';
function mcpHandler(user:string,identity:GitHubIdentity|undefined){
 const handler=createMcpHandler(()=>{
  const server=new McpServer({name:'github-artifact-fetcher',version:'0.8.0-dev008'},{capabilities:{tools:{}}});
  server.registerTool('get_capabilities',{description:'Current supported sources',annotations:{readOnlyHint:true,openWorldHint:false},inputSchema:undefined},async()=>({content:[{type:'text',text:JSON.stringify({release:!!identity,actions:!!identity,repository:!!identity,packages:false,liveChatGptHandoff:false})}]}));
  if(identity){
   const releases=new ReleaseService(identity);
   const actions=new ActionsArtifacts(identity);
   const archives=new RepositoryArchives(identity);
   server.registerTool('fetch_repository_archive',{description:'Download a repository ZIP at an explicit branch, tag or full commit SHA, with controlled redirect and SHA-256',inputSchema:z.object({repository:z.string(),refKind:z.enum(['branch','tag','commit']),ref:z.string()})},async({repository,refKind,ref})=>({content:[{type:'text',text:JSON.stringify(await archives.download(user,repository,{kind:refKind,value:ref}))}]}));
   server.registerTool('list_workflow_artifacts',{description:'List GitHub Actions artifacts scoped to a workflow run',inputSchema:z.object({repository:z.string(),runId:z.number().int().positive()})},async({repository,runId})=>({content:[{type:'text',text:JSON.stringify(await actions.list(user,repository,runId))}]}));
   server.registerTool('fetch_workflow_artifact',{description:'Fetch a workflow-run artifact as a bounded ZIP/base64 response with SHA-256 (not a ChatGPT attachment)',inputSchema:z.object({repository:z.string(),runId:z.number().int().positive(),artifactId:z.number().int().positive()})},async({repository,runId,artifactId})=>({content:[{type:'text',text:JSON.stringify(await actions.download(user,repository,runId,artifactId))}]}));
   server.registerTool('list_release_assets',{description:'List GitHub release assets for a tag',inputSchema:z.object({repository:z.string(),tag:z.string()})},async({repository,tag})=>({content:[{type:'text',text:JSON.stringify(await releases.list(user,repository,tag))}]}));
   server.registerTool('fetch_release_asset',{description:'Fetch a GitHub release asset, returning bounded base64 bytes and SHA-256 (not yet a ChatGPT internal attachment)',inputSchema:z.object({repository:z.string(),tag:z.string(),assetName:z.string()})},async({repository,tag,assetName})=>({content:[{type:'text',text:JSON.stringify(await releases.fetch(user,repository,tag,assetName))}]}));
  }
  return server;
 });
 return toNodeHandler(handler);
}
function json(res:http.ServerResponse,status:number,data:unknown){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));}
export function createServer(options:{database?:DatabaseProbe;oauth?:OAuth;identity?:GitHubIdentity}={}){
 const identity=options.identity??(process.env.DATABASE_URL&&process.env.PUBLIC_BASE_URL&&process.env.GITHUB_APP_CLIENT_ID&&process.env.GITHUB_APP_CLIENT_SECRET&&process.env.ENCRYPTION_KEY?new GitHubIdentity({pool:new Pool({connectionString:process.env.DATABASE_URL,max:5}),clientId:process.env.GITHUB_APP_CLIENT_ID,clientSecret:process.env.GITHUB_APP_CLIENT_SECRET,publicBaseUrl:process.env.PUBLIC_BASE_URL,encryptionKey:Buffer.from(process.env.ENCRYPTION_KEY,'base64')}):undefined);
 const oauth=options.oauth??(process.env.DATABASE_URL&&process.env.PUBLIC_BASE_URL?new OAuth({issuer:process.env.PUBLIC_BASE_URL,pool:new Pool({connectionString:process.env.DATABASE_URL,max:5}),principal:identity?req=>identity.principal(req):async()=>null}):undefined);
 const database=options.database??(process.env.DATABASE_URL?createDatabaseProbe(process.env.DATABASE_URL):undefined);
 return http.createServer(async(req,res)=>{
  const path=new URL(req.url??'/','http://localhost').pathname;
  if(req.method==='GET'&&path==='/health')return json(res,200,{status:'ok',version:'0.3.0-dev003'});
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
   res.writeHead(401,{'content-type':'application/json','WWW-Authenticate':`Bearer resource_metadata="${oauth?.issuer??'https://localhost'}/.well-known/oauth-protected-resource/mcp"`});res.end(JSON.stringify({error:'unauthorized'}));return;
  }
  try{await mcpHandler(subject,identity)(req,res);}catch{if(!res.headersSent)json(res,500,{error:'MCP_REQUEST_FAILED'});else res.end();}
 });
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 if(!process.env.DATABASE_URL||!process.env.PUBLIC_BASE_URL)throw new Error('DATABASE_URL and PUBLIC_BASE_URL required');
 createServer().listen(Number(process.env.PORT??3000),'0.0.0.0');
}

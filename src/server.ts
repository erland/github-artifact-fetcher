/** MCP transport and PostgreSQL readiness. GitHub fetching is deferred until DEV-006. */
import http from 'node:http';
import {createMcpHandler, McpServer} from '@modelcontextprotocol/server';
import {toNodeHandler} from '@modelcontextprotocol/node';
import {createDatabaseProbe, type DatabaseProbe} from './database.js';
const handler=createMcpHandler(()=>{
 const server=new McpServer({name:'github-artifact-fetcher',version:'0.3.0-dev003'},{capabilities:{tools:{}}});
 server.registerTool('get_capabilities',{description:'Current supported sources',annotations:{readOnlyHint:true,openWorldHint:false},inputSchema:undefined},async()=>({
  content:[{type:'text',text:JSON.stringify({release:false,actions:false,repository:false,packages:false,liveChatGptHandoff:false})}]
 }));
 return server;
});
const nodeHandler=toNodeHandler(handler);
function json(res:http.ServerResponse,status:number,data:unknown){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));}
export function createServer(options:{database?:DatabaseProbe}={}){
 const database=options.database??(process.env.DATABASE_URL?createDatabaseProbe(process.env.DATABASE_URL):undefined);
 return http.createServer(async(req,res)=>{
  const path=new URL(req.url??'/','http://localhost').pathname;
  if(req.method==='GET'&&path==='/health')return json(res,200,{status:'ok',version:'0.3.0-dev003'});
  if(req.method==='GET'&&path==='/ready'){
   const ok=database?await database.ready():false;
   return json(res,ok?200:503,{status:ok?'ready':'not_ready',database:ok});
  }
  if(path!=='/mcp')return json(res,404,{error:'NOT_FOUND'});
  try{await nodeHandler(req,res);}catch{if(!res.headersSent)json(res,500,{error:'MCP_REQUEST_FAILED'});else res.end();}
 });
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');
 createServer().listen(Number(process.env.PORT??3000),'0.0.0.0');
}

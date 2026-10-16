/** DEV-002 official MCP SDK transport. GitHub downloads are intentionally disabled until later steps. */
import http from 'node:http';
import {createMcpHandler, McpServer} from '@modelcontextprotocol/server';
import {toNodeHandler} from '@modelcontextprotocol/node';

const handler = createMcpHandler(() => {
  const server = new McpServer({name:'github-artifact-fetcher',version:'0.2.0-dev002'}, {capabilities:{tools:{}}});
  server.registerTool('get_capabilities', {
    description:'Report implemented GitHub artifact fetch capabilities (none in DEV-002).',
    annotations:{readOnlyHint:true,openWorldHint:false},
    inputSchema: undefined
  }, async () => ({
    content:[{type:'text',text:JSON.stringify({release:false,actions:false,repository:false,packages:false,liveChatGptHandoff:false})}]
  }));
  return server;
});
const nodeHandler = toNodeHandler(handler);
function json(res:http.ServerResponse, status:number, value:unknown) {
 res.writeHead(status, {'content-type':'application/json','cache-control':'no-store'});
 res.end(JSON.stringify(value));
}
export function createServer() {
 return http.createServer(async (req,res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  if(req.method==='GET' && path==='/health') return json(res,200,{status:'ok',version:'0.2.0-dev002'});
  if(req.method==='GET' && path==='/ready') return json(res,200,{status:'ok',mode:'skeleton',githubEnabled:false});
  if(path!=='/mcp') return json(res,404,{error:'NOT_FOUND'});
  try { await nodeHandler(req,res); } catch(e) {
   if(!res.headersSent) json(res,500,{error:'MCP_REQUEST_FAILED'});
   else res.end();
  }
 });
}
if(process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href) {
 createServer().listen(Number(process.env.PORT??3000),'0.0.0.0');
}

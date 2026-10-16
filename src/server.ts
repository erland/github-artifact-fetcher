/** DEV-002 baseline: minimal stateless MCP transport, no external GitHub reads until DEV-006. */
import http from 'node:http';
import { parseArtifactRequest } from './contracts.js';
const send = (res: http.ServerResponse, code: number, data: unknown) => {res.writeHead(code, {'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
export function createServer() {
 return http.createServer(async(req,res)=>{
  const pathname=new URL(req.url??'/', 'http://localhost').pathname;
  if (req.method==='GET' && pathname==='/health') return send(res,200,{status:'ok',version:'0.2.0-dev002'});
  if (req.method==='GET' && pathname==='/ready') return send(res,200,{status:'ok',mode:'skeleton',githubEnabled:false});
  if (req.method!=='POST'||pathname!=='/mcp') return send(res,404,{error:'NOT_FOUND'});
  let body='';for await(const chunk of req){body+=chunk;if(body.length>65536)return send(res,413,{error:'REQUEST_TOO_LARGE'});}
  let msg: any;try{msg=JSON.parse(body);}catch{return send(res,400,{jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}});}
  const ok=(result:unknown)=>send(res,200,{jsonrpc:'2.0',id:msg.id??null,result});
  if(msg.method==='initialize')return ok({protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'github-artifact-fetcher',version:'0.2.0-dev002'}});
  if(msg.method==='notifications/initialized'){res.writeHead(202);return res.end();}
  if(msg.method==='ping')return ok({});
  if(msg.method==='tools/list')return ok({tools:[{name:'get_capabilities',description:'Report implementation readiness. No GitHub artifact downloads before DEV-006.',inputSchema:{type:'object',properties:{},additionalProperties:false}}]});
  if(msg.method==='tools/call'&&msg.params?.name==='get_capabilities')return ok({content:[{type:'text',text:JSON.stringify({release:false,actions:false,repository:false,packages:false,liveChatGptHandoff:false})}]});
  return send(res,200,{jsonrpc:'2.0',id:msg.id??null,error:{code:-32601,message:'Method not found'}});
 });
}
if(process.argv[1] && import.meta.url===new URL('file://'+process.argv[1]).href){const port=Number(process.env.PORT??3000);createServer().listen(port,'0.0.0.0');}

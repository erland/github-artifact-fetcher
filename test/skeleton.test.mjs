import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../dist/server.js';
import {parseArtifactRequest} from '../dist/contracts.js';
test('artifact contract validates repository',()=>{assert.equal(parseArtifactRequest({source:'release',repository:'example/repo',selector:'v1'}).source,'release');assert.throws(()=>parseArtifactRequest({source:'release',repository:'../../etc',selector:'x'}));});
test('official MCP SDK contract',async()=>{
 const server=createServer({database:{ready:async()=>true,close:async()=>{}}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const url='http://127.0.0.1:'+server.address().port;
  assert.equal((await fetch(url+'/ready')).status,200);
  const call=async(method,params)=>{
   const r=await fetch(url+'/mcp',{method:'POST',headers:{'content-type':'application/json','accept':'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
   assert.equal(r.status,200);
   const text=await r.text();
   return JSON.parse(text.startsWith('data:')?text.split('\n').find(s=>s.startsWith('data:')).slice(5).trim():text);
  };
  assert.equal((await call('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'ci',version:'1'}})).result.serverInfo.name,'github-artifact-fetcher');
  assert.equal((await call('tools/list',{})).result.tools[0].name,'get_capabilities');
 }finally{await new Promise(resolve=>server.close(resolve));}
});

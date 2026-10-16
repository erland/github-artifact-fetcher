import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../dist/server.js';
import {parseArtifactRequest} from '../dist/contracts.js';

test('artifact contract validates repository',()=>{
 assert.equal(parseArtifactRequest({source:'release',repository:'example/repo',selector:'v1'}).source,'release');
 assert.throws(()=>parseArtifactRequest({source:'release',repository:'../../etc',selector:'x'}));
});

test('MCP SDK requires a valid transport and exposes readiness', async()=>{
 const server=createServer({database:{ready:async()=>true,close:async()=>{}},oauth:{handle:async()=>false,authenticate:async()=>true}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const controller=new AbortController();
 try {
  const url='http://127.0.0.1:'+server.address().port;
  assert.equal((await fetch(url+'/ready',{signal:AbortSignal.timeout(3000)})).status,200);
  const response=await fetch(url+'/mcp',{
   method:'POST',
   signal:controller.signal,
   headers:{'content-type':'application/json','accept':'application/json, text/event-stream','mcp-protocol-version':'2025-06-18'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'ci',version:'1'}}})
  });
  assert.equal(response.status,200);
 } finally {
  controller.abort();
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
 }
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../dist/server.js';
import {parseArtifactRequest} from '../dist/contracts.js';
test('artifact contract validates repository inputs',()=>{
 assert.equal(parseArtifactRequest({source:'release',repository:'example/repo',selector:'v1'}).source,'release');
 assert.throws(()=>parseArtifactRequest({source:'release',repository:'../../etc',selector:'x'}));
});
test('official MCP SDK initializes and declares truthful capabilities',async()=>{
 const server=createServer();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  const port=server.address().port, url=`http://127.0.0.1:${port}`;
  const health=await fetch(url+'/health').then(r=>r.json());
  assert.equal(health.status,'ok');
  const call=async(method,params)=> {
   const response=await fetch(url+'/mcp',{method:'POST',headers:{
    'content-type':'application/json','accept':'application/json, text/event-stream',
    'mcp-protocol-version':'2025-06-18'
   },body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
   assert.equal(response.status,200);
   const body=await response.text();
   if(body.startsWith('event:') || body.startsWith('data:')) {
    const data=body.split('\n').find(l=>l.startsWith('data:'));
    return JSON.parse(data.slice(5).trim());
   }
   return JSON.parse(body);
  };
  const initialized=await call('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'dev002-test',version:'1.0.0'}});
  assert.equal(initialized.result.serverInfo.name,'github-artifact-fetcher');
  const listed=await call('tools/list',{});
  assert.equal(listed.result.tools[0].name,'get_capabilities');
  const result=await call('tools/call',{name:'get_capabilities',arguments:{}});
  assert.match(result.result.content[0].text,/"release":false/);
 } finally {await new Promise(resolve=>server.close(resolve));}
});

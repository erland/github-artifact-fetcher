import {test} from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { makeServer } from '../poc/server.mjs';

const secret='test-secret-is-very-long-and-safe-123';
async function fixture(t) {
 const server=makeServer({port:0,secret});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const rpc=async(method,params={})=>(await (await fetch(`${origin}/mcp`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',method,id:1,params})})).json()).result;
 return {origin,rpc};
}
test('MCP initialize and tools/list',async t=>{const {rpc}=await fixture(t);const init=await rpc('initialize');assert.equal(init.serverInfo.name,'github-artifact-fetcher-poc');assert.equal((await rpc('tools/list')).tools[0].name,'poc_fetch_fixture');});
for(const name of ['sample.epub','sample.pdf','sample.zip']) test(`binary roundtrip ${name}`,async t=>{const {rpc}=await fixture(t);const result=await rpc('tools/call',{name:'poc_fetch_fixture',arguments:{name}});assert.equal(result.content[1].type,'resource_link');const response=await fetch(result.content[1].uri);assert.equal(response.status,200);const buffer=Buffer.from(await response.arrayBuffer());assert.equal(createHash('sha256').update(buffer).digest('hex'),result.structuredContent.sha256);assert.ok(buffer.length>0);});
test('signed downloads reject tampered links and invalid filename',async t=>{const {rpc,origin}=await fixture(t);const result=await rpc('tools/call',{name:'poc_fetch_fixture',arguments:{name:'sample.epub'}});const link=new URL(result.content[1].uri);link.searchParams.set('sig','0'.repeat(64));assert.equal((await fetch(link)).status,403);assert.equal((await fetch(`${origin}/files/../secret`)).status,404);});
test('unknown fixture rejected',async t=>{const {rpc}=await fixture(t);const result=await rpc('tools/call',{name:'poc_fetch_fixture',arguments:{name:'bad.zip'}});assert.equal(result.isError,true);});

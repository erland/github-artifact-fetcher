import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../dist/server.js';

async function withServer(run){
 const server=createServer({database:{ready:async()=>true,close:async()=>{}}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{await run('http://127.0.0.1:'+server.address().port);}
 finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}

test('default download CORS denies foreign origins and permits known sandbox',async()=>{
 const previous=process.env.WIDGET_DOWNLOAD_CORS_ANY_ORIGIN;
 delete process.env.WIDGET_DOWNLOAD_CORS_ANY_ORIGIN;
 try{
  await withServer(async base=>{
   const foreign=await fetch(base+'/downloads/invalid',{method:'OPTIONS',headers:{origin:'https://example.net'}});
   assert.equal(foreign.status,403);
   assert.equal(foreign.headers.get('access-control-allow-origin'),null);
   const sandbox=await fetch(base+'/downloads/invalid',{method:'OPTIONS',headers:{origin:'https://web-sandbox.oaiusercontent.com'}});
   assert.equal(sandbox.status,204);
   assert.equal(sandbox.headers.get('access-control-allow-origin'),'https://web-sandbox.oaiusercontent.com');
  });
 }finally{
  if(previous===undefined)delete process.env.WIDGET_DOWNLOAD_CORS_ANY_ORIGIN;
  else process.env.WIDGET_DOWNLOAD_CORS_ANY_ORIGIN=previous;
 }
});

test('diagnostic wildcard CORS is opt-in and scoped to downloads only',async()=>{
 const previous=process.env.WIDGET_DOWNLOAD_CORS_ANY_ORIGIN;
 process.env.WIDGET_DOWNLOAD_CORS_ANY_ORIGIN='true';
 try{
  await withServer(async base=>{
   const headers={origin:'https://other.example'};
   const response=await fetch(base+'/downloads/invalid',{headers});
   assert.equal(response.status,404);
   assert.equal(response.headers.get('access-control-allow-origin'),'*');
   assert.equal(response.headers.get('access-control-allow-credentials'),null);
   const preflight=await fetch(base+'/downloads/invalid',{method:'OPTIONS',headers});
   assert.equal(preflight.status,204);
   assert.equal(preflight.headers.get('access-control-allow-origin'),'*');
   const unrelated=await fetch(base+'/health',{headers});
   assert.equal(unrelated.headers.get('access-control-allow-origin'),null);
  });
 }finally{
  if(previous===undefined)delete process.env.WIDGET_DOWNLOAD_CORS_ANY_ORIGIN;
  else process.env.WIDGET_DOWNLOAD_CORS_ANY_ORIGIN=previous;
 }
});

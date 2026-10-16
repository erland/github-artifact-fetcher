import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safeDownloadRedirect,safeContentLength,safeResponseStatus,FixedWindowLimiter} from '../dist/security.js';
import {createServer} from '../dist/server.js';

test('redirect rejects SSRF, credentials, ports, fragments and lookalike hosts',()=>{
 const denied=['http://codeload.github.com/a','https://127.0.0.1/a','https://localhost/a','https://codeload.github.com.evil.test/a','https://u:p@codeload.github.com/a','https://codeload.github.com:444/a','https://codeload.github.com/a#secret','file:///etc/passwd'];
 for(const value of denied)assert.throws(()=>safeDownloadRedirect(value),/UNTRUSTED_REDIRECT/,value);
 assert.equal(safeDownloadRedirect('https://codeload.github.com/a'),'https://codeload.github.com/a');
});
test('invalid Content-Length values fail closed',()=>{
 for(const value of ['NaN','Infinity','-1','2e30','100000000000000000000','20971521','1.5'])assert.throws(()=>safeContentLength(value),/DOWNLOAD_TOO_LARGE/);
 assert.doesNotThrow(()=>safeContentLength(null));
});
test('download fails on disguised HTML and redirect responses',()=>{
 assert.throws(()=>safeResponseStatus(new Response('login',{headers:{'content-type':'text/html'}})),/DOWNLOAD_REJECTED/);
 assert.throws(()=>safeResponseStatus(new Response(null,{status:302})),/DOWNLOAD_REJECTED/);
});
test('fixed window limits repeated requests and resets without mixing identities',()=>{
 let now=0;const limiter=new FixedWindowLimiter(2,1000,()=>now);
 assert.equal(limiter.allow('a'),true);assert.equal(limiter.allow('a'),true);assert.equal(limiter.allow('a'),false);
 assert.equal(limiter.allow('b'),true);now=1001;assert.equal(limiter.allow('a'),true);
});
test('server has security headers and rejects excessive unauthenticated attempts',async()=>{
 const server=createServer({database:{ready:async()=>true,close:async()=>{}},oauth:{issuer:'https://example.test',handle:async()=>false,subject:async()=>null}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const base='http://127.0.0.1:'+server.address().port;
  const first=await fetch(base+'/mcp',{method:'POST'});
  assert.equal(first.status,401);
  assert.equal(first.headers.get('x-content-type-options'),'nosniff');
  assert.equal(first.headers.get('referrer-policy'),'no-referrer');
  for(let i=0;i<120;i++)await fetch(base+'/health');
  const last=await fetch(base+'/health');
  assert.equal(last.status,429);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Pool} from 'pg';
import {OAuth} from '../dist/oauth.js';
import {createServer} from '../dist/server.js';

test('OAuth discovery, PKCE, protected MCP, refresh rotation and replay denial', {skip:!process.env.TEST_DATABASE_URL},async()=>{
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
 const issuer='https://artifact.example.test';
 const oauth=new OAuth({issuer,pool,principal:async()=> 'test-github-subject'});
 const server=createServer({database:{ready:async()=>true,close:async()=>{}},oauth});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try{
  const base='http://127.0.0.1:'+server.address().port;
  const protectedResponse=await fetch(base+'/mcp',{method:'POST'});
  assert.equal(protectedResponse.status,401);
  assert.match(protectedResponse.headers.get('www-authenticate'),/oauth-protected-resource/);
  const metadata=await fetch(base+'/.well-known/oauth-authorization-server').then(r=>r.json());
  assert.equal(metadata.issuer,issuer);
  assert.deepEqual(metadata.code_challenge_methods_supported,['S256']);
  const redirect='https://client.example.test/callback';
  const clientResponse=await fetch(base+'/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({redirect_uris:[redirect]})});
  assert.equal(clientResponse.status,201);
  const {client_id}=await clientResponse.json();
  const verifier='a'.repeat(43),challenge=createHash('sha256').update(verifier).digest('base64url');
  const authorize=new URL(base+'/authorize');
  for(const [k,v] of Object.entries({client_id,redirect_uri:redirect,response_type:'code',code_challenge_method:'S256',code_challenge:challenge,scope:'mcp',resource:issuer+'/mcp',state:'teststate123'}))authorize.searchParams.set(k,v);
  const authResponse=await fetch(authorize,{redirect:'manual'});
  assert.equal(authResponse.status,200);
  const consentCookie=authResponse.headers.get('set-cookie').split(';')[0];
  const csrf=consentCookie.split('=')[1];
  const fields=new URLSearchParams(authorize.searchParams);
  fields.set('csrf',csrf);fields.set('decision','approve');
  const denied=await fetch(base+'/authorize',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:fields});
  assert.equal(denied.status,403);
  const approved=await fetch(base+'/authorize',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',cookie:consentCookie},body:fields,redirect:'manual'});
  assert.equal(approved.status,302);
  const callback=new URL(approved.headers.get('location'));
  assert.equal(callback.searchParams.get('state'),'teststate123');
  const code=callback.searchParams.get('code');
  const exchange=async(verifierValue)=>fetch(base+'/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id,code,redirect_uri:redirect,code_verifier:verifierValue})});
  assert.equal((await exchange('b'.repeat(43))).status,400);
  const response=await exchange(verifier);
  assert.equal(response.status,200);
  const first=await response.json();
  assert.equal((await exchange(verifier)).status,400);
  assert.equal(await oauth.authenticate({headers:{authorization:'Bearer '+first.access_token}}),true);
  assert.equal(await oauth.authenticate({headers:{authorization:'Bearer invalid'}}),false);
  const renew=()=>fetch(base+'/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id,refresh_token:first.refresh_token})});
  assert.equal((await renew()).status,200);
  assert.equal((await renew()).status,400);
  assert.equal((await fetch(base+'/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({redirect_uris:['https://example.test.evil.com/cb#fragment']})})).status,400);
 }finally{
  await new Promise(ok=>server.close(ok));await pool.end();
 }
});

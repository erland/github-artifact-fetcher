import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import {GitHubIdentity} from '../dist/github-identity.js';
import {createServer} from '../dist/server.js';
const config={clientId:'test-id',clientSecret:'test-secret',publicBaseUrl:'https://artifact.example.test',encryptionKey:randomBytes(32)};
test('GitHub App OAuth state, encrypted tokens, refresh rotation and repository permission', {skip:!process.env.TEST_DATABASE_URL},async()=>{
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
 let refreshed=0, repoCalls=0;
 const fetcher=async(url,options)=>{
  if(url.includes('/login/oauth/access_token')){
   const body=JSON.parse(options.body);
   if(body.grant_type==='refresh_token'){refreshed++;return new Response(JSON.stringify({access_token:'rotated-access',refresh_token:'rotated-refresh',expires_in:28800,refresh_token_expires_in:15552000}),{status:200});}
   return new Response(JSON.stringify({access_token:'original-access',refresh_token:'original-refresh',expires_in:1,refresh_token_expires_in:15552000}),{status:200});
  }
  if(url.endsWith('/user'))return new Response(JSON.stringify({id:123456}),{status:200});
  if(url.includes('/user/installations/1/repositories'))return new Response(JSON.stringify({repositories:[{id:900,full_name:'erland/allowed',permissions:{pull:true}}]}));
  if(url.includes('/user/installations?'))return new Response(JSON.stringify({installations:[{id:1,suspended_at:null,permissions:{contents:'read'}}]}));
  if(url.includes('/repos/')){repoCalls++;return new Response(JSON.stringify({id:900,full_name:'erland/allowed'}),{status:url.endsWith('/allowed')?200:404});}
  throw Error('unrecognized mock');
 };
 const identity=new GitHubIdentity({...config,pool,fetcher});
 const server=createServer({database:{ready:async()=>true,close:async()=>{}},identity,oauth:{issuer:config.publicBaseUrl,handle:async()=>false,authenticate:async()=>false}});
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 try{
  const base='http://127.0.0.1:'+server.address().port;
  const start=await fetch(base+'/auth/github/start',{redirect:'manual'});
  assert.equal(start.status,302);
  const cookie=start.headers.get('set-cookie').split(';')[0];
  const target=new URL(start.headers.get('location'));
  assert.equal(target.hostname,'github.com');
  const state=target.searchParams.get('state');
  let r=await fetch(base+'/auth/github/callback?code=abc&state=wrong',{headers:{cookie},redirect:'manual'});
  assert.equal(r.status,400);
  r=await fetch(base+'/auth/github/callback?code=abc&state='+encodeURIComponent(state),{headers:{cookie},redirect:'manual'});
  assert.equal(r.status,302);
  const session=r.headers.get('set-cookie').match(/ghaf_session=([^;]+)/)[1];
  assert.equal(await identity.principal({headers:{cookie:'ghaf_session='+session}}),'github:123456');
  const rows=await pool.query("SELECT encrypted_token FROM github_connections WHERE user_subject='github:123456'");
  assert.equal(rows.rowCount,1);
  assert.equal(rows.rows[0].encrypted_token.includes(Buffer.from('original-access')),false);
  assert.equal(await identity.repositoryAllowed('github:123456','erland','allowed'),true);
  assert.equal(await identity.repositoryAllowed('github:123456','erland','denied'),false);
  assert.equal(refreshed,1);
  // Each repository lookup checks public visibility without credentials before
  // falling back to GitHub App installation permissions for private access.
  assert.equal(repoCalls,4);
  assert.equal(await identity.repositoryAllowed('github:123456','../evil','allowed'),false);
  assert.equal(await identity.repositoryAllowed('github:other','erland','allowed'),false);
  assert.equal(await identity.tokenFor('nonexistent'),null);
  const replay=await fetch(base+'/auth/github/callback?code=abc&state='+encodeURIComponent(state),{headers:{cookie},redirect:'manual'});
  assert.equal(replay.status,400);
  const logout=await fetch(base+'/auth/logout',{method:'POST',headers:{cookie:'ghaf_session='+session}});
  assert.equal(logout.status,204);
  assert.equal(await identity.principal({headers:{cookie:'ghaf_session='+session}}),null);
 }finally{server.closeAllConnections();await new Promise(ok=>server.close(ok));await pool.end();}
});

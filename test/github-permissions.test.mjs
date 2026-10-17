import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {randomBytes} from 'node:crypto';
import {GitHubIdentity} from '../dist/github-identity.js';
test('GitHub revocation invalidates one principal without revoking another', {skip:!process.env.TEST_DATABASE_URL}, async()=>{
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
 const owner='github:revoked-test',other='github:unrelated-test';
 for(const user of [owner,other]){
  await pool.query("INSERT INTO github_connections(id,user_subject,encrypted_token,token_expires_at) VALUES(gen_random_uuid(),$1,$2,NOW()+interval '1 day') ON CONFLICT(user_subject) DO UPDATE SET encrypted_token=EXCLUDED.encrypted_token,token_expires_at=EXCLUDED.token_expires_at",[user,Buffer.from('encrypted-fixture')]);
 }
 const identity=new GitHubIdentity({pool,clientId:'test',clientSecret:'secret',publicBaseUrl:'https://example.test',encryptionKey:randomBytes(32),fetcher:async()=>new Response('{}',{status:401})});
 try {
  await identity.revokeLocal(owner);
  assert.equal((await pool.query('SELECT 1 FROM github_connections WHERE user_subject=$1',[owner])).rowCount,0);
  assert.equal((await pool.query('SELECT 1 FROM github_connections WHERE user_subject=$1',[other])).rowCount,1);
 }finally{
  await pool.query('DELETE FROM github_connections WHERE user_subject=$1',[other]);await pool.end();
 }
});
test('permission denied without installation, suspended installation, repository membership or read scope',async()=>{
 const calls=[];
 const fake={tokenFor:async()=> 'user-token'};
 const identity=new GitHubIdentity({pool:{},clientId:'test',clientSecret:'secret',publicBaseUrl:'https://example.test',encryptionKey:randomBytes(32),fetcher:async(url)=>{
  calls.push(url);
  if(url.includes('/repos/org/project'))return new Response(JSON.stringify({id:123,full_name:'org/project'}));
  if(url.includes('/user/installations?'))return new Response(JSON.stringify({installations:[{id:1,permissions:{contents:'read'},suspended_at:'2026-01-01'}]}));
  throw Error('unexpected');
 }});
 identity.tokenFor=fake.tokenFor;
 assert.equal(await identity.repositoryAllowed('github:one','org','project'),false);
 assert.equal(calls.some(x=>x.includes('/user/installations/1/repositories')),false);
});

test('GitHub 401 automatically revokes only the affected user', {skip:!process.env.TEST_DATABASE_URL},async()=>{
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
 const subject='github:401-test',other='github:401-other';
 try{
  for(const user of [subject,other])await pool.query("INSERT INTO github_connections(id,user_subject,encrypted_token,token_expires_at) VALUES(gen_random_uuid(),$1,$2,NOW()+interval '1 day') ON CONFLICT(user_subject) DO UPDATE SET encrypted_token=EXCLUDED.encrypted_token,token_expires_at=EXCLUDED.token_expires_at",[user,Buffer.from('fixture')]);
  const identity=new GitHubIdentity({pool,clientId:'test',clientSecret:'secret',publicBaseUrl:'https://example.test',encryptionKey:randomBytes(32),fetcher:async()=>new Response('{}',{status:401})});
  identity.tokenFor=async()=> 'stale-user-token';
  assert.equal(await identity.repositoryAllowed(subject,'org','repo'),false);
  assert.equal((await pool.query('SELECT 1 FROM github_connections WHERE user_subject=$1',[subject])).rowCount,0);
  assert.equal((await pool.query('SELECT 1 FROM github_connections WHERE user_subject=$1',[other])).rowCount,1);
 }finally{
  await pool.query('DELETE FROM github_connections WHERE user_subject = ANY($1)',[[subject,other]]);
  await pool.end();
 }
});

test('permanently rejected refresh token removes only the affected connection', {skip:!process.env.TEST_DATABASE_URL},async()=>{
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
 const user='github:refresh-reject-test',other='github:refresh-untouched';
 const key=randomBytes(32);
 const identity=new GitHubIdentity({pool,clientId:'test',clientSecret:'secret',publicBaseUrl:'https://example.test',encryptionKey:key,fetcher:async()=>new Response(JSON.stringify({error:'bad_verification_code'}),{status:401})});
 try{
  for(const subject of [user,other])await pool.query("INSERT INTO github_connections(id,user_subject,encrypted_token,encrypted_refresh_token,token_expires_at,refresh_expires_at) VALUES(gen_random_uuid(),$1,$2,$3,NOW()-interval '1 day',NOW()+interval '1 day') ON CONFLICT(user_subject) DO UPDATE SET encrypted_token=EXCLUDED.encrypted_token,encrypted_refresh_token=EXCLUDED.encrypted_refresh_token,token_expires_at=EXCLUDED.token_expires_at,refresh_expires_at=EXCLUDED.refresh_expires_at",[subject,Buffer.from('unused'),identity.enc('expired-refresh')]);
  assert.equal(await identity.tokenFor(user),null);
  assert.equal((await pool.query('SELECT 1 FROM github_connections WHERE user_subject=$1',[user])).rowCount,0);
  assert.equal((await pool.query('SELECT 1 FROM github_connections WHERE user_subject=$1',[other])).rowCount,1);
 }finally{
  await pool.query('DELETE FROM github_connections WHERE user_subject = ANY($1)',[[user,other]]);
  await pool.end();
 }
});


test('public repository works without installation but private repository retains installation restriction',async()=>{
 const calls=[];
 const identity=new GitHubIdentity({pool:{},clientId:'test',clientSecret:'secret',publicBaseUrl:'https://example.test',encryptionKey:randomBytes(32),fetcher:async(url,options)=>{
  calls.push({url,auth:options?.headers?.authorization});
  if(url.endsWith('/repos/public-owner/public-repo'))return new Response(JSON.stringify({id:501,full_name:'public-owner/public-repo',private:false}));
  if(url.endsWith('/repos/private-owner/private-repo'))return new Response(JSON.stringify({id:502,full_name:'private-owner/private-repo',private:true}));
  if(url.includes('/user/installations?'))return new Response(JSON.stringify({installations:[]}));
  throw Error('unexpected '+url);
 }});
 identity.tokenFor=async()=> 'user-token';
 assert.equal(await identity.repositoryAllowed('github:one','public-owner','public-repo'),true);
 assert.equal(await identity.repositoryAllowed('github:one','private-owner','private-repo'),false);
 assert.equal(calls.filter(x=>x.url.includes('/repos/public-owner/public-repo')&&!x.auth).length,1);
 assert.equal(await identity.publicRepository('private-owner','private-repo'),false);
});

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

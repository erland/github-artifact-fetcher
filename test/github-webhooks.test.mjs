import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {Pool} from 'pg';
import {GitHubWebhooks} from '../dist/github-webhooks.js';
const secret='ci-secret';
test('signed webhook rejects invalid signature, revokes linked installation and blocks replay', {skip:!process.env.TEST_DATABASE_URL},async()=>{
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
 const user='github:webhook-test',other='github:webhook-other',installation=987654;
 const mk=async(subject)=>pool.query("INSERT INTO github_connections(id,user_subject,encrypted_token,token_expires_at) VALUES(gen_random_uuid(),$1,$2,NOW()+interval '1 day') ON CONFLICT(user_subject) DO UPDATE SET encrypted_token=EXCLUDED.encrypted_token,token_expires_at=EXCLUDED.token_expires_at",[subject,Buffer.from('fixture')]);
 await mk(user);await mk(other);
 await pool.query('INSERT INTO github_installation_users(installation_id,user_subject) VALUES($1,$2) ON CONFLICT DO NOTHING',[installation,user]);
 const webhook=new GitHubWebhooks(pool,secret);
 const body=Buffer.from(JSON.stringify({action:'deleted',installation:{id:installation}}));
 const sig='sha256='+createHmac('sha256',secret).update(body).digest('hex');
 let seq=0;
 const send=async(signature)=>new Promise(async(resolve)=>{
  const {Readable}=await import('node:stream');
  const req=Readable.from([body]);req.headers={'x-hub-signature-256':signature,'x-github-event':'installation','x-github-delivery':(++seq).toString(16).padStart(8,'0')+'-1111-4111-8111-111111111111'};
  const res={writeHead(s){this.status=s;},end(){resolve(this.status);}};
  await webhook.handle(req,res);
 });
 try{
  assert.equal(await send('sha256='+'0'.repeat(64)),401);
  assert.equal((await pool.query('SELECT 1 FROM github_connections WHERE user_subject=$1',[user])).rowCount,1);
  assert.equal(await send(sig),204);
  assert.equal((await pool.query('SELECT 1 FROM github_connections WHERE user_subject=$1',[user])).rowCount,0);
  assert.equal((await pool.query('SELECT 1 FROM github_connections WHERE user_subject=$1',[other])).rowCount,1);
 }finally{await pool.query('DELETE FROM github_connections WHERE user_subject=$1',[other]);await pool.end();}
});

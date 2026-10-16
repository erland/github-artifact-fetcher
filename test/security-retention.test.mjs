import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {SecurityRetention} from '../dist/security-retention.js';

test('retention removes only expired records and old replay entries, in bounded batches',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
 const user='retention-'+randomUUID();
 const old=randomUUID(),recent=randomUUID();
 try{
  await pool.query("INSERT INTO github_webhook_deliveries(delivery_id,received_at) VALUES($1,NOW()-INTERVAL '40 days'),($2,NOW())",[old,recent]);
  const clients=await pool.query("INSERT INTO mcp_oauth_clients(client_id,redirect_uris) VALUES($1,$2) RETURNING client_id",['retention-'+randomUUID(),JSON.stringify(['https://example.test/cb'])]);
  const client=clients.rows[0].client_id;
  const oldHash=randomUUID(),activeHash=randomUUID();
  await pool.query("INSERT INTO mcp_oauth_grants(grant_hash,kind,client_id,user_subject,scope,resource,expires_at) VALUES($1,'access',$3,$4,'mcp','https://example.test/mcp',NOW()-INTERVAL '1 minute'),($2,'access',$3,$4,'mcp','https://example.test/mcp',NOW()+INTERVAL '1 day')",[oldHash,activeHash,client,user]);
  const cleanup=new SecurityRetention(pool);
  assert.rejects(()=>cleanup.prune(0),/INVALID_RETENTION_BATCH/);
  const first=await cleanup.prune(1);
  assert.equal(first.webhookDeliveries,1);
  assert.equal(first.oauthGrants,1);
  assert.equal((await pool.query('SELECT 1 FROM github_webhook_deliveries WHERE delivery_id=$1',[recent])).rowCount,1);
  assert.equal((await pool.query('SELECT 1 FROM github_webhook_deliveries WHERE delivery_id=$1',[old])).rowCount,0);
  assert.equal((await pool.query('SELECT 1 FROM mcp_oauth_grants WHERE grant_hash=$1',[activeHash])).rowCount,1);
  const second=await cleanup.prune(1);
  assert.equal(second.webhookDeliveries,0);assert.equal(second.oauthGrants,0);
  await pool.query('DELETE FROM mcp_oauth_grants WHERE grant_hash=$1',[activeHash]);
  await pool.query('DELETE FROM mcp_oauth_clients WHERE client_id=$1',[client]);
 }finally{
  await pool.query('DELETE FROM github_webhook_deliveries WHERE delivery_id=$1',[recent]);
  await pool.end();
 }
});

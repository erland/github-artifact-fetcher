import {Pool} from 'pg';
export type RetentionResult={webhookDeliveries:number;oauthSessions:number;githubAttempts:number;oauthConsent:number;oauthGrants:number};
export class SecurityRetention {
 constructor(private readonly pool:Pool){}
 async prune(batch=500):Promise<RetentionResult>{
  if(!Number.isSafeInteger(batch)||batch<1||batch>1000)throw Error('INVALID_RETENTION_BATCH');
  const connection=await this.pool.connect();
  try{
   await connection.query('BEGIN');
   // Keep webhook delivery IDs for 30 days to reject delayed/replayed deliveries.
   const webhookDeliveries=await connection.query('DELETE FROM github_webhook_deliveries WHERE delivery_id IN (SELECT delivery_id FROM github_webhook_deliveries WHERE received_at < NOW() - INTERVAL \'30 days\' ORDER BY received_at LIMIT $1)',[batch]);
   const oauthSessions=await connection.query('DELETE FROM oauth_sessions WHERE id IN (SELECT id FROM oauth_sessions WHERE expires_at < NOW() ORDER BY expires_at LIMIT $1)',[batch]);
   const githubAttempts=await connection.query('DELETE FROM github_oauth_attempts WHERE state_hash IN (SELECT state_hash FROM github_oauth_attempts WHERE expires_at < NOW() ORDER BY expires_at LIMIT $1)',[batch]);
   const oauthConsent=await connection.query('DELETE FROM mcp_oauth_consent_requests WHERE request_hash IN (SELECT request_hash FROM mcp_oauth_consent_requests WHERE expires_at < NOW() ORDER BY expires_at LIMIT $1)',[batch]);
   const oauthGrants=await connection.query('DELETE FROM mcp_oauth_grants WHERE grant_hash IN (SELECT grant_hash FROM mcp_oauth_grants WHERE expires_at < NOW() ORDER BY expires_at LIMIT $1)',[batch]);
   await connection.query('COMMIT');
   return {webhookDeliveries:webhookDeliveries.rowCount??0,oauthSessions:oauthSessions.rowCount??0,githubAttempts:githubAttempts.rowCount??0,oauthConsent:oauthConsent.rowCount??0,oauthGrants:oauthGrants.rowCount??0};
  }catch(error){await connection.query('ROLLBACK');throw error;}finally{connection.release();}
 }
}

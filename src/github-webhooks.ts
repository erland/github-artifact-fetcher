import {createHmac,timingSafeEqual} from 'node:crypto';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {Pool} from 'pg';
export class GitHubWebhooks {
 constructor(private readonly pool:Pool,private readonly secret:string){if(!secret)throw Error('GITHUB_WEBHOOK_SECRET required');}
 async handle(req:IncomingMessage,res:ServerResponse):Promise<void>{
  const header=req.headers['x-hub-signature-256'];
  const delivery=req.headers['x-github-delivery'];
  const event=req.headers['x-github-event'];
  const chunks:Buffer[]=[];let length=0;
  try{
   for await(const part of req){const bytes=Buffer.from(part);length+=bytes.length;if(length>65536)throw Error('body_too_large');chunks.push(bytes);}
   const body=Buffer.concat(chunks);
   const expected='sha256='+createHmac('sha256',this.secret).update(body).digest('hex');
   if(typeof header!=='string'||!/^sha256=[0-9a-f]{64}$/.test(header)||!timingSafeEqual(Buffer.from(header),Buffer.from(expected))){res.writeHead(401);res.end();return;}
   if(typeof delivery!=='string'||!/^[0-9a-fA-F-]{36}$/.test(delivery)||typeof event!=='string'){res.writeHead(400);res.end();return;}
   const payload=JSON.parse(body.toString('utf8')) as {action?:string;installation?:{id?:number};repositories_removed?:Array<{id?:number}>};
   const installation=payload.installation?.id;
   const revoke=event==='installation'&&['deleted','suspend'].includes(payload.action??'')||event==='installation_repositories'&&payload.action==='removed'&&Array.isArray(payload.repositories_removed)&&payload.repositories_removed.length>0;
   const db=await this.pool.connect();
   try{
    await db.query('BEGIN');
    const inserted=await db.query('INSERT INTO github_webhook_deliveries(delivery_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING delivery_id',[delivery]);
    if(inserted.rowCount===1&&revoke&&Number.isSafeInteger(installation)&&installation!>0){
     const users=await db.query('SELECT user_subject FROM github_installation_users WHERE installation_id=$1',[installation]);
     for(const item of users.rows){
      const user=item.user_subject;
      await db.query('DELETE FROM github_connections WHERE user_subject=$1',[user]);
      await db.query('DELETE FROM oauth_sessions WHERE user_subject=$1',[user]);
      await db.query('UPDATE mcp_oauth_grants SET consumed_at=NOW() WHERE user_subject=$1 AND consumed_at IS NULL',[user]);
      await db.query('UPDATE mcp_oauth_consent_requests SET consumed_at=NOW() WHERE user_subject=$1 AND consumed_at IS NULL',[user]);
     }
     await db.query('DELETE FROM github_installation_users WHERE installation_id=$1',[installation]);
    }
    await db.query('COMMIT');
    res.writeHead(204);res.end();
   }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  }catch{if(!res.headersSent)res.writeHead(400);res.end();}
 }
}

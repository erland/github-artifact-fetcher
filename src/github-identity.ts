import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {Pool} from 'pg';
const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
const random=()=>randomBytes(32).toString('base64url');
const cookie=(req:IncomingMessage,name:string)=>req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);
export type IdentityConfig={pool:Pool;clientId:string;clientSecret:string;publicBaseUrl:string;encryptionKey:Buffer;fetcher?:typeof fetch;now?:()=>number};
export class GitHubIdentity {
 private readonly fetcher:typeof fetch;
 private readonly now:()=>number;
 constructor(private readonly config:IdentityConfig){
  if(config.encryptionKey.length!==32)throw Error('ENCRYPTION_KEY must decode to 32 bytes');
  if(new URL(config.publicBaseUrl).protocol!=='https:')throw Error('HTTPS issuer required');
  this.fetcher=config.fetcher??fetch;
  this.now=config.now??Date.now;
 }
 private enc(token:string):Buffer{
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.config.encryptionKey,iv);
  const body=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),body]);
 }
 private dec(data:Buffer):string{
  const decipher=createDecipheriv('aes-256-gcm',this.config.encryptionKey,data.subarray(0,12));
  decipher.setAuthTag(data.subarray(12,28));
  return Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString('utf8');
 }
 async principal(req:IncomingMessage):Promise<string|null>{
  const sid=cookie(req,'ghaf_session');
  if(!sid||!/^[A-Za-z0-9_-]{40,}$/.test(sid))return null;
  const r=await this.config.pool.query('SELECT user_subject FROM oauth_sessions WHERE session_hash=$1 AND expires_at>NOW()',[sha(sid)]);
  return r.rows[0]?.user_subject??null;
 }
 private resumeSignature(path:string){return createHmac('sha256',this.config.encryptionKey).update(path).digest('base64url');}
 async start(req:IncomingMessage,res:ServerResponse){
  const state=random(),nonce=random();
  const returnTo=new URL(req.url??'/',this.config.publicBaseUrl).searchParams.get('return_to');
  const validReturn=returnTo&&returnTo.startsWith('/authorize?')&&returnTo.length<=2048&&!returnTo.includes('#')&&!returnTo.includes('\\');
  const resumeCookie=validReturn?`ghaf_resume=${Buffer.from(returnTo).toString('base64url')}.${this.resumeSignature(returnTo)}; HttpOnly; Secure; SameSite=Lax; Path=/auth/github/callback; Max-Age=300`:null;
  await this.config.pool.query('INSERT INTO github_oauth_attempts(state_hash,nonce_hash,expires_at) VALUES($1,$2,$3)',[sha(state),sha(nonce),new Date(this.now()+300000)]);
  const redirect=new URL('https://github.com/login/oauth/authorize');
  redirect.searchParams.set('client_id',this.config.clientId);
  redirect.searchParams.set('redirect_uri',this.config.publicBaseUrl+'/auth/github/callback');
  redirect.searchParams.set('state',state);
  // GitHub App user authorization requires no broad repo scope.
  res.writeHead(302,{'location':redirect.toString(),'cache-control':'no-store','set-cookie':[ `ghaf_oauth=${state}.${nonce}; HttpOnly; Secure; SameSite=Lax; Path=/auth/github; Max-Age=300`, ...(resumeCookie?[resumeCookie]:[])]});res.end();
 }
 async callback(req:IncomingMessage,res:ServerResponse,url:URL){
  const supplied=url.searchParams.get('state')??'',code=url.searchParams.get('code')??'';
  const raw=cookie(req,'ghaf_oauth')??'',parts=raw.split('.');
  const clear='ghaf_oauth=; HttpOnly; Secure; SameSite=Lax; Path=/auth/github; Max-Age=0';
  const reject=()=>{res.writeHead(400,{'cache-control':'no-store','set-cookie':clear});res.end('Invalid GitHub authorization');};
  if(parts.length!==2||supplied!==parts[0]||!code||!/^[A-Za-z0-9_-]{30,}$/.test(parts[1]))return reject();
  const client=await this.config.pool.connect();
  try{
   await client.query('BEGIN');
   const used=await client.query('DELETE FROM github_oauth_attempts WHERE state_hash=$1 AND nonce_hash=$2 AND expires_at>NOW() RETURNING state_hash',[sha(supplied),sha(parts[1])]);
   if(used.rowCount!==1)throw Error('state_mismatch');
   await client.query('COMMIT');
  }catch{await client.query('ROLLBACK');return reject();}finally{client.release();}
  const response=await this.fetcher('https://github.com/login/oauth/access_token',{method:'POST',headers:{'accept':'application/json','content-type':'application/json'},body:JSON.stringify({client_id:this.config.clientId,client_secret:this.config.clientSecret,code,redirect_uri:this.config.publicBaseUrl+'/auth/github/callback'})});
  if(!response.ok)return reject();
  const token=await response.json() as {access_token?:string;refresh_token?:string;expires_in?:number;refresh_token_expires_in?:number};
  if(!token.access_token)return reject();
  const profileResponse=await this.fetcher('https://api.github.com/user',{headers:{authorization:'Bearer '+token.access_token,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28'}});
  if(!profileResponse.ok)return reject();
  const profile=await profileResponse.json() as {id?:number};
  if(!Number.isSafeInteger(profile.id)||!profile.id||profile.id<=0)return reject();
  const subject='github:'+profile.id;
  const expires=new Date(this.now()+(token.expires_in??28800)*1000);
  const refreshExpires=token.refresh_token?new Date(this.now()+(token.refresh_token_expires_in??15552000)*1000):null;
  await this.config.pool.query(`INSERT INTO github_connections(id,user_subject,github_user_id,encrypted_token,encrypted_refresh_token,token_expires_at,refresh_expires_at)
VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6)
ON CONFLICT(user_subject) DO UPDATE SET github_user_id=EXCLUDED.github_user_id,encrypted_token=EXCLUDED.encrypted_token,encrypted_refresh_token=EXCLUDED.encrypted_refresh_token,token_expires_at=EXCLUDED.token_expires_at,refresh_expires_at=EXCLUDED.refresh_expires_at,updated_at=NOW()`,[subject,profile.id,this.enc(token.access_token),token.refresh_token?this.enc(token.refresh_token):null,expires,refreshExpires]);
  const sid=random();
  await this.config.pool.query('INSERT INTO oauth_sessions(id,user_subject,expires_at,session_hash) VALUES(gen_random_uuid(),$1,$2,$3)',[subject,new Date(this.now()+86400000),sha(sid)]);
  const resume=cookie(req,'ghaf_resume')??'';
  const [encoded,signature]=resume.split('.');
  let returnTo='/';
  if(encoded&&signature){
   const candidate=Buffer.from(encoded,'base64url').toString('utf8');
   const expected=this.resumeSignature(candidate);
   if(candidate.startsWith('/authorize?')&&candidate.length<=2048&&signature.length===expected.length&&timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))returnTo=candidate;
  }
  res.writeHead(302,{'location':this.config.publicBaseUrl+returnTo, 'cache-control':'no-store','set-cookie':[clear,'ghaf_resume=; HttpOnly; Secure; SameSite=Lax; Path=/auth/github/callback; Max-Age=0',`ghaf_session=${sid}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`]});res.end();
 }
 async tokenFor(user:string):Promise<string|null>{
  const client=await this.config.pool.connect();
  try {
   await client.query('BEGIN');
   const r=await client.query('SELECT * FROM github_connections WHERE user_subject=$1 FOR UPDATE',[user]);
   const item=r.rows[0];if(!item){await client.query('ROLLBACK');return null;}
   if(new Date(item.token_expires_at).getTime()>this.now()+60000){await client.query('COMMIT');return this.dec(item.encrypted_token);}
   if(!item.encrypted_refresh_token||new Date(item.refresh_expires_at).getTime()<=this.now()){await client.query('ROLLBACK');return null;}
   const response=await this.fetcher('https://github.com/login/oauth/access_token',{method:'POST',headers:{accept:'application/json','content-type':'application/json'},body:JSON.stringify({client_id:this.config.clientId,client_secret:this.config.clientSecret,grant_type:'refresh_token',refresh_token:this.dec(item.encrypted_refresh_token)})});
   if(!response.ok){
    if([400,401,403].includes(response.status)){
     await client.query('ROLLBACK');
     await this.revokeLocal(user);
     return null;
    }
    throw Error('github_refresh_failed');
   }
   const rotated=await response.json() as {access_token?:string;refresh_token?:string;expires_in?:number;refresh_token_expires_in?:number};
   if(!rotated.access_token||!rotated.refresh_token)throw Error('invalid_refresh_response');
   await client.query('UPDATE github_connections SET encrypted_token=$2,encrypted_refresh_token=$3,token_expires_at=$4,refresh_expires_at=$5,updated_at=NOW() WHERE user_subject=$1',[user,this.enc(rotated.access_token),this.enc(rotated.refresh_token),new Date(this.now()+(rotated.expires_in??28800)*1000),new Date(this.now()+(rotated.refresh_token_expires_in??15552000)*1000)]);
   await client.query('COMMIT');return rotated.access_token;
  }catch{await client.query('ROLLBACK');return null;}finally{client.release();}
 }
 async revokeLocal(user:string):Promise<void>{
  const db=await this.config.pool.connect();
  try{
   await db.query('BEGIN');
   await db.query('DELETE FROM github_installation_users WHERE user_subject=$1',[user]);
   await db.query('DELETE FROM github_connections WHERE user_subject=$1',[user]);
   await db.query('DELETE FROM oauth_sessions WHERE user_subject=$1',[user]);
   await db.query('UPDATE mcp_oauth_grants SET consumed_at=NOW() WHERE user_subject=$1 AND consumed_at IS NULL',[user]);
   await db.query('UPDATE mcp_oauth_consent_requests SET consumed_at=NOW() WHERE user_subject=$1 AND consumed_at IS NULL',[user]);
   await db.query('COMMIT');
  }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
 }
 async publicRepository(owner:string,repo:string):Promise<boolean>{
  if(!/^[\\w.-]{1,100}$/.test(owner)||!/^[\\w.-]{1,100}$/.test(repo)||owner==='..'||repo==='..')return false;
  // No caller-supplied URL, credentials, or redirects are accepted.
  const response=await this.fetcher('https://api.github.com/repos/'+encodeURIComponent(owner)+'/'+encodeURIComponent(repo),{
   headers:{accept:'application/vnd.github+json','x-github-api-version':'2022-11-28'},
   redirect:'manual',signal:AbortSignal.timeout(12000)
  });
  if(response.status!==200)return false;
  const item=await response.json() as {id?:number;full_name?:string;private?:boolean};
  return Number.isSafeInteger(item.id)&&Number(item.id)>0&&
   item.full_name?.toLowerCase()===(owner+'/'+repo).toLowerCase()&&item.private===false;
 }
 async repositoryAllowed(user:string,owner:string,repo:string):Promise<boolean>{
  if(!/^[\w.-]{1,100}$/.test(owner)||!/^[\w.-]{1,100}$/.test(repo)||owner==='..'||repo==='..')return false;
  const token=await this.tokenFor(user);if(!token)return false;
  if(await this.publicRepository(owner,repo))return true;
  const headers={authorization:'Bearer '+token,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28'};
  const get=async(url:string)=>{
   const response=await this.fetcher(url,{headers,redirect:'manual',signal:AbortSignal.timeout(12000)});
   if(response.status===401){await this.revokeLocal(user);return null;}
   if(!response.ok||response.status>=300)return null;
   return response.json() as Promise<any>;
  };
  const repository=await get('https://api.github.com/repos/'+encodeURIComponent(owner)+'/'+encodeURIComponent(repo));
  if(!repository||!Number.isSafeInteger(repository.id)||repository.id<=0||typeof repository.full_name!=='string'||repository.full_name.toLowerCase()!==(owner+'/'+repo).toLowerCase())return false;
  // User access alone is insufficient: the GitHub App must be installed with
  // explicit read permissions on this precise repository.
  for(let page=1;page<=10;page++){
   const data=await get('https://api.github.com/user/installations?per_page=100&page='+page);
   if(!data||!Array.isArray(data.installations))return false;
   for(const install of data.installations){
    if(!Number.isSafeInteger(install.id)||install.id<=0||install.suspended_at||install.permissions?.contents!=='read'&&install.permissions?.contents!=='write')continue;
    for(let rp=1;rp<=10;rp++){
     const list=await get('https://api.github.com/user/installations/'+install.id+'/repositories?per_page=100&page='+rp);
     if(!list||!Array.isArray(list.repositories))return false;
     if(list.repositories.some((entry:any)=>entry.id===repository.id&&entry.full_name?.toLowerCase()===repository.full_name.toLowerCase()&&entry.permissions?.pull===true)){
      await this.config.pool.query('INSERT INTO github_installation_users(installation_id,user_subject) VALUES($1,$2) ON CONFLICT DO NOTHING',[install.id,user]);
      return true;
     }
     if(list.repositories.length<100)break;
    }
   }
   if(data.installations.length<100)break;
  }
  return false;
 }
 async route(req:IncomingMessage,res:ServerResponse,url:URL):Promise<boolean>{
  if(req.method==='GET'&&url.pathname==='/auth/github/start'){await this.start(req,res);return true;}
  if(req.method==='GET'&&url.pathname==='/auth/github/callback'){await this.callback(req,res,url);return true;}
  if(req.method==='POST'&&url.pathname==='/auth/logout'){
   const sid=cookie(req,'ghaf_session');
   if(sid)await this.config.pool.query('DELETE FROM oauth_sessions WHERE session_hash=$1',[sha(sid)]);
   res.writeHead(204,{'set-cookie':'ghaf_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'});res.end();return true;
  }
  return false;
 }
}

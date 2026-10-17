import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';
import type {IncomingMessage, ServerResponse} from 'node:http';
import {Pool} from 'pg';

export type PrincipalResolver=(req:IncomingMessage)=>Promise<string|null>;
export type OAuthConfig={issuer:string;pool:Pool;principal:PrincipalResolver;now?:()=>number};
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
const secret=()=>randomBytes(32).toString('base64url');
const secureEqual=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)};
const json=(res:ServerResponse,status:number,body:unknown,headers:Record<string,string>={})=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','pragma':'no-cache',...headers});res.end(JSON.stringify(body));};
const error=(res:ServerResponse,status:number,code:string)=>json(res,status,{error:code});
async function form(req:IncomingMessage):Promise<URLSearchParams>{
 let text='';for await(const chunk of req){text+=chunk;if(text.length>16384)throw Error('too_large');}
 return new URLSearchParams(text);
}
export function validRedirect(raw:string):boolean{
 try {const u=new URL(raw);return !u.username&&!u.password&&!u.hash&&
 (u.protocol==='https:'||(u.protocol==='http:'&&(['127.0.0.1','[::1]','localhost'].includes(u.hostname))));}
 catch{return false;}
}
export class OAuth {
 readonly issuer:string;readonly resource:string;
 constructor(private readonly config:OAuthConfig){
  this.issuer=new URL(config.issuer).origin;
  this.resource=this.issuer+'/mcp';
 }
 private now(){return this.config.now?.()??Date.now();}
 private async store(kind:'code'|'access'|'refresh',token:string,client:string,user:string,scope:string,ttl:number,redirect?:string,challenge?:string){
  await this.config.pool.query('INSERT INTO mcp_oauth_grants(grant_hash,kind,client_id,user_subject,scope,resource,redirect_uri,code_challenge,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[hash(token),kind,client,user,scope,this.resource,redirect??null,challenge??null,new Date(this.now()+ttl*1000)]);
 }
 private async client(clientId:string,redirect:string){
  const r=await this.config.pool.query('SELECT redirect_uris FROM mcp_oauth_clients WHERE client_id=$1',[clientId]);
  return r.rowCount===1&&(r.rows[0].redirect_uris as string[]).includes(redirect);
 }
 async subject(req:IncomingMessage):Promise<string|null>{
  const match=/^Bearer ([A-Za-z0-9_-]+)$/.exec(req.headers.authorization??'');
  if(!match)return null;
  const r=await this.config.pool.query("SELECT user_subject FROM mcp_oauth_grants WHERE grant_hash=$1 AND kind='access' AND resource=$2 AND expires_at>NOW() AND consumed_at IS NULL",[hash(match[1]),this.resource]);
  return r.rowCount===1?r.rows[0].user_subject:null;
 }
 async authenticate(req:IncomingMessage):Promise<boolean>{return (await this.subject(req))!==null;}
 async handle(req:IncomingMessage,res:ServerResponse,url:URL):Promise<boolean>{
  const path=url.pathname;
  if(req.method==='GET'&&['/.well-known/oauth-authorization-server','/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp'].includes(path)){
   if(path.includes('authorization-server'))json(res,200,{issuer:this.issuer,authorization_endpoint:this.issuer+'/authorize',token_endpoint:this.issuer+'/token',registration_endpoint:this.issuer+'/register',revocation_endpoint:this.issuer+'/revoke',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none'],scopes_supported:['mcp']});
   else json(res,200,{resource:this.resource,authorization_servers:[this.issuer],scopes_supported:['mcp']});
   return true;
  }
  if(req.method==='POST'&&path==='/register'){
   try {
    const input=JSON.parse((await (async()=>{let s='';for await(const chunk of req){s+=chunk;if(s.length>16384)throw Error('too_large');}return s;})())) as {redirect_uris?:unknown;token_endpoint_auth_method?:string};
    const allowed=(process.env.OAUTH_ALLOWED_REDIRECT_HOSTS??'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
    if(!Array.isArray(input.redirect_uris)||input.redirect_uris.length<1||input.redirect_uris.length>5||!input.redirect_uris.every(v=>typeof v==='string'&&validRedirect(v)&&allowed.includes(new URL(v).hostname.toLowerCase()))|| (input.token_endpoint_auth_method&&input.token_endpoint_auth_method!=='none'))return error(res,400,'invalid_client_metadata'),true;
    const id=secret();await this.config.pool.query('INSERT INTO mcp_oauth_clients(client_id,redirect_uris) VALUES($1,$2)',[id,JSON.stringify(input.redirect_uris)]);
    json(res,201,{client_id:id,redirect_uris:input.redirect_uris,token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']});
   }catch{error(res,400,'invalid_client_metadata');}
   return true;
  }
  if(req.method==='GET'&&path==='/authorize'){
   const q=url.searchParams,client=q.get('client_id')??'',redirect=q.get('redirect_uri')??'';
   if(!await this.client(client,redirect))return error(res,400,'invalid_request'),true;
   const state=q.get('state')??'',challenge=q.get('code_challenge')??'';
   if(q.get('response_type')!=='code'||q.get('code_challenge_method')!=='S256'||!/^[A-Za-z0-9_-]{43}$/.test(challenge)||q.get('scope')!=='mcp'||q.get('resource')!==this.resource||state.length<8||state.length>512)return error(res,400,'invalid_request'),true;
   const user=await this.config.principal(req);
   if(!user){res.writeHead(302,{'location':'/auth/github/start?return_to='+encodeURIComponent(url.pathname+url.search),'cache-control':'no-store'});res.end();return true;}
   // Bind consent to the exact reviewed request and the logged-in subject.
   const request=secret(),csrf=secret();
   await this.config.pool.query(`INSERT INTO mcp_oauth_consent_requests
    (request_hash,csrf_hash,user_subject,client_id,redirect_uri,state,code_challenge,scope,resource,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [hash(request),hash(csrf),user,client,redirect,state,challenge,'mcp',this.resource,new Date(this.now()+300000)]);
   const escapeHtml=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]??c));
   res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",'set-cookie':`ghaf_consent=${request}; HttpOnly; Secure; SameSite=Lax; Path=/authorize; Max-Age=300`});
   res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Authorize MCP</title><style>body{font:16px system-ui,-apple-system,sans-serif;background:#f8fafc;color:#172033;margin:0;padding:36px 16px}main{max-width:520px;margin:6vh auto;background:white;border:1px solid #dbe2ea;border-radius:14px;padding:28px;box-shadow:0 8px 28px #17203312}h1{font-size:24px;margin-top:0}p{line-height:1.5;overflow-wrap:anywhere}button{font:inherit;border:1px solid #c9d1dc;background:#fff;border-radius:8px;padding:11px 19px;margin:8px 8px 0 0;cursor:pointer}button[value=approve]{background:#153b73;color:white;border-color:#153b73}</style></head><body><main><h1>Authorize GitHub Artifact Fetcher</h1><p>Allow client ${escapeHtml(client)} to access your GitHub artifacts through MCP?</p><p>Redirect: ${escapeHtml(redirect)}</p><form action="/authorize" method="post"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="request" value="${request}"><button type="submit" name="decision" value="approve">Approve</button><button type="submit" name="decision" value="deny">Deny</button></form></main></body></html>`);return true;
  }
  if(req.method==='POST'&&path==='/authorize'){
   let q:URLSearchParams;try{q=await form(req);}catch{return error(res,400,'invalid_request'),true;}
   const cookies=(req.headers.cookie??'').split(';').map(x=>x.trim());
   const cookieRequest=cookies.find(x=>x.startsWith('ghaf_consent='))?.slice('ghaf_consent='.length)??'';
   res.setHeader('set-cookie','ghaf_consent=; HttpOnly; Secure; SameSite=Strict; Path=/authorize; Max-Age=0');
   if([...q.keys()].some(key=>!['request','csrf','decision'].includes(key))||['request','csrf','decision'].some(key=>q.getAll(key).length!==1))return error(res,403,'invalid_consent'),true;
   const supplied=q.get('request')??'',csrf=q.get('csrf')??'';
   if(!/^[A-Za-z0-9_-]{43}$/.test(cookieRequest)||!secureEqual(cookieRequest,supplied)||!/^[A-Za-z0-9_-]{43}$/.test(csrf)||!['approve','deny'].includes(q.get('decision')??''))return error(res,403,'invalid_consent'),true;
   const user=await this.config.principal(req);
   if(!user)return error(res,401,'login_required'),true;
   const db=await this.config.pool.connect();
   try {
    await db.query('BEGIN');
    const result=await db.query('SELECT * FROM mcp_oauth_consent_requests WHERE request_hash=$1 FOR UPDATE',[hash(cookieRequest)]);
    const reviewed=result.rows[0];
    if(result.rowCount!==1||reviewed.consumed_at||new Date(reviewed.expires_at).getTime()<=this.now()||reviewed.user_subject!==user||!secureEqual(reviewed.csrf_hash,hash(csrf)))throw Error('invalid_consent');
    const updated=await db.query('UPDATE mcp_oauth_consent_requests SET consumed_at=NOW() WHERE request_hash=$1 AND consumed_at IS NULL RETURNING request_hash',[hash(cookieRequest)]);
    if(updated.rowCount!==1)throw Error('invalid_consent');
    // All protocol parameters are taken only from the server-side reviewed request.
    const target=new URL(reviewed.redirect_uri);
    if(q.get('decision')==='approve'){
     const code=secret();
     await db.query('INSERT INTO mcp_oauth_grants(grant_hash,kind,client_id,user_subject,scope,resource,redirect_uri,code_challenge,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [hash(code),'code',reviewed.client_id,user,reviewed.scope,reviewed.resource,reviewed.redirect_uri,reviewed.code_challenge,new Date(this.now()+120000)]);
     target.searchParams.set('code',code);
    }else target.searchParams.set('error','access_denied');
    target.searchParams.set('state',reviewed.state);
    await db.query('COMMIT');
    res.writeHead(302,{'location':target.toString(),'cache-control':'no-store'});res.end();
   }catch(e){await db.query('ROLLBACK');console.warn('oauth.consent.failed',{reason:(e as Error).message==='invalid_consent'?'invalid_consent':'database_or_internal_error'});error(res,403,'invalid_consent');}
   finally{db.release();}
   return true;
  }
  if(req.method==='POST'&&path==='/revoke'){
   let q:URLSearchParams;try{q=await form(req);}catch{return error(res,400,'invalid_request'),true;}
   const token=q.get('token')??'',clientId=q.get('client_id')??'';
   if(!/^[A-Za-z0-9_-]{43}$/.test(token)||!/^[A-Za-z0-9_-]{43}$/.test(clientId))return error(res,400,'invalid_request'),true;
   const db=await this.config.pool.connect();
   try{
    await db.query('BEGIN');
    const result=await db.query("SELECT user_subject FROM mcp_oauth_grants WHERE grant_hash=$1 AND client_id=$2 AND kind IN ('access','refresh') FOR UPDATE",[hash(token),clientId]);
    if(result.rowCount===1){
     await db.query("UPDATE mcp_oauth_grants SET consumed_at=NOW() WHERE client_id=$1 AND user_subject=$2 AND consumed_at IS NULL",[clientId,result.rows[0].user_subject]);
    }
    await db.query('COMMIT');
    json(res,200,{});
   }catch{await db.query('ROLLBACK');error(res,500,'server_error');}
   finally{db.release();}
   return true;
  }
  if(req.method==='POST'&&path==='/token'){
   let q:URLSearchParams;try{q=await form(req);}catch{return error(res,400,'invalid_request'),true;}
   const kind=q.get('grant_type'),client=q.get('client_id')??'',token=kind==='authorization_code'?q.get('code'):q.get('refresh_token');
   if(kind!=='authorization_code'&&kind!=='refresh_token')return error(res,400,'unsupported_grant_type'),true;
   if(!token||!client)return error(res,400,'invalid_request'),true;
   const db=await this.config.pool.connect();
   try{
    await db.query('BEGIN');
    const r=await db.query("SELECT * FROM mcp_oauth_grants WHERE grant_hash=$1 AND kind=$2 FOR UPDATE",[hash(token),kind==='authorization_code'?'code':'refresh']);
    const g=r.rows[0];
    if(!g||r.rowCount!==1||g.client_id!==client||g.consumed_at||new Date(g.expires_at).getTime()<=this.now()||g.resource!==this.resource)throw Error('invalid_grant');
    if(kind==='authorization_code'){
     const verifier=q.get('code_verifier')??'';
     if(!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)||!secureEqual(createHash('sha256').update(verifier).digest('base64url'),g.code_challenge)||q.get('redirect_uri')!==g.redirect_uri)throw Error('invalid_grant');
    }else if(kind!=='refresh_token')throw Error('unsupported_grant_type');
    await db.query('UPDATE mcp_oauth_grants SET consumed_at=NOW() WHERE grant_hash=$1',[hash(token)]);
    const access=secret(),refresh=secret();
    for(const [t,k,ttl] of [[access,'access',900],[refresh,'refresh',2592000]] as const)
     await db.query('INSERT INTO mcp_oauth_grants(grant_hash,kind,client_id,user_subject,scope,resource,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[hash(t),k,client,g.user_subject,g.scope,this.resource,new Date(this.now()+ttl*1000)]);
    await db.query('COMMIT');
    json(res,200,{access_token:access,refresh_token:refresh,token_type:'Bearer',expires_in:900,scope:'mcp'});
   }catch(e){await db.query('ROLLBACK');error(res,400,(e as Error).message==='unsupported_grant_type'?'unsupported_grant_type':'invalid_grant');}
   finally{db.release();}
   return true;
  }
  return false;
 }
}

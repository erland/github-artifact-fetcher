import {randomUUID} from 'node:crypto';
import type {IncomingMessage,ServerResponse} from 'node:http';

export const MAX_DOWNLOAD_BYTES=20*1024*1024;
const allowedHosts=new Set(['codeload.github.com','objects.githubusercontent.com','release-assets.githubusercontent.com','productionresultssa0.blob.core.windows.net','productionresultssa1.blob.core.windows.net','actions-results-receiver-production.githubapp.com']);
export function safeDownloadRedirect(raw:string,hosts:ReadonlySet<string>=allowedHosts):string{
 let u:URL;try{u=new URL(raw);}catch{throw Error('UNTRUSTED_REDIRECT');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||!hosts.has(u.hostname))throw Error('UNTRUSTED_REDIRECT');
 return u.toString();
}
export function safeResponseStatus(response:Response):void{
 if(!response.ok||response.status>=300)throw Error('DOWNLOAD_REJECTED');
 const type=response.headers.get('content-type')??'';
 if(type.includes('text/html'))throw Error('DOWNLOAD_REJECTED');
}
export function safeContentLength(raw:string|null,max=MAX_DOWNLOAD_BYTES):void{
 if(raw!==null&&(!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw))||Number(raw)>max))throw Error('DOWNLOAD_TOO_LARGE');
}
export class FixedWindowLimiter {
 private events=new Map<string,{count:number;until:number}>();
 constructor(private readonly max=30,private readonly windowMs=60_000,private readonly now=Date.now){}
 allow(key:string):boolean{
  const time=this.now(),record=this.events.get(key);
  if(!record||record.until<=time){
   if(this.events.size>=4096){for(const [id,entry] of this.events){if(entry.until<=time)this.events.delete(id);}}
   if(!this.events.has(key)&&this.events.size>=4096)return false;
   this.events.set(key,{count:1,until:time+this.windowMs});return true;
  }
  if(record.count>=this.max)return false;
  record.count++;return true;
 }
}
export function securityHeaders(res:ServerResponse):void{
 res.setHeader('x-content-type-options','nosniff');
 res.setHeader('referrer-policy','no-referrer');
 res.setHeader('x-frame-options','DENY');
 res.setHeader('cache-control','no-store');
 res.setHeader('content-security-policy',"default-src 'none'; frame-ancestors 'none'");
}
export function audit(event:string,requestId:string,status:string):void{
 process.stdout.write(JSON.stringify({event:'security_audit',action:event,requestId,status,at:new Date().toISOString()})+'\n');
}
export function requestId(req:IncomingMessage):string{
 const candidate=req.headers['x-request-id'];
 return typeof candidate==='string'&&/^[A-Za-z0-9_-]{8,64}$/.test(candidate)?candidate:randomUUID();
}

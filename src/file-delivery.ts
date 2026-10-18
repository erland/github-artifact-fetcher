import {createHash,randomBytes} from 'node:crypto';
import type {ServerResponse} from 'node:http';
import type {FileOutput} from './releases.js';

type Item={bytes:Buffer;name:string;mime:string;expires:number;sha256:string;owner?:string};
export class EphemeralFiles {
 private readonly files=new Map<string,Item>();
 private totalBytes=0;
 constructor(private readonly now:()=>number=Date.now,private readonly maxEntries=16,private readonly ttl=120_000,private readonly maxTotalBytes=64*1024*1024){}
 stage(file:FileOutput,baseUrl:string,owner?:string):{url:string;expiresAt:string;sha256:string;sizeBytes:number;filename:string}{
  const bytes=Buffer.from(file.dataBase64,'base64');
  if(bytes.length!==file.sizeBytes||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('FILE_INTEGRITY_FAILED');
  const base=new URL(baseUrl);
  if(base.protocol!=='https:'||base.username||base.password||base.hash||base.search)throw Error('INVALID_DOWNLOAD_ORIGIN');
  for(const [id,f] of this.files)if(f.expires<=this.now()){this.totalBytes-=f.bytes.length;this.files.delete(id);}
  if(bytes.length>20*1024*1024||this.totalBytes+bytes.length>this.maxTotalBytes)throw Error('FILE_CAPACITY_EXCEEDED');
  if(this.files.size>=this.maxEntries)throw Error('FILE_CAPACITY_EXCEEDED');
  const id=randomBytes(32).toString('hex'),expires=this.now()+this.ttl;
  this.totalBytes+=bytes.length;
  this.files.set(id,{bytes,name:file.filename.replace(/[^A-Za-z0-9_.-]/g,'_').slice(0,120),mime:file.mimeType,expires,sha256:file.sha256,owner});
  return {url:new URL('/downloads/'+id,baseUrl).toString(),expiresAt:new Date(expires).toISOString(),sha256:file.sha256,sizeBytes:bytes.length,filename:file.filename};
 }
 resource(id:string,owner:string):{blob:string;mimeType:string;sizeBytes:number;sha256:string}|null{
  if(!/^[a-f0-9]{64}$/.test(id))return null;
  const item=this.files.get(id);
  if(!item||item.owner!==owner||item.expires<=this.now()||item.bytes.length>256*1024)return null;
  return {blob:item.bytes.toString('base64'),mimeType:item.mime,sizeBytes:item.bytes.length,sha256:item.sha256};
 }
 serve(id:string,res:ServerResponse):boolean{
  if(!/^[a-f0-9]{64}$/.test(id))return false;
  const item=this.files.get(id);
  if(!item)return false;
  if(item.expires<=this.now()){this.totalBytes-=item.bytes.length;this.files.delete(id);return false;}
  this.totalBytes-=item.bytes.length;
  this.files.delete(id);
  res.writeHead(200,{'content-type':item.mime,'content-length':item.bytes.length,'content-disposition':`attachment; filename="${item.name}"`,'cache-control':'no-store','x-content-type-options':'nosniff','x-checksum-sha256':item.sha256,'referrer-policy':'no-referrer'});
  res.end(item.bytes);return true;
 }
 get size(){return this.files.size;}
}

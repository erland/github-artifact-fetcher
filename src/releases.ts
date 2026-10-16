import {validateZip} from './zip-validation.js';
import {safeDownloadRedirect,safeContentLength,safeResponseStatus} from './security.js';
import {createHash} from 'node:crypto';
export type ReleaseAsset={id:number;name:string;size:number;content_type:string;digest?:string|null;browser_download_url?:string};
export type Release={tag_name:string;assets:ReleaseAsset[]};
export type GitHubCredentials={tokenFor(user:string):Promise<string|null>;repositoryAllowed(user:string,owner:string,repo:string):Promise<boolean>};
export type FileOutput={filename:string;mimeType:string;sizeBytes:number;sha256:string;dataBase64:string};
const repoPattern=/^[A-Za-z0-9_.-]{1,100}$/;
const assetLimit=20*1024*1024;
export class ReleaseService {
 constructor(private readonly identity:GitHubCredentials,private readonly fetcher:typeof fetch=fetch){}
 private async authorized(user:string,repository:string){
  const parts=repository.split('/');
  if(parts.length!==2||!parts.every(p=>repoPattern.test(p)&&p!=='.'&&p!=='..'))throw Error('INVALID_REPOSITORY');
  const [owner,name]=parts as [string,string];
  if(!await this.identity.repositoryAllowed(user,owner,name))throw Error('REPOSITORY_FORBIDDEN');
  const token=await this.identity.tokenFor(user);
  if(!token)throw Error('GITHUB_TOKEN_UNAVAILABLE');
  return {owner,name,token};
 }
 private async release(user:string,repository:string,tag:string){
  const {owner,name,token}=await this.authorized(user,repository);
  if(!tag||tag.length>200)throw Error('INVALID_TAG');
  const response=await this.fetcher(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/releases/tags/${encodeURIComponent(tag)}`,{
   headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},redirect:'manual',signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw Error('GITHUB_RELEASE_HTTP_'+response.status);
  const data=await response.json() as Release;
  if(!Array.isArray(data.assets))throw Error('INVALID_GITHUB_RESPONSE');
  return {data,token,owner,name};
 }
 async list(user:string,repository:string,tag:string):Promise<ReleaseAsset[]>{
  const {data}=await this.release(user,repository,tag);
  return data.assets.filter(a=>Number.isSafeInteger(a.id)&&typeof a.name==='string').map(a=>({id:a.id,name:a.name,size:a.size,content_type:a.content_type,digest:a.digest}));
 }
 async fetch(user:string,repository:string,tag:string,assetName:string):Promise<FileOutput>{
  const {data,token,owner,name}=await this.release(user,repository,tag);
  const candidates=data.assets.filter(a=>a.name===assetName);
  if(candidates.length!==1||!Number.isSafeInteger(candidates[0].id))throw Error('ASSET_NOT_FOUND');
  const asset=candidates[0];
  if(!Number.isSafeInteger(asset.size)||asset.size<0||asset.size>assetLimit)throw Error('ASSET_TOO_LARGE');
  const url=`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/releases/assets/${asset.id}`;
  let response=await this.fetcher(url,{headers:{Authorization:'Bearer '+token,Accept:'application/octet-stream','X-GitHub-Api-Version':'2022-11-28'},redirect:'manual',signal:AbortSignal.timeout(30000)});
  // GitHub asset binary API can redirect to a temporary signed object URL. Never forward the bearer token.
  if(response.status===302||response.status===307){
   const location=response.headers.get('location');
   if(!location)throw Error('MISSING_REDIRECT');
   const target=new URL(safeDownloadRedirect(location,new Set(['release-assets.githubusercontent.com','objects.githubusercontent.com'])));
   response=await this.fetcher(target.toString(),{redirect:'manual',signal:AbortSignal.timeout(30000)});
  }
  if(!response.ok||response.status>=300)throw Error('ASSET_DOWNLOAD_HTTP_'+response.status);
  safeContentLength(response.headers.get('content-length'),assetLimit);
  safeResponseStatus(response);
  if(!response.body)throw Error('EMPTY_DOWNLOAD');
  const chunks:Buffer[]=[];let total=0;
  const reader=response.body.getReader();
  try {
   while(true){
    const {done,value}=await reader.read();
    if(done)break;
    const chunk=Buffer.from(value);
    total+=chunk.length;
    if(total>assetLimit)throw Error('ASSET_TOO_LARGE');
    chunks.push(chunk);
   }
  } finally {reader.releaseLock();}
  const bytes=Buffer.concat(chunks),digest=createHash('sha256').update(bytes).digest('hex');
  if(total!==asset.size)throw Error('SIZE_MISMATCH');
  if(asset.digest){
   if(!/^sha256:[0-9a-f]{64}$/i.test(asset.digest)||asset.digest.slice(7).toLowerCase()!==digest)throw Error('CHECKSUM_MISMATCH');
  }
  if(asset.name.toLowerCase().endsWith('.zip')||asset.content_type==='application/zip')validateZip(bytes);
  return {filename:asset.name,mimeType:asset.content_type||'application/octet-stream',sizeBytes:total,sha256:digest,dataBase64:bytes.toString('base64')};
 }
}

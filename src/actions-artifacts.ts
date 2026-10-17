import {validateZip} from './zip-validation.js';
import {safeDownloadRedirect,safeContentLength,safeResponseStatus} from './security.js';
import {createHash} from 'node:crypto';
import type {GitHubCredentials,FileOutput} from './releases.js';
export type ActionArtifact={id:number;name:string;size_in_bytes:number;expired:boolean;expires_at:string|null;archive_download_url:string;workflow_run?:{id:number};githubUrl?:string};
const MAX=20*1024*1024;
const namePattern=/^[A-Za-z0-9_.-]{1,100}$/;
function isZip(bytes:Buffer){return bytes.length>=4&&bytes[0]===0x50&&bytes[1]===0x4b&&((bytes[2]===3&&bytes[3]===4)||(bytes[2]===5&&bytes[3]===6)||(bytes[2]===7&&bytes[3]===8));}
export class ActionsArtifacts {
 constructor(private identity:GitHubCredentials,private fetcher:typeof fetch=fetch){}
 private async auth(user:string,repository:string){
  const p=repository.split('/');
  if(p.length!==2||!p.every(x=>namePattern.test(x)&&x!=='.'&&x!=='..'))throw Error('INVALID_REPOSITORY');
  const [owner,repo]=p;
  if(!await this.identity.repositoryAllowed(user,owner,repo))throw Error('REPOSITORY_FORBIDDEN');
  const token=await this.identity.tokenFor(user);
  if(!token)throw Error('GITHUB_TOKEN_UNAVAILABLE');
  return {owner,repo,token:await this.identity.publicRepository?.(owner,repo)?null:token};
 }
 private run(runId:number){if(!Number.isSafeInteger(runId)||runId<=0)throw Error('INVALID_RUN_ID');}
 private async api(url:string,token:string|null){
  const response=await this.fetcher(url,{headers:{...(token?{authorization:'Bearer '+token}:{}),accept:'application/vnd.github+json','x-github-api-version':'2022-11-28'},redirect:'manual',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('GITHUB_ACTIONS_HTTP_'+response.status);
  return response;
 }
 async list(user:string,repository:string,runId:number):Promise<ActionArtifact[]>{
  this.run(runId);
  const {owner,repo,token}=await this.auth(user,repository);
  const result:ActionArtifact[]=[];
  for(let page=1;page<=10;page++){
   const url=`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${runId}/artifacts?per_page=100&page=${page}`;
   const response=await this.api(url,token);
   const body=await response.json() as {artifacts?:ActionArtifact[]};
   if(!Array.isArray(body.artifacts))throw Error('INVALID_GITHUB_RESPONSE');
   for(const artifact of body.artifacts){
    if(Number.isSafeInteger(artifact.id)&&artifact.id>0&&typeof artifact.name==='string')
     result.push({id:artifact.id,name:artifact.name,size_in_bytes:artifact.size_in_bytes,expired:artifact.expired,expires_at:artifact.expires_at,archive_download_url:'',githubUrl:`https://github.com/${owner}/${repo}/actions/runs/${runId}`,workflow_run:artifact.workflow_run});
   }
   if(body.artifacts.length<100)return result;
  }
  throw Error('ARTIFACT_PAGE_LIMIT');
 }
 async download(user:string,repository:string,runId:number,artifactId:number):Promise<FileOutput>{
  this.run(runId);
  if(!Number.isSafeInteger(artifactId)||artifactId<=0)throw Error('INVALID_ARTIFACT_ID');
  const {owner,repo,token}=await this.auth(user,repository);
  const artifacts=await this.list(user,repository,runId);
  const matches=artifacts.filter(a=>a.id===artifactId);
  if(matches.length!==1)throw Error('ARTIFACT_NOT_IN_RUN');
  const metadata=matches[0];
  if(metadata.expired||metadata.expires_at&&Date.parse(metadata.expires_at)<=Date.now())throw Error('ARTIFACT_EXPIRED');
  if(!Number.isSafeInteger(metadata.size_in_bytes)||metadata.size_in_bytes<0||metadata.size_in_bytes>MAX)throw Error('ARTIFACT_TOO_LARGE');
  const url=`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/artifacts/${artifactId}/zip`;
  let response=await this.fetcher(url,{headers:{...(token?{authorization:'Bearer '+token}:{}),accept:'application/vnd.github+json','x-github-api-version':'2022-11-28'},redirect:'manual',signal:AbortSignal.timeout(30000)});
  if(response.status===410)throw Error('ARTIFACT_EXPIRED');
  if([302,307].includes(response.status)){
   const location=response.headers.get('location');
   if(!location)throw Error('MISSING_REDIRECT');
   const target=new URL(safeDownloadRedirect(location,new Set(['productionresultssa0.blob.core.windows.net','productionresultssa1.blob.core.windows.net','actions-results-receiver-production.githubapp.com'])));
   response=await this.fetcher(target.toString(),{redirect:'manual',signal:AbortSignal.timeout(30000)});
  }
  if(!response.ok||response.status>=300)throw Error('ARTIFACT_DOWNLOAD_HTTP_'+response.status);
  if(!response.body)throw Error('EMPTY_DOWNLOAD');
  safeContentLength(response.headers.get('content-length'),MAX);
  safeResponseStatus(response);
  const reader=response.body.getReader(),chunks:Buffer[]=[];let total=0;
  try{
   while(true){const {done,value}=await reader.read();if(done)break;const b=Buffer.from(value);total+=b.length;if(total>MAX)throw Error('ARTIFACT_TOO_LARGE');chunks.push(b);}
  }finally{await reader.cancel().catch(()=>{});}
  const bytes=Buffer.concat(chunks);
  validateZip(bytes);
  // GitHub's size_in_bytes is the stored artifact size and is not guaranteed to equal the archive ZIP download size.
  return {filename:metadata.name.replace(/[^A-Za-z0-9_.-]/g,'_')+'.zip',mimeType:'application/zip',sizeBytes:total,sha256:createHash('sha256').update(bytes).digest('hex'),dataBase64:bytes.toString('base64')};
 }
}

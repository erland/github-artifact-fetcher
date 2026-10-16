import {validateZip} from './zip-validation.js';
import {safeDownloadRedirect,safeContentLength,safeResponseStatus} from './security.js';
import {createHash} from 'node:crypto';
import type {GitHubCredentials,FileOutput} from './releases.js';
const MAX_BYTES=20*1024*1024;
const repositoryPart=/^[A-Za-z0-9_.-]{1,100}$/;
const hexCommit=/^[a-fA-F0-9]{40}$/;
export type ArchiveRef={kind:'branch'|'tag'|'commit';value:string};
function validRef(ref:ArchiveRef):void {
 if(!['branch','tag','commit'].includes(ref.kind)||!ref.value||ref.value.length>200)throw Error('INVALID_REF');
 if(ref.kind==='commit'){if(!hexCommit.test(ref.value))throw Error('INVALID_REF');return;}
 // Reject Git ref ambiguities, traversal and URL escape attempts.
 if(ref.value.startsWith('/')||ref.value.endsWith('/')||ref.value.includes('//')||ref.value.includes('..')||ref.value.includes('@{')||/[~^:?*\\\[\]\\\x00-\x20\x7f]/.test(ref.value)||ref.value.endsWith('.')||ref.value.endsWith('.lock')||ref.value.split('/').some(p=>p.startsWith('.')))throw Error('INVALID_REF');
}
function zipSignature(bytes:Buffer):boolean{return bytes.length>=4&&bytes[0]===80&&bytes[1]===75&&((bytes[2]===3&&bytes[3]===4)||(bytes[2]===5&&bytes[3]===6)||(bytes[2]===7&&bytes[3]===8));}
export class RepositoryArchives {
 constructor(private readonly identity:GitHubCredentials,private readonly fetcher:typeof fetch=fetch){}
 async download(user:string,repository:string,ref:ArchiveRef):Promise<FileOutput>{
  const parts=repository.split('/');
  if(parts.length!==2||!parts.every(x=>repositoryPart.test(x)&&x!=='.'&&x!=='..'))throw Error('INVALID_REPOSITORY');
  validRef(ref);
  const [owner,name]=parts;
  if(!await this.identity.repositoryAllowed(user,owner,name))throw Error('REPOSITORY_FORBIDDEN');
  const token=await this.identity.tokenFor(user);
  if(!token)throw Error('GITHUB_TOKEN_UNAVAILABLE');
  // Resolve the chosen namespace explicitly. Do not accept an ambiguous bare ref.
  const apiBase=`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  const lookup=ref.kind==='commit'?`git/commits/${encodeURIComponent(ref.value)}`:`git/ref/${[ref.kind==='branch'?'heads':'tags',...ref.value.split('/')].map(encodeURIComponent).join('/')}`;
  const info=await this.fetcher(`${apiBase}/${lookup}`,{
   headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28'},redirect:'manual',signal:AbortSignal.timeout(15000)
  });
  if(!info.ok)throw Error('REF_LOOKUP_HTTP_'+info.status);
  const metadata=await info.json() as {sha?:string;object?:{sha?:string;type?:string}};
  let sha=ref.kind==='commit'?metadata.sha:metadata.object?.sha;
  if(ref.kind==='tag'&&metadata.object?.type==='tag'){
   const tagSha=metadata.object.sha;
   if(!tagSha||!hexCommit.test(tagSha))throw Error('INVALID_RESOLVED_TAG');
   const tagResponse=await this.fetcher(`${apiBase}/git/tags/${tagSha}`,{
    headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28'},redirect:'manual',signal:AbortSignal.timeout(15000)
   });
   if(!tagResponse.ok)throw Error('TAG_LOOKUP_HTTP_'+tagResponse.status);
   const tag=await tagResponse.json() as {object?:{sha?:string;type?:string}};
   if(tag.object?.type!=='commit')throw Error('UNSUPPORTED_TAG_TARGET');
   sha=tag.object.sha;
  }
  if(!sha||!hexCommit.test(sha))throw Error('INVALID_RESOLVED_COMMIT');
  const url=`${apiBase}/zipball/${sha}`;
  let response=await this.fetcher(url,{headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28'},redirect:'manual',signal:AbortSignal.timeout(30000)});
  if([302,307].includes(response.status)){
   const raw=response.headers.get('location');
   if(!raw)throw Error('MISSING_REDIRECT');
   const next=new URL(safeDownloadRedirect(raw,new Set(['codeload.github.com','objects.githubusercontent.com'])));
   response=await this.fetcher(next.toString(),{redirect:'manual',signal:AbortSignal.timeout(30000)});
  }
  if(!response.ok||response.status>=300)throw Error('ARCHIVE_DOWNLOAD_HTTP_'+response.status);
  safeContentLength(response.headers.get('content-length'),MAX_BYTES);
  safeResponseStatus(response);
  if(!response.body)throw Error('EMPTY_DOWNLOAD');
  const reader=response.body.getReader(),chunks:Buffer[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;const b=Buffer.from(value);size+=b.length;if(size>MAX_BYTES)throw Error('ARCHIVE_TOO_LARGE');chunks.push(b);}}
  finally{await reader.cancel().catch(()=>{});}
  const bytes=Buffer.concat(chunks);
  validateZip(bytes);
  const digest=createHash('sha256').update(bytes).digest('hex');
  return {filename:`${name}-${sha.slice(0,12)}.zip`,mimeType:'application/zip',sizeBytes:size,sha256:digest,dataBase64:bytes.toString('base64')};
 }
}

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ActionsArtifacts} from '../dist/actions-artifacts.js';
const zip=Buffer.from('504b0506'+'00'.repeat(18),'hex');
const identity={repositoryAllowed:async(user,owner,repo)=>user==='github:1'&&owner==='demo'&&repo==='repo',tokenFor:async()=> 'private-gh-token'};
function service(opts={}){
 let bearerCalls=0;
 const fake=async(url,init)=>{
  if(url.includes('/actions/runs/42/artifacts')){
   assert.equal(init.headers.authorization,'Bearer private-gh-token');
   return new Response(JSON.stringify({artifacts:[{id:77,name:'build',size_in_bytes:12,expired:opts.expired??false,expires_at:opts.expires??'2099-01-01T00:00:00Z',workflow_run:{id:42}}]}));
  }
  if(url.includes('/actions/artifacts/77/zip')){bearerCalls++;return new Response(null,{status:opts.status??302,headers:{location:opts.redirect??'https://productionresultssa0.blob.core.windows.net/asset.zip'}});}
  if(url.startsWith('https://productionresultssa0.blob.core.windows.net/')){
   assert.equal(init.headers?.authorization,undefined);
   return new Response(opts.bytes??zip);
  }
  throw Error('Unexpected URL: '+url);
 };
 return {api:new ActionsArtifacts(identity,fake),getBearerCalls:()=>bearerCalls};
}
test('list artifacts scoped to run and omit untrusted URL',async()=>{
 const r=await service().api.list('github:1','demo/repo',42);
 assert.equal(r.length,1);assert.equal(r[0].id,77);assert.equal(r[0].archive_download_url,'');
});
test('download artifact as verified ZIP with SHA-256 and no token on redirect',async()=>{
 const {api}=service();
 const r=await api.download('github:1','demo/repo',42,77);
 assert.deepEqual(Buffer.from(r.dataBase64,'base64'),zip);
 assert.equal(r.sha256,createHash('sha256').update(zip).digest('hex'));
 assert.equal(r.mimeType,'application/zip');
});
test('deny unauthorized user and invalid run or artifact IDs',async()=>{
 const {api}=service();
 await assert.rejects(api.list('other','demo/repo',42),/FORBIDDEN/);
 await assert.rejects(api.list('github:1','demo/repo',-1),/INVALID_RUN_ID/);
 await assert.rejects(api.download('github:1','demo/repo',42,78),/ARTIFACT_NOT_IN_RUN/);
 await assert.rejects(api.download('github:1','demo/repo',42,0),/INVALID_ARTIFACT_ID/);
});
test('expired artifacts denied before byte download',async()=>{
 const s=service({expired:true});
 await assert.rejects(s.api.download('github:1','demo/repo',42,77),/ARTIFACT_EXPIRED/);
 assert.equal(s.getBearerCalls(),0);
});
test('bad redirects and corrupt ZIPs rejected',async()=>{
 const invalid=service({redirect:'https://evil.example/asset.zip'});
 await assert.rejects(invalid.api.download('github:1','demo/repo',42,77),/UNTRUSTED_REDIRECT/);
 await assert.rejects(service({bytes:Buffer.from('not zip')}).api.download('github:1','demo/repo',42,77),/INVALID_ZIP/);
});
test('oversize metadata rejected',async()=>{
 const {api}=service();
 await assert.rejects(api.list('github:1','../repo',42),/INVALID_REPOSITORY/);
});

test('Actions rejects ZIP local header without valid central directory',async()=>{
 await assert.rejects(service({bytes:Buffer.from([80,75,3,4,0,0,0,0])}).api.download('github:1','demo/repo',42,77),/INVALID_ZIP/);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ReleaseService} from '../dist/releases.js';
const bytes=Buffer.from('release binary fixture');
const digest=createHash('sha256').update(bytes).digest('hex');
const identity={repositoryAllowed:async(user,owner,repo)=>user==='github:1'&&owner==='example'&&repo==='demo',tokenFor:async()=> 'secret-token'};
function service(opts={}){
 const fetcher=async(url,init)=>{
  if(url.endsWith('/releases/tags/v1'))return new Response(JSON.stringify({tag_name:'v1',assets:[{id:77,name:opts.name??'sample.epub',size:opts.size??(opts.payload??bytes).length,content_type:opts.contentType??'application/epub+zip',digest:opts.digest??'sha256:'+createHash('sha256').update(opts.payload??bytes).digest('hex')}]}));
  if(url.endsWith('/releases/assets/77'))return new Response(null,{status:302,headers:{location:opts.redirect??'https://release-assets.githubusercontent.com/download/asset'}});
  if(url.startsWith('https://release-assets.githubusercontent.com/')){
   assert.equal(init.headers?.Authorization,undefined);
   return new Response(opts.payload??bytes);
  }
  throw Error('Unexpected URL '+url);
 };
 return new ReleaseService(identity,fetcher);
}
test('list release metadata',async()=>{
 const x=await service().list('github:1','example/demo','v1');
 assert.equal(x[0].name,'sample.epub');assert.equal(x[0].githubUrl,'https://github.com/example/demo/releases/download/v1/sample.epub');assert.equal(x[0].digest,'sha256:'+digest);
});
test('binary download verifies hash, size and strips credential on redirect',async()=>{
 const x=await service().fetch('github:1','example/demo','v1','sample.epub');
 assert.equal(Buffer.from(x.dataBase64,'base64').toString(),bytes.toString());
 assert.equal(x.sha256,digest);
});
test('reject unauthorized repository and invalid names',async()=>{
 await assert.rejects(service().list('github:other','example/demo','v1'),/FORBIDDEN/);
 await assert.rejects(service().fetch('github:1','../demo','v1','sample.epub'),/INVALID_REPOSITORY/);
});
test('reject untrusted redirect and mismatched checksums',async()=>{
 await assert.rejects(service({redirect:'https://evil.example/attack'}).fetch('github:1','example/demo','v1','sample.epub'),/UNTRUSTED_REDIRECT/);
 await assert.rejects(service({digest:'sha256:'+'0'.repeat(64)}).fetch('github:1','example/demo','v1','sample.epub'),/CHECKSUM_MISMATCH/);
 await assert.rejects(service({size:1}).fetch('github:1','example/demo','v1','sample.epub'),/SIZE_MISMATCH/);
});
test('reject oversized release metadata',async()=>{
 await assert.rejects(service({size:999999999}).fetch('github:1','example/demo','v1','sample.epub'),/ASSET_TOO_LARGE/);
});

test('release ZIP rejects invalid central directory even when SHA-256 matches',async()=>{
 const malformed=Buffer.from([80,75,3,4,0,0,0,0]);
 await assert.rejects(service({name:'sample.zip',contentType:'application/zip',payload:malformed}).fetch('github:1','example/demo','v1','sample.zip'),/INVALID_ZIP/);
});

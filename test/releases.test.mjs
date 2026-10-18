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

test('public release downloads PDF and EPUB without ever sending GitHub credentials',async()=>{
 for(const [filename,mime,payload] of [
  ['book.pdf','application/pdf',Buffer.from('%PDF-1.7\\npublic fixture')],
  ['book.epub','application/epub+zip',Buffer.from('PK\\x03\\x04public fixture')]
 ]){
  const hash=createHash('sha256').update(payload).digest('hex');
  const called=[];
  const publicIdentity={repositoryAllowed:async()=>true,tokenFor:async()=> 'secret-token',publicRepository:async()=>true};
  const fetcher=async(url,init)=>{
   called.push({url,headers:init.headers});
   if(url.endsWith('/releases/tags/v1'))return new Response(JSON.stringify({assets:[{id:87,name:filename,size:payload.length,content_type:mime,digest:'sha256:'+hash}]}));
   if(url===`https://github.com/example/demo/releases/download/v1/${filename}`)return new Response(null,{status:302,headers:{location:'https://release-assets.githubusercontent.com/download/public-fixture'}});
   if(url==='https://release-assets.githubusercontent.com/download/public-fixture')return new Response(payload);
   throw Error('unexpected URL '+url);
  };
  const x=await new ReleaseService(publicIdentity,fetcher).fetch('github:1','example/demo','v1',filename);
  assert.equal(x.sha256,hash);
  assert.deepEqual(Buffer.from(x.dataBase64,'base64'),payload);
  assert.equal(called.some(c=>c.url.includes('/releases/assets/87')),false);
  assert.equal(called.every(c=>!c.headers?.Authorization&&!c.headers?.authorization),true);
 }
});

test('public release rejects unsafe redirect and mismatched checksum',async()=>{
 const identity={repositoryAllowed:async()=>true,tokenFor:async()=> 'secret',publicRepository:async()=>true};
 const asset={id:87,name:'book.pdf',size:8,content_type:'application/pdf',digest:'sha256:'+'0'.repeat(64)};
 const make=redirect=>new ReleaseService(identity,async(url)=>{
  if(url.endsWith('/releases/tags/v1'))return new Response(JSON.stringify({assets:[asset]}));
  if(url.startsWith('https://github.com/'))return new Response(null,{status:302,headers:{location:redirect}});
  return new Response(Buffer.from('%PDF-1.7'));
 });
 await assert.rejects(make('https://evil.example/attack').fetch('github:1','example/demo','v1','book.pdf'),/UNTRUSTED_REDIRECT/);
 await assert.rejects(make('https://release-assets.githubusercontent.com/file').fetch('github:1','example/demo','v1','book.pdf'),/CHECKSUM_MISMATCH/);
});

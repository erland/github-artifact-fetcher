import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {EphemeralFiles} from '../dist/file-delivery.js';
import {stageHandoff,verifyFileForDelivery} from '../dist/file-handoff-contract.js';

const zip=Buffer.from('504b0506'+'00'.repeat(18),'hex');
const pdf=Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
function file(name,mime,bytes){
 return {filename:name,mimeType:mime,sizeBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),dataBase64:bytes.toString('base64')};
}
const cases=[
 ['archive.zip','application/zip',zip],
 ['document.pdf','application/pdf',pdf],
 ['book.epub','application/epub+zip',zip]
];
function response(){
 const result={status:null,headers:null,bytes:null};
 return {result,writeHead(status,headers){result.status=status;result.headers=headers;},end(bytes){result.bytes=bytes;}};
}
for(const [name,mime,bytes] of cases){
 test('handoff contract and byte-exact one-time delivery: '+name,()=>{
  let clock=0;const files=new EphemeralFiles(()=>clock);
  const handoff=stageHandoff(files,file(name,mime,bytes),'https://artifacts.example.test');
  assert.deepEqual(Object.keys(handoff).sort(),['schemaVersion','delivery','nativeAttachment','filename','mimeType','sizeBytes','sha256','downloadUrl','expiresAt'].sort());
  assert.equal(handoff.schemaVersion,1);
  assert.equal(handoff.delivery,'one_time_https_url');
  assert.equal(handoff.nativeAttachment,false);
  assert.equal(handoff.mimeType,mime);
  assert.equal(handoff.sizeBytes,bytes.length);
  assert.equal(new URL(handoff.downloadUrl).protocol,'https:');
  const id=new URL(handoff.downloadUrl).pathname.split('/').pop();
  const output=response();
  assert.equal(files.serve(id,output),true);
  assert.equal(output.result.status,200);
  assert.equal(output.result.headers['content-type'],mime);
  assert.deepEqual(output.result.bytes,bytes);
  assert.equal(createHash('sha256').update(output.result.bytes).digest('hex'),handoff.sha256);
  assert.equal(files.serve(id,response()),false);
 });
 test('expired URL not reusable: '+name,()=>{
  let clock=1000;const files=new EphemeralFiles(()=>clock,16,2000);
  const handoff=stageHandoff(files,file(name,mime,bytes),'https://artifacts.example.test');
  clock=3001;
  assert.equal(files.serve(new URL(handoff.downloadUrl).pathname.split('/').pop(),response()),false);
 });
}
test('reject corrupted bytes, incompatible MIME, misleading extensions and insecure origins',()=>{
 const good=file('document.pdf','application/pdf',pdf);
 assert.throws(()=>verifyFileForDelivery({...good,sha256:'0'.repeat(64)}),/FILE_INTEGRITY_FAILED/);
 assert.throws(()=>verifyFileForDelivery({...good,mimeType:'application/zip'}),/FILE_MIME_MISMATCH/);
 assert.throws(()=>verifyFileForDelivery(file('fake.pdf','application/pdf',Buffer.from('not pdf'))),/FILE_SIGNATURE_INVALID/);
 assert.throws(()=>verifyFileForDelivery(file('fake.epub','application/epub+zip',Buffer.from('not zip'))),/FILE_SIGNATURE_INVALID/);
 assert.throws(()=>verifyFileForDelivery(file('wrong.exe','application/octet-stream',pdf)),/UNSUPPORTED_FILE_FORMAT/);
 const cache=new EphemeralFiles();
 assert.throws(()=>stageHandoff(cache,good,'http://artifacts.example.test'),/INVALID_DOWNLOAD_ORIGIN/);
 assert.equal(cache.size,0);
});

test('small binary MCP resource is owner-scoped, intact, and does not consume HTTPS URL',()=>{
 const files=new EphemeralFiles(()=>0);
 const payload=file('tiny.zip','application/zip',zip);
 const h=stageHandoff(files,payload,'https://artifacts.example.test','github:alice');
 assert.match(h.resourceUri,/^github-artifact-fetcher:\/\/files\/[a-f0-9]{64}$/);
 const id=h.resourceUri.split('/').pop();
 assert.equal(files.resource(id,'github:bob'),null);
 const result=files.resource(id,'github:alice');
 assert.equal(result.mimeType,'application/zip');
 assert.equal(createHash('sha256').update(Buffer.from(result.blob,'base64')).digest('hex'),h.sha256);
 assert.equal(files.serve(id,response()),true);
 assert.equal(files.resource(id,'github:alice'),null);
});
test('large binary keeps HTTPS handoff without MCP resource',()=>{
 const files=new EphemeralFiles(()=>0);
 const bytes=Buffer.concat([zip,Buffer.alloc(5*1024*1024)]);
 const h=stageHandoff(files,file('large.zip','application/zip',bytes),'https://artifacts.example.test','github:alice');
 assert.equal(h.resourceUri,undefined);
 assert.ok(h.downloadUrl.startsWith('https://'));
});
test('expired MCP resources are denied',()=>{
 let clock=0;
 const files=new EphemeralFiles(()=>clock);
 const h=stageHandoff(files,file('tiny.zip','application/zip',zip),'https://artifacts.example.test','github:alice');
 const id=h.resourceUri.split('/').pop();
 clock=120001;
 assert.equal(files.resource(id,'github:alice'),null);
});

test('tool handoff size boundary is exactly 5 MiB and preserves binary',()=>{
 const files=new EphemeralFiles(()=>0);
 const make=(n)=>Buffer.concat([zip,Buffer.alloc(n-zip.length)]);
 const small=file('max.zip','application/zip',make(5*1024*1024));
 const handoff=stageHandoff(files,small,'https://artifacts.example.test','github:alice');
 assert.ok(handoff.resourceUri);
 const binary=files.resource(handoff.resourceUri.split('/').pop(),'github:alice');
 assert.equal(Buffer.from(binary.blob,'base64').length,5*1024*1024);
 assert.equal(createHash('sha256').update(Buffer.from(binary.blob,'base64')).digest('hex'),handoff.sha256);
 const large=stageHandoff(files,file('oversized.zip','application/zip',make(5*5*1024*1024+1)),'https://artifacts.example.test','github:alice');
 assert.equal(large.resourceUri,undefined);
 assert.ok(large.downloadUrl.startsWith('https://'));
});

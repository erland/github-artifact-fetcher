import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {EphemeralFiles} from '../dist/file-delivery.js';
import {createServer} from '../dist/server.js';
const content=Buffer.from('hello PDF');
const sha=createHash('sha256').update(content).digest('hex');
const sample={filename:'sample.pdf',mimeType:'application/pdf',sizeBytes:content.length,sha256:sha,dataBase64:content.toString('base64')};
test('short-lived one-time HTTPS link cannot be reused',()=>{
 let clock=0;const files=new EphemeralFiles(()=>clock);
 const link=files.stage(sample,'https://download.example.test');
 assert.equal(new URL(link.url).protocol,'https:');
 const responses=[];
 function response(){return {writeHead:(code,headers)=>responses.push({code,headers}),end:b=>responses.push(b)};}
 assert.equal(files.serve(new URL(link.url).pathname.split('/').pop(),response()),true);
 assert.equal(files.serve(new URL(link.url).pathname.split('/').pop(),response()),false);
 assert.equal(files.size,0);
});
test('expiry, integrity and storage cap are fail-closed',()=>{
 let clock=0;const files=new EphemeralFiles(()=>clock,1,500);
 const a=files.stage(sample,'https://download.example.test');
 assert.throws(()=>files.stage(sample,'https://download.example.test'),/FILE_CAPACITY_EXCEEDED/);
 clock=501;
 assert.equal(files.serve(new URL(a.url).pathname.split('/').pop(),{writeHead(){},end(){}}),false);
 assert.throws(()=>files.stage({...sample,sha256:'0'.repeat(64)},'https://download.example.test'),/FILE_INTEGRITY_FAILED/);
});

test('total memory budget and HTTPS-origin enforcement',()=>{
 const files=new EphemeralFiles(()=>0,16,120000,content.length);
 files.stage(sample,'https://download.example.test');
 assert.throws(()=>files.stage(sample,'https://download.example.test'),/FILE_CAPACITY_EXCEEDED/);
 assert.throws(()=>new EphemeralFiles().stage(sample,'http://localhost:3000'),/INVALID_DOWNLOAD_ORIGIN/);
});

#!/usr/bin/env node
// Live HTTPS handoff check. Never print the bearer URL or raw response body.
import {createHash,timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const fail=(reason)=>{console.error('LIVE_HANDOFF_FAIL:',reason);process.exitCode=1;};
const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
const descriptorPath=process.env.GHAF_HANDOFF_FILE;
if(!descriptorPath){fail('GHAF_HANDOFF_FILE is required (file containing MCP handoff JSON)');process.exit();}
let d;
try{d=JSON.parse(await readFile(descriptorPath,'utf8'));}catch{fail('cannot read handoff descriptor');process.exit();}
const base=process.env.GHAF_EXPECTED_ORIGIN??'https://github-artifact-fetcher.apphome.one';
let url,origin;
try{url=new URL(d.downloadUrl);origin=new URL(base).origin;}catch{fail('invalid URL or origin');process.exit();}
if(url.protocol!=='https:'||url.origin!==origin||!/^\/downloads\/[a-f0-9]{64}$/.test(url.pathname)||url.search||url.hash){fail('unexpected download URL');process.exit();}
if(d.delivery!=='one_time_https_url'||d.nativeAttachment!==false||!Number.isSafeInteger(d.sizeBytes)||d.sizeBytes<=0||d.sizeBytes>20*1024*1024||!/^[a-f0-9]{64}$/.test(d.sha256)||!Number.isFinite(Date.parse(d.expiresAt))){fail('invalid handoff descriptor');process.exit();}
if(Date.parse(d.expiresAt)<=Date.now()+5000){fail('handoff link expires too soon; generate a fresh descriptor');process.exit();}
try{
 const opts={redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000)};
 const first=await fetch(url,opts);
 if(first.status!==200){fail('first GET HTTP '+first.status);process.exit();}
 const bytes=Buffer.from(await first.arrayBuffer());
 if(bytes.length!==d.sizeBytes){fail('byte size mismatch');process.exit();}
 const sha=createHash('sha256').update(bytes).digest('hex');
 if(!equal(sha,d.sha256)){fail('SHA-256 mismatch');process.exit();}
 if(!equal(first.headers.get('x-checksum-sha256')??'',d.sha256)){fail('checksum header mismatch');process.exit();}
 if((first.headers.get('content-type')??'').split(';')[0]!==d.mimeType){fail('MIME mismatch');process.exit();}
 if((first.headers.get('cache-control')??'').toLowerCase()!=='no-store'){fail('cache-control mismatch');process.exit();}
 console.log('PASS first download: 200, length, SHA-256, headers');
 const second=await fetch(url,{...opts,signal:AbortSignal.timeout(15000)});
 if(second.status!==404&&second.status!==410){fail('replay should return 404/410 but was HTTP '+second.status);process.exit();}
 console.log('PASS replay rejected with HTTP '+second.status);
 console.log('PASS live one-time HTTPS delivery (file not persisted)');
}catch(e){fail('network/request failure: '+(e instanceof Error?e.name:'unknown'));}

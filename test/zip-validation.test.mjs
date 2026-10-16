import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {validateZip} from '../dist/zip-validation.js';
function crc(b){let c=0xffffffff;for(const x of b){c^=x;for(let k=0;k<8;k++)c=(c>>>1)^(c&1?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function archive(name='safe.txt',data=Buffer.from('hello'),method=8){
 const n=Buffer.from(name),z=method===8?deflateRawSync(data):data;
 const a=Buffer.alloc(30+n.length+z.length),b=Buffer.alloc(46+n.length),end=Buffer.alloc(22);
 a.writeUInt32LE(0x04034b50,0);a.writeUInt16LE(20,4);a.writeUInt16LE(0x800,6);a.writeUInt16LE(method,8);a.writeUInt32LE(crc(data),14);a.writeUInt32LE(z.length,18);a.writeUInt32LE(data.length,22);a.writeUInt16LE(n.length,26);n.copy(a,30);z.copy(a,30+n.length);
 b.writeUInt32LE(0x02014b50,0);b.writeUInt16LE(20,4);b.writeUInt16LE(20,6);b.writeUInt16LE(0x800,8);b.writeUInt16LE(method,10);b.writeUInt32LE(crc(data),16);b.writeUInt32LE(z.length,20);b.writeUInt32LE(data.length,24);b.writeUInt16LE(n.length,28);n.copy(b,46);
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(b.length,12);end.writeUInt32LE(a.length,16);
 return Buffer.concat([a,b,end]);
}
test('fully inspect stored and deflated ZIP entries',()=>{
 for(const method of [0,8])assert.deepEqual(validateZip(archive('folder/file.txt',Buffer.from('hello'),method)),{entries:1,uncompressedBytes:5});
});
test('reject path traversal, absolute and Windows paths',()=>{
 for(const name of ['../evil','root/../evil','/etc/passwd','C:/secret','bad\\name'])assert.throws(()=>validateZip(archive(name)),/INVALID_ZIP/);
});
test('reject corrupt central directory, mismatched CRC and local filenames',()=>{
 const bad=archive();bad.writeUInt32LE(1,bad.length-22+12);assert.throws(()=>validateZip(bad),/INVALID_ZIP/);
 const crcBad=archive();crcBad.writeUInt32LE(0,crcBad.readUInt32LE(crcBad.length-22+16)+16);assert.throws(()=>validateZip(crcBad),/INVALID_ZIP/);
 const localNameBad=archive();localNameBad[30]=88;assert.throws(()=>validateZip(localNameBad),/INVALID_ZIP/);
});
test('reject malicious decompression ratios and oversized expanded bytes',()=>{
 assert.throws(()=>validateZip(archive('inflate.txt',Buffer.alloc(1024*1024))),/ZIP_BOMB/);
});
test('reject truncated ZIP and unsupported flags',()=>{
 assert.throws(()=>validateZip(archive().subarray(0,40)),/INVALID_ZIP/);
 const encrypted=archive();encrypted.writeUInt16LE(0x801,6);encrypted.writeUInt16LE(0x801,encrypted.readUInt32LE(encrypted.length-22+16)+8);assert.throws(()=>validateZip(encrypted),/INVALID_ZIP/);
});

test('reject ambiguous ZIP prefix and unaccounted local data',()=>{
 const valid=archive('ok.txt');
 const prefixed=Buffer.concat([Buffer.from('prefix'),valid]);
 assert.throws(()=>validateZip(prefixed),/INVALID_ZIP/);
 const central=valid.readUInt32LE(valid.length-22+16);
 const padded=Buffer.concat([valid.subarray(0,central),Buffer.from([1,2,3]),valid.subarray(central)]);
 padded.writeUInt32LE(central+3,padded.length-22+16);
 assert.throws(()=>validateZip(padded),/INVALID_ZIP/);
});

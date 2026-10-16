import {inflateRawSync} from 'node:zlib';
const MAX_ENTRIES=2000,MAX_UNCOMPRESSED=100*1024*1024,MAX_ENTRY=32*1024*1024,MAX_RATIO=100;
function invalid():never{throw Error('INVALID_ZIP');}
function crc32(b:Buffer){let c=0xffffffff;for(const x of b){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^(c&1?0xedb88320:0);}return (c^0xffffffff)>>>0;}
export function validateZip(buf:Buffer):{entries:number;uncompressedBytes:number}{
 if(buf.length<22)invalid();
 let eocd=-1;
 for(let i=buf.length-22;i>=Math.max(0,buf.length-22-65535);i--)if(buf.readUInt32LE(i)===0x06054b50&&i+22+buf.readUInt16LE(i+20)===buf.length){eocd=i;break;}
 if(eocd<0)invalid();
 const disks=buf.readUInt16LE(eocd+4),disk2=buf.readUInt16LE(eocd+6),onDisk=buf.readUInt16LE(eocd+8),entries=buf.readUInt16LE(eocd+10),size=buf.readUInt32LE(eocd+12),offset=buf.readUInt32LE(eocd+16);
 if(disks||disk2||onDisk!==entries||entries>MAX_ENTRIES||entries===65535||size===0xffffffff||offset===0xffffffff||offset+size!==eocd)invalid();
 let cursor=offset,total=0;const ranges:Array<[number,number]>=[],seen=new Set<string>();
 for(let i=0;i<entries;i++){
  if(cursor+46>eocd||buf.readUInt32LE(cursor)!==0x02014b50)invalid();
  const flags=buf.readUInt16LE(cursor+8),method=buf.readUInt16LE(cursor+10),crc=buf.readUInt32LE(cursor+16),compressed=buf.readUInt32LE(cursor+20),raw=buf.readUInt32LE(cursor+24),n=buf.readUInt16LE(cursor+28),extra=buf.readUInt16LE(cursor+30),comment=buf.readUInt16LE(cursor+32),disk=buf.readUInt16LE(cursor+34),local=buf.readUInt32LE(cursor+42);
  if(flags&1||flags&8||![0,8].includes(method)||disk||compressed===0xffffffff||raw===0xffffffff||local===0xffffffff||raw>MAX_ENTRY||compressed>buf.length||cursor+46+n+extra+comment>eocd)invalid();
  const name=buf.subarray(cursor+46,cursor+46+n).toString('utf8');
  if(!name||name.includes('\\')||name.startsWith('/')||/^[A-Za-z]:/.test(name)||name.split('/').some(x=>x==='..'||x==='.')||name.includes('\0')||seen.has(name))invalid();
  seen.add(name);
  const unixMode=buf.readUInt32LE(cursor+38)>>>16;
  if((buf.readUInt16LE(cursor+4)>>>8)===3&&unixMode!==0&&((unixMode&0xf000)!==0x8000&&(unixMode&0xf000)!==0x4000))invalid();
  if(raw>0&&compressed===0||raw>compressed*MAX_RATIO&&raw>1024)throw Error('ZIP_BOMB');
  total+=raw;if(total>MAX_UNCOMPRESSED)throw Error('ZIP_BOMB');
  if(local+30>offset||buf.readUInt32LE(local)!==0x04034b50)invalid();
  const lf=buf.readUInt16LE(local+6),lm=buf.readUInt16LE(local+8),ln=buf.readUInt16LE(local+26),le=buf.readUInt16LE(local+28);
  if(lf!==flags||lm!==method||ln!==n||local+30+ln+le+compressed>offset||!buf.subarray(local+30,local+30+n).equals(buf.subarray(cursor+46,cursor+46+n)))invalid();
  const start=local+30+ln+le,part=buf.subarray(start,start+compressed);
  let expanded:Buffer;
  try{expanded=method===0?part:inflateRawSync(part,{maxOutputLength:MAX_ENTRY+1});}catch{invalid();}
  if(expanded.length!==raw||crc32(expanded)!==crc)invalid();
  ranges.push([local,start+compressed]);cursor+=46+n+extra+comment;
 }
 if(cursor!==eocd||ranges.some(([a,b],i)=>ranges.some(([c,d],j)=>i!==j&&a<d&&c<b)))invalid();
 return {entries,uncompressedBytes:total};
}

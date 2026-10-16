import {createHash} from 'node:crypto';
import type {FileOutput} from './releases.js';
export type FileFormat='zip'|'pdf'|'epub';
export type FileHandoff={schemaVersion:1;delivery:'one_time_https_url';nativeAttachment:false;filename:string;mimeType:string;sizeBytes:number;sha256:string;downloadUrl:string;expiresAt:string};
const formats:Record<FileFormat,string>={zip:'application/zip',pdf:'application/pdf',epub:'application/epub+zip'};
export function fileFormat(name:string):FileFormat{
 const suffix=/\.([A-Za-z]+)$/.exec(name)?.[1]?.toLowerCase();
 if(!suffix||!(suffix in formats))throw Error('UNSUPPORTED_FILE_FORMAT');
 return suffix as FileFormat;
}
export function verifyFileForDelivery(file:FileOutput):void{
 const format=fileFormat(file.filename);
 if(file.mimeType!==formats[format])throw Error('FILE_MIME_MISMATCH');
 if(!Number.isSafeInteger(file.sizeBytes)||file.sizeBytes<1||file.sizeBytes>20*1024*1024)throw Error('FILE_SIZE_INVALID');
 const bytes=Buffer.from(file.dataBase64,'base64');
 if(bytes.length!==file.sizeBytes||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('FILE_INTEGRITY_FAILED');
 if(format==='pdf'&&!bytes.subarray(0,8).toString('latin1').startsWith('%PDF-'))throw Error('FILE_SIGNATURE_INVALID');
 if((format==='zip'||format==='epub')&&bytes.subarray(0,2).toString()!=='PK')throw Error('FILE_SIGNATURE_INVALID');
}
export function handoffContract(file:FileOutput,staged:{url:string;expiresAt:string}):FileHandoff{
 verifyFileForDelivery(file);
 const u=new URL(staged.url);
 if(u.protocol!=='https:'||u.username||u.password||u.hash)throw Error('INVALID_DOWNLOAD_ORIGIN');
 return {schemaVersion:1,delivery:'one_time_https_url',nativeAttachment:false,filename:file.filename,mimeType:file.mimeType,sizeBytes:file.sizeBytes,sha256:file.sha256,downloadUrl:staged.url,expiresAt:staged.expiresAt};
}

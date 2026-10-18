import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LIBRARY_UPLOAD_WIDGET_URI,libraryUploadWidgetHtml} from '../dist/library-upload-widget.js';

test('experimental Library widget requests explicit user consent and keeps binary out of MCP',()=>{
 assert.equal(LIBRARY_UPLOAD_WIDGET_URI,'ui://github-artifact-fetcher/library-upload.html');
 assert.match(libraryUploadWidgetHtml,/addEventListener\('click'/);
 assert.match(libraryUploadWidgetHtml,/uploadFile\(file,\{library:true\}\)/);
 assert.match(libraryUploadWidgetHtml,/fetch\(u\.toString\(\)/);
 assert.match(libraryUploadWidgetHtml,/response\.blob\(\)/);
 assert.match(libraryUploadWidgetHtml,/blob\.size!==item\.sizeBytes/);
 assert.match(libraryUploadWidgetHtml,/GitHub-länken/);
 assert.doesNotMatch(libraryUploadWidgetHtml,/read_small_file|atob\(/);
});

test('widget distinguishes upload receipt from Library verification',()=>{
 assert.match(libraryUploadWidgetHtml,/getFileDownloadUrl/);
 assert.match(libraryUploadWidgetHtml,/selectFiles/);
 assert.match(libraryUploadWidgetHtml,/Kontrollera biblioteket/);
 assert.match(libraryUploadWidgetHtml,/Bibliotekslagring är inte verifierad/);
 assert.doesNotMatch(libraryUploadWidgetHtml,/Uppladdning rapporterad av ChatGPT/);
});

test('readback verifies actual bytes, size and SHA-256 independently of Library visibility',()=>{
 assert.match(libraryUploadWidgetHtml,/crypto\.subtle\.digest\('SHA-256',bytes\)/);
 assert.match(libraryUploadWidgetHtml,/bytes\.size!==item\.sizeBytes/);
 assert.match(libraryUploadWidgetHtml,/hash\.toLowerCase\(\)!==item\.sha256\.toLowerCase\(\)/);
 assert.match(libraryUploadWidgetHtml,/verifyReadback\(readback\.downloadUrl\)/);
 assert.match(libraryUploadWidgetHtml,/Integritet verifierad/);
 assert.match(libraryUploadWidgetHtml,/Bibliotekslagring är fortfarande inte verifierad/);
});

test('conversation handoff is explicit and does not claim an attachment',()=>{
 assert.match(libraryUploadWidgetHtml,/sendFollowUpMessage/);
 assert.match(libraryUploadWidgetHtml,/Testa i konversationen/);
 assert.match(libraryUploadWidgetHtml,/Ingen fil är bifogad automatiskt/);
 assert.match(libraryUploadWidgetHtml,/Detta bifogar inte filen/);
});

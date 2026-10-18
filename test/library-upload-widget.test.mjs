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

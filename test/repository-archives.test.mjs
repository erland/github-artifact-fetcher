import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {RepositoryArchives} from '../dist/repository-archives.js';
const commit='a'.repeat(40),zip=Buffer.from([80,75,3,4,0,0,0,0]);
const identity={repositoryAllowed:async(user,owner,name)=>user==='github:1'&&owner==='demo'&&name==='repo',tokenFor:async()=> 'secret'};
function setup(settings={}){
 const calls=[];
 const fetcher=async(url,init)=>{
  calls.push({url,authorization:init.headers?.authorization});
  if(url.includes('/git/ref/'))return new Response(JSON.stringify({object:{sha:commit}}));
  if(url.includes('/git/commits/'))return new Response(JSON.stringify({sha:commit}));
  if(url.includes('/zipball/'))return new Response(null,{status:302,headers:{location:settings.redirect??'https://codeload.github.com/demo/repo/legacy.zip'}});
  if(url.startsWith('https://codeload.github.com/'))return new Response(settings.bytes??zip);
  throw Error('unexpected '+url);
 };
 return {api:new RepositoryArchives(identity,fetcher),calls};
}
test('explicit branch ZIP resolves SHA and removes credentials on CDN',async()=>{
 const {api,calls}=setup();
 const result=await api.download('github:1','demo/repo',{kind:'branch',value:'feature/new'});
 assert.equal(result.mimeType,'application/zip');
 assert.deepEqual(Buffer.from(result.dataBase64,'base64'),zip);
 assert.equal(result.sha256,createHash('sha256').update(zip).digest('hex'));
 assert.equal(result.filename,'repo-'+commit.slice(0,12)+'.zip');
 assert.equal(calls.at(-1).authorization,undefined);
 assert.match(calls[0].url,/heads\/feature\/new/);
});
test('tag and commit explicitly resolved',async()=>{
 const tag=setup();await tag.api.download('github:1','demo/repo',{kind:'tag',value:'v2'});assert.match(tag.calls[0].url,/tags\/v2/);
 const revision=setup();await revision.api.download('github:1','demo/repo',{kind:'commit',value:commit});assert.match(revision.calls[0].url,/git\/commits/);
});
test('no access, malformed refs and traversal rejected',async()=>{
 const {api}=setup();
 await assert.rejects(api.download('other','demo/repo',{kind:'branch',value:'main'}),/FORBIDDEN/);
 for(const bad of ['../main','main.lock','x..y','a//b','@{a}','a?b'])await assert.rejects(api.download('github:1','demo/repo',{kind:'branch',value:bad}),/INVALID_REF/);
 await assert.rejects(api.download('github:1','demo/repo',{kind:'commit',value:'main'}),/INVALID_REF/);
 await assert.rejects(api.download('github:1','../repo',{kind:'branch',value:'main'}),/INVALID_REPOSITORY/);
});
test('redirect and archive signature checked',async()=>{
 await assert.rejects(setup({redirect:'https://attacker.example/bad'}).api.download('github:1','demo/repo',{kind:'branch',value:'main'}),/UNTRUSTED_REDIRECT/);
 await assert.rejects(setup({bytes:Buffer.from('not zip')}).api.download('github:1','demo/repo',{kind:'branch',value:'main'}),/INVALID_ZIP/);
});

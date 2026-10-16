import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from '../dist/server.js';
import {createDatabaseProbe} from '../dist/database.js';

test('readiness refuses inaccessible database', async()=>{
 const server=createServer({database:{ready:async()=>false,close:async()=>{}}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {const response=await fetch('http://127.0.0.1:'+server.address().port+'/ready');assert.equal(response.status,503);}
 finally {await new Promise(resolve=>server.close(resolve));}
});
test('readiness accepts migrated database', async()=>{
 const server=createServer({database:{ready:async()=>true,close:async()=>{}}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {const response=await fetch('http://127.0.0.1:'+server.address().port+'/ready');assert.equal(response.status,200);}
 finally {await new Promise(resolve=>server.close(resolve));}
});
test('PostgreSQL integration verifies migration, runtime access and revoked DDL', {skip: !process.env.TEST_DATABASE_URL},async()=>{
 const db=createDatabaseProbe(process.env.TEST_DATABASE_URL);
 try {assert.equal(await db.ready(),true);} finally {await db.close();}
});

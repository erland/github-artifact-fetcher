import {test} from 'node:test';
import assert from 'node:assert/strict';
import {databaseConfig} from '../dist/database.js';
test('split PostgreSQL config preserves reserved password characters',()=>{
 const p=databaseConfig({DB_HOST:'postgres.internal',DB_PORT:'6543',DB_NAME:'artifact',DB_USER:'app',DB_PASSWORD:'!@:/?#%+&'});
 assert.equal(p.host,'postgres.internal');assert.equal(p.database,'artifact');assert.equal(p.port,6543);
 assert.equal(p.password,'!@:/?#%+&');assert.equal(p.connectionString,undefined);
});
test('legacy database URL remains supported',()=>assert.equal(databaseConfig({DATABASE_URL:'postgres://example.test/db'}).connectionString,'postgres://example.test/db'));
test('missing and invalid PostgreSQL settings fail closed',()=>{
 assert.throws(()=>databaseConfig({}),/MISSING_DATABASE_CONFIG/);
 for(const port of ['0','65536','invalid'])assert.throws(()=>databaseConfig({DB_HOST:'host',DB_NAME:'db',DB_USER:'user',DB_PASSWORD:'secret',DB_PORT:port}),/INVALID_DB_PORT/);
});

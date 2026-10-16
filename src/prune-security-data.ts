import {Pool} from 'pg';
import {SecurityRetention} from './security-retention.js';

if(!process.env.DATABASE_URL)throw Error('DATABASE_URL required');
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2});
try{
 const report=await new SecurityRetention(pool).prune(Number(process.env.RETENTION_BATCH??500));
 process.stdout.write(JSON.stringify({event:'security_retention',...report})+'\n');
}finally{await pool.end();}

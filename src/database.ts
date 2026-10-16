import { Pool, type PoolConfig } from 'pg';

export interface DatabaseProbe { ready(): Promise<boolean>; close(): Promise<void> }
export function databaseConfig(env:NodeJS.ProcessEnv=process.env):PoolConfig {
 const complete=['DB_HOST','DB_NAME','DB_USER','DB_PASSWORD'].every(name=>!!env[name]);
 if(complete){
  const port=Number(env.DB_PORT??5432);
  if(!Number.isSafeInteger(port)||port<1||port>65535)throw Error('INVALID_DB_PORT');
  return {host:env.DB_HOST,database:env.DB_NAME,user:env.DB_USER,password:env.DB_PASSWORD,port};
 }
 if(env.DATABASE_URL)return {connectionString:env.DATABASE_URL};
 throw Error('MISSING_DATABASE_CONFIG');
}
export function createDatabaseProbe(config:PoolConfig|string):DatabaseProbe {
 const pool=new Pool({...typeof config==='string'?{connectionString:config}:config,max:3,connectionTimeoutMillis:3000});
 return {
  async ready() {
   try {
    const result=await pool.query('SELECT id FROM service_metadata WHERE id = 1');
    return result.rowCount===1;
   } catch {return false;}
  },
  async close(){await pool.end();}
 };
}

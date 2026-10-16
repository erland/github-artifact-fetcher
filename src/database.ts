import { Pool } from 'pg';

export interface DatabaseProbe { ready(): Promise<boolean>; close(): Promise<void> }
export function createDatabaseProbe(url: string): DatabaseProbe {
 const pool = new Pool({connectionString:url,max:3,connectionTimeoutMillis:3000});
 return {
  async ready() {
   try {
    const result=await pool.query('SELECT id FROM service_metadata WHERE id = 1');
    return result.rowCount === 1;
   } catch { return false; }
  },
  async close(){await pool.end();}
 };
}

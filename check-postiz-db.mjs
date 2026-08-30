import { execSync } from 'node:child_process';

const sql = `SELECT * FROM "User";`;
try {
  const out = execSync(`docker exec -i postiz-postgres psql -U postiz-user -d postiz-db-local`, {
    input: sql
  }).toString();
  console.log('Postiz Users in DB:');
  console.log(out);
} catch (e) {
  console.error('DB query error:', e.message);
}

import { execSync } from 'node:child_process';

const hash = '$2b$10$mVE/oBz9ja6JrLNALDy4x.JNOrUz54pwPV6NgoUQZB3cSS.bos.JO';
const sql = `UPDATE "User" SET password = '${hash}', "providerName" = 'LOCAL', "isSuperAdmin" = true WHERE email = 'muzzamilhassan302@gmail.com';`;

try {
  const out = execSync(`docker exec -i postiz-postgres psql -U postiz-user -d postiz-db-local`, {
    input: sql
  }).toString();
  console.log('Update result:', out);
} catch (e) {
  console.error('Update error:', e.message);
}

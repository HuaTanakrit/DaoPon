require('dotenv').config({ quiet: true });
const { spawnSync } = require('node:child_process');
const path = require('node:path');

if (!process.env.DATABASE_URL?.trim()) {
  console.error('DATABASE_URL is empty. Add your PostgreSQL/Neon connection string to .env first.');
  process.exit(1);
}
const result = spawnSync(process.execPath, [
  path.resolve(__dirname, '../node_modules/prisma/build/index.js'), 'migrate', 'deploy',
], { stdio: 'inherit', env: process.env });
process.exit(result.status ?? 1);

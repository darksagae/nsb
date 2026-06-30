import { execSync } from 'node:child_process';

const prismaUrl = process.env.POSTGRES_PRISMA_URL?.trim();
const directUrl = process.env.POSTGRES_URL_NON_POOLING?.trim();

if (!prismaUrl || !directUrl) {
  console.error(
    'Missing POSTGRES_PRISMA_URL or POSTGRES_URL_NON_POOLING. ' +
      'Link Neon in Vercel (Storage → Neon) or run: vercel env pull .env.local',
  );
  process.exit(1);
}

const run = (cmd) => execSync(cmd, { stdio: 'inherit', env: process.env });

try {
  run(
    'npx prisma migrate resolve --rolled-back 20260506192431_add_invoices_vehicle_tax_rates',
  );
} catch {
  // already resolved or not needed
}

try {
  run('npx prisma migrate deploy');
} catch {
  // Recover from a previously failed deploy (e.g. partial migration on Vercel).
  try {
    run(
      'npx prisma migrate resolve --rolled-back 20260629120000_user_machine_binding',
    );
  } catch {
    // not in failed state
  }
  try {
    run(
      'npx prisma migrate resolve --rolled-back 20260629140000_admin_commands_and_ban',
    );
  } catch {
    // not in failed state
  }
  run('npx prisma migrate deploy');
}
run('npx prisma generate');
run('npx next build');

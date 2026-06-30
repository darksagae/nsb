import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Hostname from the Vercel + Neon integration connection string (for diagnostics only). */
export function getDatabaseHost(): string | null {
  const url = process.env.POSTGRES_PRISMA_URL?.trim() || '';
  if (!url) return null;
  const match = url.match(/@([^/?]+)/);
  return match?.[1]?.split(':')[0] ?? null;
}

function createPrisma() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

// Reuse one client per serverless instance (Vercel) and in dev (HMR).
export const prisma = globalForPrisma.prisma ?? createPrisma();
if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = prisma;
}

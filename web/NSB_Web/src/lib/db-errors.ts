/** True when Prisma cannot open a connection (Neon paused, wrong URL, firewall, etc.). */
export function isDatabaseUnreachable(error: unknown): boolean {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code: string }).code === 'P1001'
  ) {
    return true;
  }
  if (error instanceof Error) {
    return /Can't reach database server|P1001|connection timed out|ECONNREFUSED/i.test(
      error.message,
    );
  }
  return false;
}

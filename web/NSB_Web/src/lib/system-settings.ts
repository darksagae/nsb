import { createPresignedGetUrl } from '@/lib/s3-config';
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export const SETTING_KEYS = {
  mvLocked: 'mv_database_locked',
  mvMonth: 'mv_database_month',
  mvRowCount: 'mv_database_row_count',
  mvImportedAt: 'mv_database_imported_at',
  mvPdfKey: 'mv_database_pdf_key',
  exchangeTax: 'exchange_rate_tax',
  exchangeCnf: 'exchange_rate_cnf',
  exchangeTaxLocked: 'exchange_rate_tax_locked',
  exchangeUpdatedAt: 'exchange_rates_updated_at',
  settingsVersion: 'system_settings_version',
} as const;

export async function readSettings(keys: string[]): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  return map;
}

export async function upsertSetting(key: string, value: string) {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function bumpSettingsVersion(): Promise<string> {
  const next = String(Date.now());
  await upsertSetting(SETTING_KEYS.settingsVersion, next);
  return next;
}

export async function queueFleetCommand(command: string, payload: Record<string, unknown>) {
  const users = await prisma.salesUser.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  if (users.length === 0) return 0;

  const jsonPayload = payload as Prisma.InputJsonValue;

  await prisma.adminCommand.createMany({
    data: users.map((u) => ({
      userId: u.id,
      command,
      payload: jsonPayload,
    })),
  });
  return users.length;
}

export async function getMvDatabaseSettings() {
  const map = await readSettings([
    SETTING_KEYS.mvLocked,
    SETTING_KEYS.mvMonth,
    SETTING_KEYS.mvRowCount,
    SETTING_KEYS.mvImportedAt,
    SETTING_KEYS.mvPdfKey,
  ]);

  let pdfUrl: string | null = null;
  const pdfKey = map[SETTING_KEYS.mvPdfKey];
  if (pdfKey) {
    try {
      pdfUrl = await createPresignedGetUrl(pdfKey, 3600, 'mv-database.pdf');
    } catch {
      pdfUrl = null;
    }
  }

  return {
    locked: map[SETTING_KEYS.mvLocked] === 'true',
    month: map[SETTING_KEYS.mvMonth] ?? '',
    rowCount: Number(map[SETTING_KEYS.mvRowCount] ?? 0),
    importedAt: map[SETTING_KEYS.mvImportedAt] ?? null,
    pdfKey: pdfKey ?? null,
    pdfUrl,
  };
}

export async function getExchangeRateSettings() {
  const map = await readSettings([
    SETTING_KEYS.exchangeTax,
    SETTING_KEYS.exchangeCnf,
    SETTING_KEYS.exchangeTaxLocked,
    SETTING_KEYS.exchangeUpdatedAt,
  ]);

  const taxRate = Number(map[SETTING_KEYS.exchangeTax] ?? 3834.56);
  const cnfRate = Number(map[SETTING_KEYS.exchangeCnf] ?? taxRate);

  return {
    taxRate: Number.isFinite(taxRate) ? taxRate : 3834.56,
    taxRateLocked: map[SETTING_KEYS.exchangeTaxLocked] === 'true',
    cnfRate: Number.isFinite(cnfRate) ? cnfRate : taxRate,
    cnfRateLocked: false,
    updatedAt: map[SETTING_KEYS.exchangeUpdatedAt] ?? null,
  };
}

export async function getSystemSettingsPayload() {
  const [mvDatabase, exchangeRates, versionMap] = await Promise.all([
    getMvDatabaseSettings(),
    getExchangeRateSettings(),
    readSettings([SETTING_KEYS.settingsVersion]),
  ]);

  return {
    version: versionMap[SETTING_KEYS.settingsVersion] ?? '0',
    mvDatabase,
    exchangeRates,
  };
}

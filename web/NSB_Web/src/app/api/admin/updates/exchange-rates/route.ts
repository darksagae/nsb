import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-auth';
import {
  SETTING_KEYS,
  bumpSettingsVersion,
  getExchangeRateSettings,
  queueFleetCommand,
  upsertSetting,
} from '@/lib/system-settings';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  const admin = await requireAdminApi(request);
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const taxRaw = body.taxRate ?? body.tax_rate;
    const cnfRaw = body.cnfRate ?? body.cnf_rate ?? body.phase1Rate ?? body.phase1_rate;

    const current = await getExchangeRateSettings();
    const taxRate = taxRaw != null ? Number(taxRaw) : current.taxRate;
    const cnfRate = cnfRaw != null ? Number(cnfRaw) : current.cnfRate;

    if (!Number.isFinite(taxRate) || taxRate <= 0) {
      return NextResponse.json({ error: 'Invalid tax exchange rate' }, { status: 400 });
    }
    if (!Number.isFinite(cnfRate) || cnfRate <= 0) {
      return NextResponse.json({ error: 'Invalid C&F exchange rate' }, { status: 400 });
    }

    const now = new Date().toISOString();
    await Promise.all([
      upsertSetting(SETTING_KEYS.exchangeTax, String(taxRate)),
      upsertSetting(SETTING_KEYS.exchangeCnf, String(cnfRate)),
      upsertSetting(SETTING_KEYS.exchangeTaxLocked, 'true'),
      upsertSetting(SETTING_KEYS.exchangeUpdatedAt, now),
    ]);

    const version = await bumpSettingsVersion();
    const queued = await queueFleetCommand('update_exchange_rates', {
      taxRate,
      cnfRate,
      taxRateLocked: true,
      cnfRateLocked: false,
      version,
    });

    await prisma.clientActivity.create({
      data: {
        userId: admin.id,
        action: 'admin_update_exchange_rates',
        metadata: { taxRate, cnfRate, by: admin.username, machinesQueued: queued },
      },
    });

    return NextResponse.json({
      ok: true,
      taxRate,
      cnfRate,
      taxRateLocked: true,
      cnfRateLocked: false,
      machinesQueued: queued,
      updatedAt: now,
    });
  } catch (e) {
    console.error('Exchange rates update error:', e);
    return NextResponse.json({ error: 'Failed to update exchange rates' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import Papa from 'papaparse';
import { parseMvDatabasePDF } from '@/lib/mv-pdf-parser';
import { GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getMvS3Client } from '@/lib/mv-s3';
import { getAwsS3Bucket } from '@/lib/s3-config';
import {
  SETTING_KEYS,
  bumpSettingsVersion,
  queueFleetCommand,
  upsertSetting,
} from '@/lib/system-settings';
import { createPresignedGetUrl } from '@/lib/s3-config';

export const maxDuration = 60; // Max timeout for Vercel Hobby plan

async function downloadFromS3(key: string): Promise<Buffer> {
  const bucket = getAwsS3Bucket();
  const res = await getMvS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const chunks: Uint8Array[] = [];
  for await (const chunk of res.Body as AsyncIterable<Uint8Array>) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function deleteFromS3(key: string) {
  const bucket = getAwsS3Bucket();
  try {
    await getMvS3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch { /* best-effort cleanup */ }
}


function n(v: unknown): number | null {
  const num = Number(v);
  return isNaN(num) ? null : num;
}

function mapCsvRow(row: Record<string, string>) {
  const getVal = (...keys: string[]) => {
    for (const key of keys) {
      const v = row[key];
      if (v !== undefined && v !== null && v !== '') return v.toString().trim();
    }
    return '';
  };

  return {
    make: getVal('make', 'brand'),
    model: getVal('model', 'name'),
    modelCode: getVal('modelcode', 'code') || null,
    bodyType: getVal('bodytype', 'body') || null,
    yearFrom: n(getVal('yearfrom', 'year_from', 'fromyear')),
    yearTo: n(getVal('yearto', 'year_to', 'toyear')),
    engineSizeCC: n(getVal('enginesizecc', 'enginecc', 'engine_cc', 'capacity', 'cc', 'displacement')),
    fuelType: getVal('fueltype', 'fuel') || null,
    fobValue: n(getVal('fobvalue', 'fob', 'fob_value')),
    customsValue: n(getVal('customsvalue', 'cif', 'cifusd', 'cif_usd', 'customs_value', 'customsvalueusd', 'value')),
    importDuty: n(getVal('importduty', 'import_duty')),
    exciseDuty: n(getVal('exciseduty', 'excise_duty')),
    vat: n(getVal('vat', 'vat_tax')),
    infrastructureLevy: n(getVal('infrastructurelevy', 'infra_levy', 'infrastructure_levy')),
    environmentalLevy: n(getVal('environmentallevy', 'env_levy', 'environmental_levy')),
    withholdingTax: n(getVal('withholdingtax', 'wht', 'withholding_tax')),
    registrationFee: n(getVal('registrationfee', 'reg_fee', 'registration_fee')),
    totalTaxUGX: n(getVal('totaltaxugx', 'total_tax', 'totaltax')),
    serialNumber: getVal('serialnumber', 'sn', 's_n', 'serial_number') || null,
    hscCode: getVal('hsccode', 'hs_code', 'hscode') || null,
    countryOrigin: getVal('countryorigin', 'coo', 'origin', 'country_origin') || null,
    description: getVal('description', 'desc', 'raw_description') || null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    let month: string;
    let s3Key: string | null = null;
    let file: File | null = null;

    if (isJson) {
      const body = await request.json();
      month = (body.month as string)?.trim();
      s3Key = (body.s3Key as string)?.trim() || null;
      if (!month) return NextResponse.json({ error: 'month is required (YYYY-MM)' }, { status: 400 });
      if (!s3Key) return NextResponse.json({ error: 's3Key is required' }, { status: 400 });
    } else {
      const formData = await request.formData();
      month = (formData.get('month') as string)?.trim();
      file = formData.get('file') as File | null;
      if (!month) return NextResponse.json({ error: 'month is required (YYYY-MM)' }, { status: 400 });
      if (!(file instanceof File)) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
      const directPdf =
        file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (directPdf) {
        return NextResponse.json(
          { error: 'PDF must be uploaded to S3 first. Use the Import flow (presigned upload), not direct file POST.' },
          { status: 400 },
        );
      }
    }

    const isPDF = s3Key ? true : (file!.type === 'application/pdf' || file!.name.toLowerCase().endsWith('.pdf'));

    type Row = ReturnType<typeof mapCsvRow>;
    let rows: Row[] = [];
    let diagnosticInfo: string | null = null;

    try {
      if (isPDF) {
        const buffer = s3Key
          ? await downloadFromS3(s3Key)
          : Buffer.from(await file!.arrayBuffer());
        const { rows: pdfRows, diagnostics } = await parseMvDatabasePDF(buffer);
        rows = pdfRows.map(r => ({
          make: r.make,
          model: r.model,
          modelCode: r.modelCode,
          bodyType: r.bodyType,
          yearFrom: r.yearFrom,
          yearTo: r.yearTo,
          engineSizeCC: r.engineSizeCC,
          fuelType: r.fuelType,
          fobValue: r.fobValue,
          customsValue: r.customsValue,
          importDuty: r.importDuty,
          exciseDuty: r.exciseDuty,
          vat: r.vat,
          infrastructureLevy: r.infrastructureLevy,
          environmentalLevy: r.environmentalLevy,
          withholdingTax: r.withholdingTax,
          registrationFee: r.registrationFee,
          totalTaxUGX: r.totalTaxUGX,
          serialNumber: r.serialNumber || null,
          hscCode: r.hscCode || null,
          countryOrigin: r.countryOrigin || null,
          description: r.description || null,
        }));
        diagnosticInfo = `Strategy: ${diagnostics.strategy || 'none'}. Lines: ${diagnostics.totalLinesFound}. Parsed: ${diagnostics.rowsParsed}.`;
        console.log('[MV Import PDF]', diagnosticInfo);
        console.log('[MV Import PDF] Header line:', diagnostics.detectedHeaderLine);
        console.log('[MV Import PDF] Raw text sample:', diagnostics.rawTextSample.slice(0, 300));
      } else {
        const text = await file!.text();
        const result = Papa.parse<Record<string, string>>(text, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (h) => h.toLowerCase().replace(/\s+/g, ''),
        });
        rows = result.data.map(mapCsvRow);
      }
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : 'Failed to parse file';
      console.error('[MV Import] Parse error:', msg);
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Only require make + model — don't filter on totalTaxUGX value
    // (column name might vary across PDF versions, so totalTaxUGX may be null)
    const validRows = rows.filter(r => r.make && r.model);

    if (validRows.length === 0) {
      const hint = isPDF
        ? `PDF was processed but no rows with Make + Model were found. ${diagnosticInfo ?? ''} Use the Diagnose endpoint at /api/mv-database/diagnose (POST the same PDF) to see the raw extracted text.`
        : 'No valid rows found in CSV. Each row must have at least a Make and Model column.';
      return NextResponse.json({ error: hint }, { status: 400 });
    }

    await prisma.$transaction([
      (prisma.vehicleTaxRate as any).deleteMany({
        where: { databaseMonth: month },
      }),
      (prisma.vehicleTaxRate as any).createMany({
        data: validRows.map(r => ({ ...r, databaseMonth: month, isActive: true })),
        skipDuplicates: false,
      }),
    ]);

    const rowCount = validRows.length.toString();
    await Promise.all([
      prisma.setting.upsert({ where: { key: 'mv_database_locked' }, create: { key: 'mv_database_locked', value: 'true' }, update: { value: 'true' } }),
      prisma.setting.upsert({ where: { key: 'mv_database_month' }, create: { key: 'mv_database_month', value: month }, update: { value: month } }),
      prisma.setting.upsert({ where: { key: 'mv_database_row_count' }, create: { key: 'mv_database_row_count', value: rowCount }, update: { value: rowCount } }),
      prisma.setting.upsert({ where: { key: 'mv_database_imported_at' }, create: { key: 'mv_database_imported_at', value: new Date().toISOString() }, update: { value: new Date().toISOString() } }),
    ]);

    if (s3Key) {
      await upsertSetting(SETTING_KEYS.mvPdfKey, s3Key);
    }

    const version = await bumpSettingsVersion();
    let pdfUrl: string | null = null;
    if (s3Key) {
      try {
        pdfUrl = await createPresignedGetUrl(s3Key, 3600, `mv-database-${month}.pdf`);
      } catch {
        pdfUrl = null;
      }
      const queued = await queueFleetCommand('sync_mv_database', {
        month,
        pdfKey: s3Key,
        pdfUrl,
        recordCount: validRows.length,
        version,
      });
      console.log(`[MV Import] Queued sync_mv_database for ${queued} machine(s)`);
    }

    return NextResponse.json({ imported: validRows.length, month, format: isPDF ? 'pdf' : 'csv', locked: true, machinesQueued: s3Key ? true : false });
  } catch (e) {
    console.error('MV database import error:', e);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}

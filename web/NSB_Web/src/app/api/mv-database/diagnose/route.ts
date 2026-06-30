import { NextRequest, NextResponse } from 'next/server';
import { parseMvDatabasePDF } from '@/lib/mv-pdf-parser';
import { GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getMvS3Client } from '@/lib/mv-s3';
import { getAwsS3Bucket } from '@/lib/s3-config';

export const maxDuration = 60;

async function downloadFromS3(key: string): Promise<Buffer> {
  const bucket = getAwsS3Bucket();
  const res = await getMvS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const chunks: Uint8Array[] = [];
  for await (const chunk of res.Body as AsyncIterable<Uint8Array>) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function deleteFromS3(key: string) {
  const bucket = getAwsS3Bucket();
  try { await getMvS3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); } catch { /* best-effort */ }
}

// POST /api/mv-database/diagnose
// Accepts a PDF (direct multipart OR JSON { s3Key }) and returns diagnostic info WITHOUT saving.
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    let buffer: Buffer;
    let s3Key: string | null = null;

    if (isJson) {
      const body = await request.json();
      s3Key = (body.s3Key as string)?.trim() || null;
      if (!s3Key) return NextResponse.json({ error: 's3Key is required' }, { status: 400 });
      buffer = await downloadFromS3(s3Key);
    } else {
      return NextResponse.json(
        { error: 'Upload PDF to S3 first, then POST JSON { s3Key } to diagnose.' },
        { status: 400 },
      );
    }

    const { rows, diagnostics } = await parseMvDatabasePDF(buffer);
    if (s3Key) await deleteFromS3(s3Key);

    const validRows = rows.filter(r => r.make && r.model);

    return NextResponse.json({
      ok: true,
      summary: {
        totalLines: diagnostics.totalLinesFound,
        rowsFoundByParser: diagnostics.rowsParsed,
        rowsWithMakeAndModel: validRows.length,
        strategy: diagnostics.strategy || 'none — could not detect table structure',
      },
      detectedHeaderLine: diagnostics.detectedHeaderLine || null,
      rawTextSample: diagnostics.rawTextSample,
      rawTextFull: diagnostics.rawTextSample, // keep for backward compat
      firstFiveRows: diagnostics.firstFiveRows,
    });
  } catch (e) {
    console.error('MV diagnose error:', e);
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : 'Diagnosis failed',
    }, { status: 500 });
  }
}

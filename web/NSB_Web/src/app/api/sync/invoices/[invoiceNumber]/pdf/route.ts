import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { attachInvoicePdfFromBuffer } from '@/lib/invoice-pdf-s3';

type RouteParams = { params: Promise<{ invoiceNumber: string }> };

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MAX_PDF_BYTES = 15 * 1024 * 1024;

/** Sales desktop: upload the exact machine-generated PDF bytes (no presigned S3 hop). */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.AWS_S3_BUCKET) {
    return NextResponse.json({ error: 'S3 is not configured' }, { status: 500 });
  }

  const invoiceNumber = decodeURIComponent((await params).invoiceNumber).trim();
  if (!invoiceNumber) {
    return NextResponse.json({ error: 'Invalid invoice number' }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await request.arrayBuffer());
    if (buffer.length === 0) {
      return NextResponse.json({ error: 'Empty PDF body' }, { status: 400 });
    }
    if (buffer.length > MAX_PDF_BYTES) {
      return NextResponse.json({ error: 'PDF too large' }, { status: 413 });
    }

    const result = await attachInvoicePdfFromBuffer(
      user.id,
      invoiceNumber,
      buffer,
      'sales_system',
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    await prisma.clientActivity.create({
      data: {
        userId: user.id,
        action: 'invoice_pdf_uploaded',
        metadata: { invoiceNumber, source: 'sales_system', bytes: result.bytes },
      },
    });

    return NextResponse.json({
      ok: true,
      pdfUrl: result.pdfUrl,
      invoiceNumber,
      bytes: result.bytes,
      source: 'sales_system',
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('Invoice PDF direct upload error:', e);
    return NextResponse.json(
      { error: 'Failed to upload PDF', detail: message },
      { status: 500 },
    );
  }
}

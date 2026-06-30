import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-auth';
import {
  attachInvoicePdfFromBuffer,
  getStoredInvoicePdfPresignedUrlForUser,
} from '@/lib/invoice-pdf-s3';
import { prisma } from '@/lib/db';

type RouteParams = { params: Promise<{ id: string; invoiceNumber: string }> };

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MAX_PDF_BYTES = 15 * 1024 * 1024;

export async function GET(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdminApi(request);
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { id, invoiceNumber } = await params;
  const userId = Number(id);
  const number = decodeURIComponent(invoiceNumber).trim();

  if (!Number.isFinite(userId) || !number) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  try {
    const invoice = await prisma.invoice.findFirst({
      where: { userId, invoiceNumber: number },
      select: { id: true, invoiceNumber: true, pdfUrl: true },
    });
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const format = request.nextUrl.searchParams.get('format');
    const stored = await getStoredInvoicePdfPresignedUrlForUser(invoice.id, userId);

    if (!stored) {
      return NextResponse.json(
        {
          error: 'PDF not on cloud yet — queued for automatic generation when the sales machine is online.',
          code: 'pdf_pending',
          invoiceNumber: invoice.invoiceNumber,
        },
        { status: 404 },
      );
    }

    if (format === 'json') {
      return NextResponse.json({
        pdfUrl: stored.url,
        invoiceNumber: stored.invoiceNumber,
        source: 'cloud',
      });
    }

    return NextResponse.redirect(stored.url);
  } catch (e) {
    console.error('Admin invoice PDF error:', e);
    return NextResponse.json({ error: 'Failed to open PDF' }, { status: 500 });
  }
}

/** Control panel: upload PDF generated with the same desktop layout (future / shared package). */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdminApi(request);
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  if (!process.env.AWS_S3_BUCKET) {
    return NextResponse.json({ error: 'S3 is not configured' }, { status: 500 });
  }

  const { id, invoiceNumber } = await params;
  const userId = Number(id);
  const number = decodeURIComponent(invoiceNumber).trim();

  if (!Number.isFinite(userId) || !number) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await request.arrayBuffer());
    if (buffer.length === 0) {
      return NextResponse.json({ error: 'Empty PDF body' }, { status: 400 });
    }
    if (buffer.length > MAX_PDF_BYTES) {
      return NextResponse.json({ error: 'PDF too large' }, { status: 413 });
    }

    const result = await attachInvoicePdfFromBuffer(userId, number, buffer, 'control_panel');
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    await prisma.clientActivity.create({
      data: {
        userId,
        action: 'invoice_pdf_uploaded',
        metadata: {
          invoiceNumber: number,
          source: 'control_panel',
          by: admin.username,
          bytes: result.bytes,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      pdfUrl: result.pdfUrl,
      invoiceNumber: number,
      bytes: result.bytes,
      source: 'control_panel',
    });
  } catch (e) {
    console.error('Admin invoice PDF upload error:', e);
    return NextResponse.json({ error: 'Failed to upload PDF' }, { status: 500 });
  }
}

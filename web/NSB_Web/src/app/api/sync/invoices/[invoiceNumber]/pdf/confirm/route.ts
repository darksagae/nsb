import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { confirmInvoicePdfUpload } from '@/lib/invoice-pdf-s3';
import { prisma } from '@/lib/db';

type RouteParams = { params: Promise<{ invoiceNumber: string }> };

/** Sales desktop: confirm machine PDF was uploaded to S3. */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const invoiceNumber = decodeURIComponent((await params).invoiceNumber).trim();
  if (!invoiceNumber) {
    return NextResponse.json({ error: 'Invalid invoice number' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const key = String(body.key ?? '').trim();
    if (!key) {
      return NextResponse.json({ error: 'key is required' }, { status: 400 });
    }

    const result = await confirmInvoicePdfUpload(user.id, invoiceNumber, key);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await prisma.clientActivity.create({
      data: {
        userId: user.id,
        action: 'invoice_pdf_uploaded',
        metadata: { invoiceNumber, source: 'sales_system' },
      },
    });

    return NextResponse.json({ ok: true, pdfUrl: result.pdfUrl, invoiceNumber });
  } catch (e) {
    console.error('Invoice PDF confirm error:', e);
    return NextResponse.json({ error: 'Failed to confirm PDF upload' }, { status: 500 });
  }
}

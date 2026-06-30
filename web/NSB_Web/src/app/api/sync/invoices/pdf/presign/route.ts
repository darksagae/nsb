import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { createInvoicePdfUploadUrl } from '@/lib/invoice-pdf-s3';
import { prisma } from '@/lib/db';

/** Sales desktop: get a presigned S3 URL to upload the machine-generated invoice PDF. */
export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.AWS_S3_BUCKET) {
    return NextResponse.json({ error: 'S3 is not configured' }, { status: 500 });
  }

  const invoiceNumber = request.nextUrl.searchParams.get('invoiceNumber')?.trim() ?? '';
  if (!invoiceNumber) {
    return NextResponse.json({ error: 'invoiceNumber is required' }, { status: 400 });
  }

  const invoice = await prisma.invoice.findFirst({
    where: { userId: user.id, invoiceNumber },
    select: { id: true },
  });
  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found — sync invoice data first' }, { status: 404 });
  }

  try {
    const { uploadUrl, key, bucket } = await createInvoicePdfUploadUrl(invoiceNumber);
    return NextResponse.json({ uploadUrl, key, bucket, invoiceNumber });
  } catch (e) {
    console.error('Invoice PDF presign error:', e);
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }
}

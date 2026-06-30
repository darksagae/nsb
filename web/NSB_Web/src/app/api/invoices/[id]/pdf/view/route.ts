import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getStoredInvoicePdfPresignedUrlForUser } from '@/lib/invoice-pdf-s3';
import { requireSession } from '@/lib/require-session';

/** Opens the machine-uploaded invoice PDF via presigned S3 URL (never regenerated on web). */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, admin, response } = await requireSession(request);
  if (response) return response;

  try {
    const invoiceId = Number(params.id);
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        ...(admin ? {} : { userId: user!.id }),
      },
      select: { userId: true, salesSystemId: true },
    });
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const stored = await getStoredInvoicePdfPresignedUrlForUser(invoiceId, invoice.userId!);
    if (!stored) {
      return NextResponse.json(
        {
          error: 'PDF not yet uploaded from the sales machine',
          code: 'pdf_pending',
          machineOrigin: invoice.salesSystemId != null,
        },
        { status: 404 },
      );
    }

    return NextResponse.redirect(stored.url);
  } catch (e) {
    console.error('PDF view error:', e);
    return NextResponse.json({ error: 'Could not open PDF' }, { status: 500 });
  }
}

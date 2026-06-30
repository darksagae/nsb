import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  getStoredInvoicePdfPresignedUrlForUser,
} from '@/lib/invoice-pdf-s3';
import { queueGenerateInvoice } from '@/lib/invoice-generate-queue';
import { createPresignedGetUrl, PRESIGNED_PDF_EMAIL_SECONDS, resolvePdfS3Key } from '@/lib/s3-config';
import { requireSession } from '@/lib/require-session';
import { invoicePdfViewPath } from '@/lib/invoice-pdf-url';

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
      select: { id: true, invoiceNumber: true, pdfUrl: true, pdfSource: true, salesSystemId: true, userId: true },
    });
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    const stored = await getStoredInvoicePdfPresignedUrlForUser(invoice.id, invoice.userId!);
    if (stored) {
      return NextResponse.json({
        pdfUrl: invoicePdfViewPath(invoice.id),
        invoiceNumber: invoice.invoiceNumber,
        source: invoice.pdfSource ?? 'cloud',
      });
    }

    if (invoice.invoiceNumber) {
      await queueGenerateInvoice(invoice.userId!, invoice.invoiceNumber, { finalize: true }).catch((err) => {
        console.error('queueGenerateInvoice on pdf GET:', err);
      });
    }

    return NextResponse.json(
      {
        error:
          'PDF not yet available. The sales machine or control panel will generate it automatically when online.',
        code: 'pdf_pending',
      },
      { status: 404 },
    );
  } catch (e) {
    console.error('PDF route error:', e);
    return NextResponse.json({ error: 'PDF unavailable' }, { status: 500 });
  }
}

/** Email the machine-uploaded PDF to the customer (never regenerates on web). */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, admin, response } = await requireSession(request);
  if (response) return response;

  try {
    const invoiceId = Number(params.id);
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        ...(admin ? {} : { userId: user!.id }),
      },
    });
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    if (!invoice.pdfUrl) {
      return NextResponse.json(
        {
          error:
            'PDF not yet available. The sales machine will generate it automatically when online.',
          code: 'pdf_pending',
        },
        { status: 404 },
      );
    }

    const key = resolvePdfS3Key(invoice.pdfUrl);
    if (!key) {
      return NextResponse.json(
        { error: 'PDF file reference is invalid.', code: 'pdf_pending' },
        { status: 404 },
      );
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const resendFromEmail = process.env.RESEND_FROM_EMAIL || 'sales@nsb.com';
    const consigneeEmail = invoice.consigneeEmail?.trim();
    if (!resendApiKey || !consigneeEmail) {
      return NextResponse.json({ error: 'Email not configured or customer email missing' }, { status: 400 });
    }

    const settingRows = await prisma.setting.findMany();
    const settings: Record<string, string> = {};
    for (const row of settingRows) settings[row.key] = row.value;

    const emailPdfUrl = await createPresignedGetUrl(
      key,
      PRESIGNED_PDF_EMAIL_SECONDS,
      `${invoice.invoiceNumber}.pdf`,
    );

    const vehicleName = [invoice.vehicleYear, invoice.vehicleMake, invoice.vehicleModel].filter(Boolean).join(' ');
    const totalUgxStr = invoice.grandTotalUgx
      ? `${Number(invoice.grandTotalUgx).toLocaleString('en-US')} UGX`
      : null;
    const amountDue = totalUgxStr || 'As specified on invoice';

    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 25px;">
        <h1 style="color: #0f172a;">NSB MOTORS</h1>
        <p>Dear ${invoice.consigneeName},</p>
        <p>Your invoice <strong>${invoice.invoiceNumber}</strong>${vehicleName ? ` for ${vehicleName}` : ''} is ready.</p>
        <p>Amount due: <strong>${amountDue}</strong></p>
        <p><a href="${emailPdfUrl}">View your invoice PDF</a></p>
        <p>NSB Motors Ug</p>
      </div>`;

    const adminEmail = settings.contact_email || 'info@nsbmotors.com';
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: `NSB Motors Ug <${resendFromEmail}>`,
        to: [consigneeEmail],
        cc: [adminEmail],
        subject: `Official Invoice ${invoice.invoiceNumber} - NSB Motors Ug`,
        html: emailHtml,
      }),
    });

    if (!emailRes.ok) {
      const err = await emailRes.text();
      return NextResponse.json({ error: err || 'Failed to send email' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, invoiceNumber: invoice.invoiceNumber, source: 'machine' });
  } catch (e) {
    console.error('PDF email error:', e);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}

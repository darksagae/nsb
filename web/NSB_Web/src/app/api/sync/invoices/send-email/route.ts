import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { sendResendEmail } from '@/lib/email';
import { prisma } from '@/lib/db';

/**
 * Sends an invoice to a customer by email, straight through Resend.
 *
 * The desktop app used to insert into a Postgres `email_queue` table for the
 * mobile app to drain, which needs POSTGRES_* env vars on every machine. This
 * endpoint replaces that: the signed-in sales user posts the invoice details
 * plus the already-generated PDF (base64), and the server relays it to Resend.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function invoiceEmailHtml(opts: {
  recipientName: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: string;
  companyName: string;
}): string {
  const { recipientName, invoiceNumber, invoiceDate, totalAmount, companyName } = opts;
  return `<html>
  <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #2c3e50;">Invoice ${escapeHtml(invoiceNumber)}</h2>
      <p>Dear ${escapeHtml(recipientName)},</p>
      <p>Thank you for your business! Please find attached your invoice for the services provided.</p>
      <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <h3 style="margin-top: 0;">Invoice Details</h3>
        <p><strong>Invoice Number:</strong> ${escapeHtml(invoiceNumber)}</p>
        <p><strong>Date:</strong> ${escapeHtml(invoiceDate)}</p>
        <p><strong>Total Amount:</strong> ${escapeHtml(totalAmount)}</p>
      </div>
      <p>If you have any questions about this invoice, please don't hesitate to contact us.</p>
      <p>Thank you for your business!</p>
      <hr style="margin: 30px 0;">
      <p style="font-size: 12px; color: #666;">
        ${escapeHtml(companyName)}<br>
        This is an automated message. Please do not reply to this email.
      </p>
    </div>
  </body>
  </html>`;
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const toEmail = String(body.toEmail ?? '').trim();
    const toName = String(body.toName ?? 'Customer').trim() || 'Customer';
    const invoiceNumber = String(body.invoiceNumber ?? '').trim();
    const invoiceDate = String(body.invoiceDate ?? '').trim();
    const companyName = String(body.companyName ?? 'NSB Motors Ug').trim() || 'NSB Motors Ug';
    const totalAmount = String(body.totalAmount ?? '').trim();
    // Base64 PDF, with or without a leading data: URI prefix.
    const pdfRaw = typeof body.pdfBase64 === 'string' ? body.pdfBase64 : '';
    const pdfBase64 = pdfRaw.includes('base64,') ? pdfRaw.split('base64,').pop()! : pdfRaw;
    const pdfFilename =
      String(body.pdfFilename ?? '').trim() ||
      `${invoiceNumber || 'invoice'}.pdf`;

    if (!toEmail || !toEmail.includes('@')) {
      return NextResponse.json({ error: 'A valid customer email is required' }, { status: 400 });
    }
    if (!invoiceNumber) {
      return NextResponse.json({ error: 'invoiceNumber is required' }, { status: 400 });
    }

    const subject =
      typeof body.subject === 'string' && body.subject.trim().length > 0
        ? body.subject.trim()
        : `Invoice ${invoiceNumber} - ${companyName}`;
    const html =
      typeof body.html === 'string' && body.html.trim().length > 0
        ? body.html
        : invoiceEmailHtml({
            recipientName: toName,
            invoiceNumber,
            invoiceDate,
            totalAmount: totalAmount || 'See attached invoice',
            companyName,
          });

    const result = await sendResendEmail({
      to: toEmail,
      subject,
      html,
      attachments: pdfBase64 ? [{ filename: pdfFilename, content: pdfBase64 }] : undefined,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    await prisma.clientActivity.create({
      data: {
        userId: user.id,
        action: 'invoice_email_sent',
        metadata: { invoiceNumber, toEmail, source: body.source ?? 'sales_system' },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Invoice email send error:', e);
    return NextResponse.json({ error: 'Failed to send invoice email' }, { status: 500 });
  }
}

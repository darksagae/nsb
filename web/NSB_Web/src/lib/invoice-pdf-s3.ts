import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  createPresignedGetUrl,
  getAwsS3Bucket,
  getS3Client,
  invoicePdfS3Key,
  PRESIGNED_PDF_VIEW_SECONDS,
  resolvePdfS3Key,
} from '@/lib/s3-config';
import { prisma } from '@/lib/db';
import type { PdfSource } from '@/lib/invoice-pdf-queue';

export function invoicePdfIsReady(invoice: { pdfUrl?: string | null }): boolean {
  return Boolean(invoice.pdfUrl?.trim());
}

export async function createInvoicePdfUploadUrl(
  invoiceNumber: string,
): Promise<{ uploadUrl: string; key: string; bucket: string }> {
  const bucket = getAwsS3Bucket();
  const key = invoicePdfS3Key(invoiceNumber);
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: 'application/pdf',
    ContentDisposition: `inline; filename="${invoiceNumber.replace(/"/g, '')}.pdf"`,
  });

  const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 300 });

  return { uploadUrl, key, bucket };
}

export async function confirmInvoicePdfUpload(
  userId: number,
  invoiceNumber: string,
  key: string,
  pdfSource: PdfSource = 'sales_system',
): Promise<{ ok: true; pdfUrl: string } | { ok: false; error: string }> {
  const expectedKey = invoicePdfS3Key(invoiceNumber);
  if (key !== expectedKey) {
    return { ok: false, error: 'Invalid PDF key for this invoice' };
  }

  const invoice = await prisma.invoice.findFirst({
    where: { userId, invoiceNumber },
    select: { id: true, pdfUrl: true },
  });
  if (!invoice) {
    return { ok: false, error: 'Invoice not found' };
  }
  if (invoicePdfIsReady(invoice)) {
    return { ok: true, pdfUrl: invoice.pdfUrl! };
  }

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      pdfUrl: key,
      pdfGeneratedAt: new Date(),
      pdfSource,
    },
  });

  return { ok: true, pdfUrl: key };
}

export async function attachInvoicePdfFromBuffer(
  userId: number,
  invoiceNumber: string,
  buffer: Buffer,
  pdfSource: PdfSource,
): Promise<{ ok: true; pdfUrl: string; bytes: number } | { ok: false; error: string }> {
  const invoice = await prisma.invoice.findFirst({
    where: { userId, invoiceNumber },
    select: { id: true, pdfUrl: true },
  });
  if (!invoice) {
    return { ok: false, error: 'Invoice not found' };
  }
  if (invoicePdfIsReady(invoice)) {
    return { ok: true, pdfUrl: invoice.pdfUrl!, bytes: buffer.length };
  }

  const { uploadPdfToS3 } = await import('@/lib/s3-pdf-upload');
  const key = await uploadPdfToS3(buffer, invoiceNumber);

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      pdfUrl: key,
      pdfGeneratedAt: new Date(),
      pdfSource,
    },
  });

  return { ok: true, pdfUrl: key, bytes: buffer.length };
}

export async function getStoredInvoicePdfPresignedUrl(
  invoiceId: number,
): Promise<{ url: string; invoiceNumber: string } | null> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { pdfUrl: true, invoiceNumber: true },
  });
  if (!invoicePdfIsReady(invoice ?? {})) return null;

  const key = resolvePdfS3Key(invoice!.pdfUrl!);
  if (!key) return null;

  const url = await createPresignedGetUrl(
    key,
    PRESIGNED_PDF_VIEW_SECONDS,
    `${invoice!.invoiceNumber}.pdf`,
  );
  return { url, invoiceNumber: invoice!.invoiceNumber };
}

export async function getStoredInvoicePdfPresignedUrlForUser(
  invoiceId: number,
  userId: number,
): Promise<{ url: string; invoiceNumber: string } | null> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, userId },
    select: { pdfUrl: true, invoiceNumber: true },
  });
  if (!invoicePdfIsReady(invoice ?? {})) return null;

  const key = resolvePdfS3Key(invoice!.pdfUrl!);
  if (!key) return null;

  const url = await createPresignedGetUrl(
    key,
    PRESIGNED_PDF_VIEW_SECONDS,
    `${invoice!.invoiceNumber}.pdf`,
  );
  return { url, invoiceNumber: invoice!.invoiceNumber };
}

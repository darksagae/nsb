import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** NSB Motors Ug S3 bucket — https://eu-north-1.console.aws.amazon.com/s3/buckets/nsb-motors-assets */
export const NSB_S3_BUCKET = 'nsb-motors-assets';
export const NSB_S3_REGION = 'eu-north-1';

export function getAwsS3Bucket(): string {
  return process.env.AWS_S3_BUCKET?.trim() || NSB_S3_BUCKET;
}

export function getAwsS3Region(): string {
  return process.env.AWS_REGION?.trim() || NSB_S3_REGION;
}

export function buildS3ObjectUrl(key: string): string {
  const bucket = getAwsS3Bucket();
  const region = getAwsS3Region();
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

export function invoicePdfS3Key(invoiceNumber: string): string {
  return `invoices/${invoiceNumber}.pdf`;
}

/** Stored pdfUrl may be an S3 key or a legacy direct https URL. */
export function resolvePdfS3Key(stored: string | null | undefined): string | null {
  if (!stored?.trim()) return null;
  const value = stored.trim();
  if (value.startsWith('invoices/')) return value;
  if (value.startsWith('http://') || value.startsWith('https://')) {
    try {
      const key = new URL(value).pathname.replace(/^\//, '');
      return key || null;
    } catch {
      return null;
    }
  }
  return value.includes('/') ? value : null;
}

/** Private bucket objects need a presigned URL for browser access. */
export async function createPresignedGetUrl(
  key: string,
  expiresIn = 3600,
  filename?: string,
): Promise<string> {
  const bucket = getAwsS3Bucket();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentType: 'application/pdf',
    ResponseContentDisposition: filename
      ? `inline; filename="${filename.replace(/"/g, '')}"`
      : 'inline',
  });
  return getSignedUrl(getS3Client(), command, { expiresIn });
}

export const PRESIGNED_PDF_VIEW_SECONDS = 3600;
/** IAM presigned URLs max out at 7 days. */
export const PRESIGNED_PDF_EMAIL_SECONDS = 7 * 24 * 60 * 60;

export function getS3Client(): S3Client {
  return new S3Client({
    region: getAwsS3Region(),
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

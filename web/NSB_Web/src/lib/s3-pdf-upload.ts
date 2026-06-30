import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getAwsS3Bucket, getS3Client, invoicePdfS3Key } from '@/lib/s3-config';

/** Uploads invoice PDF to private S3; returns the object key (not a public URL). */
export async function uploadPdfToS3(buffer: Buffer, invoiceNumber: string): Promise<string> {
  const bucket = getAwsS3Bucket();
  const key = invoicePdfS3Key(invoiceNumber);
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: 'application/pdf',
      ContentDisposition: `inline; filename="${invoiceNumber}.pdf"`,
    }),
  );
  return key;
}

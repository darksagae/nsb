import { NextRequest, NextResponse } from 'next/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getAwsS3Bucket, getS3Client } from '@/lib/s3-config';

export async function GET(request: NextRequest) {
  const bucket = getAwsS3Bucket();
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('filename') || 'document.pdf';
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `invoice-pdfs/${Date.now()}-${sanitized}`;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: 'application/pdf',
  });

  const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: 300 });

  return NextResponse.json({ uploadUrl, key, bucket });
}

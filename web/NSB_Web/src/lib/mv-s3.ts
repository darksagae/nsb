import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getAwsS3Bucket, getS3Client } from '@/lib/s3-config';

export function getMvS3Client() {
  return getS3Client();
}

export function mvDatabaseS3Key(filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `mv-database/${Date.now()}-${safe}`;
}

export async function createMvDatabaseUploadUrl(filename: string): Promise<{ uploadUrl: string; key: string; bucket: string }> {
  const bucket = getAwsS3Bucket();
  const key = mvDatabaseS3Key(filename);
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: 'application/pdf',
  });

  const uploadUrl = await getSignedUrl(getS3Client(), command, {
    expiresIn: 300,
    signableHeaders: new Set(['content-type']),
    unhoistableHeaders: new Set(['x-amz-checksum-crc32', 'x-amz-sdk-checksum-algorithm']),
  });

  return { uploadUrl, key, bucket };
}

import { NextRequest, NextResponse } from 'next/server';
import { createMvDatabaseUploadUrl } from '@/lib/mv-s3';

export async function GET(request: NextRequest) {
  if (!process.env.AWS_S3_BUCKET) {
    return NextResponse.json({ error: 'S3 is not configured (AWS_S3_BUCKET missing)' }, { status: 500 });
  }
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return NextResponse.json({ error: 'S3 credentials are not configured' }, { status: 500 });
  }

  const filename = request.nextUrl.searchParams.get('filename') || 'mv-database.pdf';

  try {
    const { uploadUrl, key, bucket } = await createMvDatabaseUploadUrl(filename);
    return NextResponse.json({ uploadUrl, key, bucket });
  } catch (e) {
    console.error('[MV presign] Error:', e);
    const msg = e instanceof Error ? e.message : 'Failed to generate upload URL';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

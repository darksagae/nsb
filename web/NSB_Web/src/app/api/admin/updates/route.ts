import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-auth';
import { getSystemSettingsPayload } from '@/lib/system-settings';

export async function GET(request: NextRequest) {
  const admin = await requireAdminApi(request);
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const data = await getSystemSettingsPayload();
    return NextResponse.json(data);
  } catch (e) {
    console.error('Admin updates GET error:', e);
    return NextResponse.json({ error: 'Failed to load updates' }, { status: 500 });
  }
}

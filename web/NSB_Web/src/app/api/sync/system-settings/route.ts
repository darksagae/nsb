import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getSystemSettingsPayload } from '@/lib/system-settings';

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const data = await getSystemSettingsPayload();
    return NextResponse.json(data);
  } catch (e) {
    console.error('System settings sync error:', e);
    return NextResponse.json({ error: 'Failed to load system settings' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json() as { action: 'lock' | 'unlock' };
    if (action !== 'lock' && action !== 'unlock') {
      return NextResponse.json({ error: 'action must be lock or unlock' }, { status: 400 });
    }
    await prisma.setting.upsert({
      where: { key: 'mv_database_locked' },
      create: { key: 'mv_database_locked', value: action === 'lock' ? 'true' : 'false' },
      update: { value: action === 'lock' ? 'true' : 'false' },
    });
    return NextResponse.json({ locked: action === 'lock' });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to update lock state' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200);

    const activities = await prisma.clientActivity.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json(activities);
  } catch (e) {
    console.error('Activities fetch error:', e);
    return NextResponse.json({ error: 'Failed to fetch activities' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const action = String(body.action ?? '').trim();
    if (!action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 });
    }

    const activity = await prisma.clientActivity.create({
      data: {
        userId: user.id,
        action,
        metadata: body.metadata ?? {},
      },
    });

    return NextResponse.json(activity, { status: 201 });
  } catch (e) {
    console.error('Activity log error:', e);
    return NextResponse.json({ error: 'Failed to log activity' }, { status: 500 });
  }
}

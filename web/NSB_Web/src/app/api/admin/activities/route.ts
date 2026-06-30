import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const admin = await requireAdminApi(request);
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get('limit') ?? 50), 200);

    const activities = await prisma.clientActivity.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: { select: { id: true, username: true, displayName: true } },
      },
    });

    return NextResponse.json(
      activities.map((a) => ({
        id: a.id,
        action: a.action,
        metadata: a.metadata,
        createdAt: a.createdAt.toISOString(),
        user: {
          id: a.user.id,
          username: a.user.username,
          displayName: a.user.displayName,
        },
      })),
    );
  } catch (e) {
    console.error('Admin activities error:', e);
    return NextResponse.json({ error: 'Failed to fetch activities' }, { status: 500 });
  }
}

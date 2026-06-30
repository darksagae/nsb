import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    phone: user.phone,
    profileImageUrl: user.profileImageUrl,
    role: user.role,
  });
}

export async function PUT(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const updated = await prisma.salesUser.update({
      where: { id: user.id },
      data: {
        displayName: body.displayName != null ? String(body.displayName).trim() || null : undefined,
        email: body.email != null ? String(body.email).trim() || null : undefined,
        phone: body.phone != null ? String(body.phone).trim() || null : undefined,
        profileImageUrl:
          body.profileImageUrl != null ? String(body.profileImageUrl).trim() || null : undefined,
      },
    });

    await prisma.clientActivity.create({
      data: {
        userId: user.id,
        action: 'update_profile',
        metadata: { source: body.source ?? 'unknown' },
      },
    });

    return NextResponse.json({
      id: updated.id,
      username: updated.username,
      displayName: updated.displayName,
      email: updated.email,
      phone: updated.phone,
      profileImageUrl: updated.profileImageUrl,
      role: updated.role,
    });
  } catch (e) {
    console.error('Profile sync error:', e);
    return NextResponse.json({ error: 'Profile update failed' }, { status: 500 });
  }
}

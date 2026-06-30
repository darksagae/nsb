import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi, isUserOnline } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';

const STALE_MS = 24 * 60 * 60 * 1000;

function hoursAgo(date: Date | null | undefined): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / (60 * 60 * 1000));
}

export async function GET(request: NextRequest) {
  const admin = await requireAdminApi(request);
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const [users, invoiceCount, invoicesToday, mvSettings, recentActivities, loginActivities, passwordResetRequests] =
      await Promise.all([
        prisma.salesUser.findMany({
          orderBy: { username: 'asc' },
          include: {
            _count: { select: { invoices: true } },
            activities: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        }),
        prisma.invoice.count(),
        prisma.invoice.count({ where: { createdAt: { gte: startOfDay } } }),
        prisma.setting.findMany({
          where: { key: { in: ['mv_database_month', 'mv_database_locked', 'mv_database_imported_at'] } },
        }),
        prisma.clientActivity.findMany({
          orderBy: { createdAt: 'desc' },
          take: 8,
          include: { user: { select: { id: true, username: true, displayName: true } } },
        }),
        prisma.clientActivity.findMany({
          where: { action: 'user_login' },
          select: { userId: true },
        }),
        prisma.clientActivity.findMany({
          where: {
            action: 'password_reset_request',
            createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { user: { select: { id: true, username: true, displayName: true, isActive: true } } },
        }),
      ]);

    const settingMap: Record<string, string> = {};
    for (const s of mvSettings) settingMap[s.key] = s.value;

    const loggedInUserIds = new Set(loginActivities.map((a) => a.userId));

    let liveDesktop = 0;
    let liveWeb = 0;
    let staleCount = 0;
    let neverLoggedIn = 0;

    const sessions = users.map((user) => {
      const desktopOnline = isUserOnline(user.desktopLastSeenAt);
      const webOnline = isUserOnline(user.webLastSeenAt);
      const anyOnline = desktopOnline || webOnline;

      if (desktopOnline) liveDesktop += 1;
      if (webOnline) liveWeb += 1;

      const hasLoggedIn = loggedInUserIds.has(user.id);
      if (!hasLoggedIn) {
        neverLoggedIn += 1;
      } else if (!anyOnline) {
        const last = user.lastSeenAt;
        if (last && Date.now() - last.getTime() > STALE_MS) staleCount += 1;
      }

      let channel = '—';
      let machine = '—';
      if (desktopOnline && webOnline) {
        channel = 'Both';
        machine = user.lastMachineName ?? 'Desktop';
      } else if (desktopOnline) {
        channel = 'Desktop';
        machine = user.lastMachineName ?? 'Desktop';
      } else if (webOnline) {
        channel = 'Web';
        machine = 'Web';
      } else if (user.lastMachineName) {
        channel = 'Desktop';
        machine = user.lastMachineName;
      } else if (user.webLastSeenAt) {
        channel = 'Web';
        machine = 'Web';
      }

      const lastActivity = user.activities[0];

      return {
        userId: user.id,
        name: user.displayName || user.username,
        username: user.username,
        role: user.role,
        isActive: user.isActive,
        online: anyOnline,
        desktopOnline,
        webOnline,
        channel,
        machine,
        net: anyOnline ? 'Online' : 'Offline',
        lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
        desktopLastSeenAt: user.desktopLastSeenAt?.toISOString() ?? null,
        webLastSeenAt: user.webLastSeenAt?.toISOString() ?? null,
        ip: user.lastIp,
        invoiceCount: user._count.invoices,
        lastAction: lastActivity
          ? {
              action: lastActivity.action,
              at: lastActivity.createdAt.toISOString(),
            }
          : null,
      };
    });

    const incidents: Array<{
      id: string;
      severity: 'warning' | 'critical';
      title: string;
      detail: string;
      userId: number;
      username: string;
      type?: string;
    }> = [];

    for (const req of passwordResetRequests) {
      if (!req.user?.isActive) continue;
      const resolved = await prisma.clientActivity.findFirst({
        where: {
          userId: req.userId,
          action: { in: ['admin_password_reset', 'user_login'] },
          createdAt: { gt: req.createdAt },
        },
      });
      if (resolved) continue;

      const meta = (req.metadata ?? {}) as Record<string, unknown>;
      const via = meta.source === 'sales_system' ? 'desktop login' : 'web login';
      const machine = meta.machineName ? ` · ${meta.machineName}` : '';
      incidents.push({
        id: `pwd-reset-${req.id}`,
        severity: 'critical',
        type: 'password_reset',
        title: 'Password reset requested',
        detail: `${req.user.displayName || req.user.username} via ${via}${machine}`,
        userId: req.userId,
        username: req.user.username,
      });
    }

    for (const user of users) {
      const name = user.displayName || user.username;
      const desktopOnline = isUserOnline(user.desktopLastSeenAt);
      const webOnline = isUserOnline(user.webLastSeenAt);
      const anyOnline = desktopOnline || webOnline;

      if (!user.isActive) continue;

      if (!loggedInUserIds.has(user.id)) {
        incidents.push({
          id: `never-login-${user.id}`,
          severity: 'warning',
          title: 'Never logged in',
          detail: `${name} is registered but has never signed in`,
          userId: user.id,
          username: user.username,
        });
        continue;
      }

      if (!anyOnline && user.lastSeenAt) {
        const hrs = hoursAgo(user.lastSeenAt);
        if (hrs !== null && hrs >= 24) {
          incidents.push({
            id: `stale-${user.id}`,
            severity: 'warning',
            title: 'Offline too long',
            detail: `${name} offline for ${hrs}h — last seen ${user.lastMachineName ?? 'unknown machine'}`,
            userId: user.id,
            username: user.username,
          });
        }
      }
    }

    return NextResponse.json({
      generatedAt: now.toISOString(),
      cloud: {
        status: 'ok',
        url: process.env.NEXT_PUBLIC_APP_URL ?? 'https://access.nsbmotors.com',
        databaseHost: (() => {
          try {
            const u = process.env.POSTGRES_PRISMA_URL ?? '';
            const m = u.match(/@([^/]+)/);
            return m?.[1]?.split(':')[0] ?? null;
          } catch {
            return null;
          }
        })(),
        invoiceCount,
        invoicesToday,
        mvDatabaseMonth: settingMap.mv_database_month ?? null,
        mvDatabaseLocked: settingMap.mv_database_locked === 'true',
        mvDatabaseImportedAt: settingMap.mv_database_imported_at ?? null,
      },
      fleet: {
        registered: users.length,
        liveDesktop,
        liveWeb,
        liveTotal: liveDesktop + liveWeb,
        stale: staleCount,
        neverLoggedIn,
        disabled: users.filter((u) => !u.isActive).length,
      },
      sync: {
        invoicesToday,
        totalInvoices: invoiceCount,
        lastActivityAt: recentActivities[0]?.createdAt.toISOString() ?? null,
      },
      sessions,
      incidents: incidents.slice(0, 20),
      recentActivity: recentActivities.map((a) => ({
        id: a.id,
        action: a.action,
        createdAt: a.createdAt.toISOString(),
        user: {
          id: a.user.id,
          username: a.user.username,
          displayName: a.user.displayName,
        },
        metadata: a.metadata,
      })),
    });
  } catch (e) {
    console.error('Admin overview error:', e);
    return NextResponse.json({ error: 'Failed to load overview' }, { status: 500 });
  }
}

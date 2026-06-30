import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';
    const make = searchParams.get('make') || '';
    const model = searchParams.get('model') || '';
    const month = searchParams.get('month') || '';
    const cc = searchParams.get('cc') || '';

    const where: Record<string, unknown> = {};

    if (q) {
      // Extract all years from the query (e.g. "Toyota 2015", "2020", "Land Cruiser 2018-2020")
      const years: number[] = [];
      { const re = /\b(19[89]\d|20[0-3]\d)\b/g; let m; while ((m = re.exec(q)) !== null) years.push(parseInt(m[1])); }
      const textPart = q.replace(/\b(19[89]\d|20[0-3]\d)\b/g, '').trim();

      const conditions: Record<string, unknown>[] = [];

      // Split text into words and require each word to match make, model, or serialNumber.
      if (textPart) {
        const words = textPart.split(/\s+/).filter(w => w.length >= 1);
        for (const word of words) {
          const isNumeric = /^\d+$/.test(word);
          if (isNumeric) {
            conditions.push({
              OR: [
                { make: { contains: word, mode: 'insensitive' } },
                { model: { contains: word, mode: 'insensitive' } },
                { serialNumber: { contains: word, mode: 'insensitive' } },
              ],
            });
          } else {
            conditions.push({
              OR: [
                { make: { contains: word, mode: 'insensitive' } },
                { model: { contains: word, mode: 'insensitive' } },
              ],
            });
          }
        }
      }

      // Year part: vehicle year range must overlap the searched year(s)
      if (years.length > 0) {
        const minYear = Math.min(...years);
        const maxYear = Math.max(...years);
        conditions.push({
          AND: [
            { OR: [{ yearFrom: null }, { yearFrom: { lte: maxYear } }] },
            { OR: [{ yearTo: null }, { yearTo: { gte: minYear } }] },
          ],
        });
      }

      if (conditions.length > 0) {
        Object.assign(where, conditions.length === 1 ? conditions[0] : { AND: conditions });
      }
    } else {
      if (make) where.make = { contains: make, mode: 'insensitive' };
      if (model) where.model = { contains: model, mode: 'insensitive' };
    }

    let monthFilter = month;
    if (!monthFilter) {
      const activeMonthSetting = await prisma.setting.findUnique({
        where: { key: 'mv_database_month' }
      });
      if (activeMonthSetting?.value) {
        monthFilter = activeMonthSetting.value;
      } else {
        const latestRate = await (prisma.vehicleTaxRate as any).findFirst({
          orderBy: { databaseMonth: 'desc' },
          select: { databaseMonth: true },
        });
        if (latestRate?.databaseMonth) {
          monthFilter = latestRate.databaseMonth;
        }
      }
    }
    if (monthFilter) {
      where.databaseMonth = monthFilter;
    }

    // CC filter: match within ±200cc tolerance so slight differences in the DB don't exclude results
    if (cc) {
      const ccNum = parseInt(cc);
      if (!isNaN(ccNum)) {
        where.engineSizeCC = { gte: ccNum - 200, lte: ccNum + 200 };
      }
    }

    const [rows, total] = await Promise.all([
      (prisma.vehicleTaxRate as any).findMany({ where, orderBy: [{ yearTo: 'desc' }, { make: 'asc' }, { model: 'asc' }] }),
      (prisma.vehicleTaxRate as any).count({ where }),
    ]);

    return NextResponse.json({ rows, total });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to fetch tax rates' }, { status: 500 });
  }
}

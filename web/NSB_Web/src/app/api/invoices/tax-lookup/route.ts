import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const make = searchParams.get('make') || '';
    const model = searchParams.get('model') || '';
    const yearParam = searchParams.get('year');
    const year = yearParam ? Number(yearParam) : null;
    const ccParam = searchParams.get('cc');
    const cc = ccParam ? Number(ccParam) : null;
    const fuel = searchParams.get('fuel') || '';

    if (!make || !model) {
      return NextResponse.json({ error: 'make and model required' }, { status: 400 });
    }

    const where: Record<string, unknown> = {
      make: { contains: make, mode: 'insensitive' },
      model: { contains: model, mode: 'insensitive' },
      isActive: true,
    };

    if (year) {
      where.yearFrom = { lte: year };
      where.yearTo = { gte: year };
    }

    if (cc && !isNaN(cc)) {
      // Allow slight engine cc variance (e.g. ±150cc) to catch typical URA PDF roundings
      where.engineSizeCC = { gte: cc - 150, lte: cc + 150 };
    }

    if (fuel) {
      where.fuelType = { contains: fuel, mode: 'insensitive' };
    }

    // Default to active month if not specified
    const activeMonthSetting = await prisma.setting.findUnique({
      where: { key: 'mv_database_month' }
    });
    if (activeMonthSetting?.value) {
      where.databaseMonth = activeMonthSetting.value;
    }

    let rate = await (prisma.vehicleTaxRate as any).findFirst({
      where,
      orderBy: [
        { engineSizeCC: 'asc' }, // Prefer closer engine match if multiple exist
        { id: 'desc' }
      ],
    });

    // If no exact CC match, fall back to matching without CC constraints
    if (!rate && cc) {
      delete where.engineSizeCC;
      rate = await (prisma.vehicleTaxRate as any).findFirst({
        where,
        orderBy: { id: 'desc' },
      });
    }

    return NextResponse.json(rate ?? null);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
}

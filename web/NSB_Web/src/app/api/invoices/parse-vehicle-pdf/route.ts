import { NextRequest, NextResponse } from 'next/server';
// PDFParse imported dynamically inside POST to avoid serverless module-load failures
import { GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getAwsS3Bucket, getS3Client } from '@/lib/s3-config';

export const maxDuration = 60;

export interface VehiclePdfExtract {
  make: string | null;
  model: string | null;
  year: string | null;
  chassisNo: string | null;
  engineCC: string | null;
  fuelType: string | null;
  transmission: string | null;
  color: string | null;
  mileage: string | null;
  steering: string | null;
  doors: string | null;
  rawTextSample: string;
}

function first(matches: RegExpMatchArray | null, group = 1): string | null {
  return matches ? (matches[group]?.trim() || null) : null;
}

function findFirst(text: string, ...patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return (m[1] ?? m[0])?.trim() || null;
  }
  return null;
}

function extractVehicleData(text: string): VehiclePdfExtract {
  // Normalise: collapse whitespace, keep newlines for context
  const t = text.replace(/\r\n/g, '\n').replace(/[ \t]{2,}/g, ' ');
  const upper = t.toUpperCase();

  // ── Chassis / VIN ──────────────────────────────────────────────────────────
  // Japanese chassis: e.g. GDJ150-1234567, JZX100-0012345, ZZT231-5001234
  const chassisPatterns = [
    /chassis(?:\s*no\.?|\s*number|\s*#)?[:\s]+([A-Z]{2,6}\d{0,4}[-–]\s*[A-Z0-9]{5,12})/i,
    /vin(?:\s*no\.?|\s*number|\s*#)?[:\s]+([A-HJ-NPR-Z0-9]{17})/i,
    /\b([A-Z]{2,6}\d{0,4}[-–][A-Z0-9]{5,12})\b/,          // bare Japanese chassis
    /\b([A-HJ-NPR-Z0-9]{17})\b/,                           // 17-char VIN
  ];
  const chassisNo = findFirst(t, ...chassisPatterns);

  // ── Year ────────────────────────────────────────────────────────────────────
  const yearPatterns = [
    /(?:model\s*year|year\s*of\s*manufacture[d]?|manufacture[d]?\s*year|production\s*year|year)[:\s]+(\d{4})/i,
    /\b(19[89]\d|20[0-3]\d)\b/,
  ];
  const year = findFirst(t, ...yearPatterns);

  // ── Make ─────────────────────────────────────────────────────────────────────
  const makePatterns = [
    /(?:make|manufacturer|brand|vehicle\s*make)[:\s]+([A-Za-z][\w\- ]{1,20}?)(?:\n|,|\/|\s{2})/i,
  ];
  const make = findFirst(t, ...makePatterns);

  // ── Model ───────────────────────────────────────────────────────────────────
  const modelPatterns = [
    /(?:^|\n)model[:\s]+([A-Za-z0-9][\w\- /()]{1,30}?)(?:\n|,|\s{2})/im,
    /(?:vehicle\s*model|car\s*model)[:\s]+([A-Za-z0-9][\w\- /()]{1,30}?)(?:\n|,|\s{2})/i,
  ];
  const model = findFirst(t, ...modelPatterns);

  // ── Engine CC ────────────────────────────────────────────────────────────────
  const enginePatterns = [
    /(?:engine\s*(?:size|capacity|cc|displacement)|displacement|cc)[:\s]+(\d{3,4})\s*cc/i,
    /(\d{3,4})\s*cc/i,
    /(\d\.\d)\s*[lL](?:\s|$)/,
  ];
  let engineCC = findFirst(t, ...enginePatterns);
  // Convert litre to cc if needed (e.g. "2.0L" → "2000")
  if (engineCC && engineCC.includes('.') && !engineCC.toLowerCase().includes('cc')) {
    engineCC = String(Math.round(parseFloat(engineCC) * 1000));
  }

  // ── Fuel Type ────────────────────────────────────────────────────────────────
  const fuelPatterns = [
    /(?:fuel\s*type|fuel)[:\s]+(petrol|gasoline|diesel|electric|hybrid|lpg|gas)/i,
    /\b(diesel|petrol|gasoline|electric|hybrid)\b/i,
  ];
  let fuelType = findFirst(t, ...fuelPatterns);
  if (fuelType) {
    fuelType = fuelType.charAt(0).toUpperCase() + fuelType.slice(1).toLowerCase();
    if (fuelType.toLowerCase() === 'gasoline') fuelType = 'Petrol';
  }

  // ── Transmission ─────────────────────────────────────────────────────────────
  const transPatterns = [
    /(?:transmission|gearbox|gear)[:\s]+(automatic|manual|cvt|at|mt)/i,
    /\b(automatic\s+transmission|manual\s+transmission|cvt)\b/i,
    /\b(AT|MT|CVT)\b/,
  ];
  let transmission = findFirst(t, ...transPatterns);
  if (transmission) {
    const tl = transmission.toUpperCase();
    if (tl === 'AT' || tl.startsWith('AUTO')) transmission = 'Automatic';
    else if (tl === 'MT' || tl.startsWith('MAN')) transmission = 'Manual';
    else if (tl === 'CVT') transmission = 'CVT';
    else transmission = transmission.charAt(0).toUpperCase() + transmission.slice(1).toLowerCase();
  }

  // ── Color ────────────────────────────────────────────────────────────────────
  const colorPatterns = [
    /(?:exterior\s*colou?r|body\s*colou?r|colou?r)[:\s]+([A-Za-z\s]{2,20}?)(?:\n|,|\s{2})/i,
    /(?:paint|colour\s*code)[:\s]+([A-Za-z\s]{3,20}?)(?:\n|,|\s{2})/i,
  ];
  const color = findFirst(t, ...colorPatterns);

  // ── Mileage ──────────────────────────────────────────────────────────────────
  const mileagePatterns = [
    /(?:mileage|odometer\s*reading|odometer|kilometer)[:\s]*([\d,]+)\s*(?:km|kms|kilometers?|miles?)/i,
    /([\d,]+)\s*km(?:\s|$)/i,
  ];
  let mileage = findFirst(t, ...mileagePatterns);
  if (mileage) mileage = mileage.replace(/,/g, '');

  // ── Steering ──────────────────────────────────────────────────────────────────
  const steeringPatterns = [
    /(?:steering|steering\s*wheel\s*position)[:\s]+(right|left|rhd|lhd)/i,
    /\b(right[-\s]?hand\s*drive|left[-\s]?hand\s*drive|rhd|lhd)\b/i,
  ];
  let steering = findFirst(t, ...steeringPatterns);
  if (steering) {
    const sl = steering.toLowerCase();
    if (sl.includes('right') || sl === 'rhd') steering = 'Right Hand Drive';
    else if (sl.includes('left') || sl === 'lhd') steering = 'Left Hand Drive';
  }

  // ── Doors ─────────────────────────────────────────────────────────────────────
  const doorsPatterns = [
    /(?:doors?|number\s*of\s*doors?)[:\s]+(\d)/i,
    /(\d)\s*[-]?door/i,
  ];
  const doors = findFirst(t, ...doorsPatterns);

  return {
    make: make || null,
    model: model || null,
    year: year || null,
    chassisNo: chassisNo || null,
    engineCC: engineCC || null,
    fuelType: fuelType || null,
    transmission: transmission || null,
    color: color || null,
    mileage: mileage || null,
    steering: steering || null,
    doors: doors || null,
    rawTextSample: t.slice(0, 2000),
  };
}

async function downloadFromS3(key: string): Promise<Buffer> {
  const bucket = getAwsS3Bucket();
  const res = await getS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const chunks: Uint8Array[] = [];
  for await (const chunk of res.Body as AsyncIterable<Uint8Array>) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function deleteFromS3(key: string) {
  const bucket = getAwsS3Bucket();
  try {
    await getS3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch { /* best-effort cleanup */ }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');

    let buffer: Buffer;
    let s3Key: string | null = null;

    if (isJson) {
      const body = await request.json();
      s3Key = (body.s3Key as string)?.trim() || null;
      if (!s3Key) {
        return NextResponse.json({ error: 's3Key is required' }, { status: 400 });
      }
      buffer = await downloadFromS3(s3Key);
    } else {
      const formData = await request.formData();
      const file = formData.get('file');

      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
      }
      const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (!isPDF) {
        return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 });
      }
      buffer = Buffer.from(await file.arrayBuffer());
    }
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default as (buf: Buffer) => Promise<{ text: string }>;
    const { text } = await pdfParse(buffer);

    if (!text.trim()) {
      if (s3Key) await deleteFromS3(s3Key);
      return NextResponse.json({ error: 'Could not extract text from PDF. The file may be image-based or encrypted.' }, { status: 400 });
    }

    const extracted = extractVehicleData(text);

    if (s3Key) await deleteFromS3(s3Key);

    return NextResponse.json({ ok: true, extracted });
  } catch (e) {
    console.error('Vehicle PDF parse error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to parse PDF' }, { status: 500 });
  }
}

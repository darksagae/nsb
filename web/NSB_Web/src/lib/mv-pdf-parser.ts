// PDFParse is imported dynamically inside parseMvDatabasePDF to avoid
// module-load-time failures in Vercel's serverless environment.

export interface MvPdfRow {
  make: string;
  model: string;
  modelCode: string | null;
  bodyType: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  engineSizeCC: number | null;
  fuelType: string | null;
  fobValue: number | null;
  customsValue: number | null;
  importDuty: number | null;
  exciseDuty: number | null;
  vat: number | null;
  infrastructureLevy: number | null;
  environmentalLevy: number | null;
  withholdingTax: number | null;
  registrationFee: number | null;
  totalTaxUGX: number | null;
  serialNumber?: string | null;
  hscCode?: string | null;
  countryOrigin?: string | null;
  description?: string | null;
}

export interface ParseDiagnostics {
  rawTextSample: string;
  detectedHeaderLine: string;
  totalLinesFound: number;
  rowsParsed: number;
  rowsWithMakeModel: number;
  firstFiveRows: Partial<MvPdfRow>[];
  strategy: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseNum(v: string): number | null {
  if (!v || v === '-' || v === '—' || v.toLowerCase() === 'n/a' || v.toLowerCase() === 'nil') return null;
  const s = v.replace(/[,\s]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function norm(h: string): string {
  return h.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '').replace(/ugx$|usd$/, '');
}

// ─── Known makes (longest first for greedy multi-word matching) ───────────────

const KNOWN_MAKES = [
  'ASHOK LEYLAND', 'GREAT WALL', 'MITSUBISHI FUSO', 'HARLEY-DAVIDSON', 'HARLEY DAVIDSON',
  'ALFA ROMEO',   'LAND ROVER',  'RANGE ROVER',    'AM GENERAL',      'JOHN DEERE',
  'NEW HOLLAND',  'MERCEDES BENZ', 'MERCEDES-BENZ',  'MERCEDES',
  'VOLKSWAGEN',   'CHEVROLET',   'MITSUBISHI',     'CATERPILLAR',
  'SSANGYONG',    'DONGFENG',    'SINOTRUK',       'INFINITI',        'MAHINDRA',
  'DAIHATSU',     'HYUNDAI',     'RENAULT',        'PEUGEOT',         'CITROEN',
  'PORSCHE',      'LAMBORGHINI', 'MASERATI',       'FERRARI',
  'TOYOTA',       'NISSAN',      'HONDA',           'SUBARU',          'ISUZU',
  'MAZDA',        'BMW',         'AUDI',            'FORD',            'JEEP',
  'LEXUS',        'ACURA',       'SUZUKI',          'HINO',            'FUSO',
  'MAN',          'VOLVO',       'SCANIA',          'DAF',             'FIAT',
  'JAC',          'FAW',         'FOTON',           'TATA',            'KIA',
  'BAJAJ',        'YAMAHA',      'KAWASAKI',        'PIAGGIO',         'TRIUMPH',
  'HARLEY',       'KOMATSU',     'KUBOTA',          'HITACHI',         'LIEBHERR',
  'TEREX',        'BOBCAT',      'DAEWOO',          'GEELY',           'CHERY',
  'HAVAL',        'OPEL',        'SEAT',            'SKODA',           'CADILLAC',
  'BUICK',        'CHRYSLER',    'DODGE',           'RAM',             'LINCOLN',
  'GMC',          'HUMMER',      'SAAB',            'LANCIA',          'AMG',
];

function extractMakeModel(vehicleDesc: string): { make: string; model: string } | null {
  const upper = vehicleDesc.toUpperCase();
  for (const knownMake of KNOWN_MAKES) {
    if (upper.startsWith(knownMake + ' ') || upper === knownMake) {
      const make = vehicleDesc.slice(0, knownMake.length).trim();
      const model = vehicleDesc.slice(knownMake.length).trim();
      if (model) return { make, model };
    }
  }
  // Fallback: first word = make, rest = model
  const words = vehicleDesc.trim().split(/\s+/);
  if (words.length >= 2) return { make: words[0], model: words.slice(1).join(' ') };
  return null;
}

// ─── Strategy 0: URA Used MV Database (November + December format) ────────────
//
// Both November and December PDFs use the same column structure:
//   S/N | HSC CODE | COO | Description | CC/unit | CIF (USD)
//
// But pdf-parse extracts tabs differently per PDF version:
//   December (3 tabs): "{S/N} {HSC} {COO} {Desc}" | "{CC}" | "{CIF}"
//   November (4 tabs): "{S/N} {HSC}"               | "{COO} {Desc}" | "{CC}" | "{CIF}"
//   No-CC rows:        vary (2-3 tabs)
//
// Solution:
//   Join all tab parts with a space → apply a full-line regex.
//   This normalises both formats into a single parseable string.

// Matches rows WITH a recognised engine/capacity unit column
const RE_WITH_UNIT = /^\s*(\d+)\s*(\d{4}\.\d{2}\.\d{2})\s*([A-Z]{2})\s*(.+?)\s*([\d,.]+\s*(?:cc|Ton|bhp|Hp|HP|kW|KW|Kw|Axle|Axles))\s*([\d,]+\.\d{2})\s*$/i;

// Matches rows WITHOUT an engine unit (heavy equipment, trailers with no CC column)
const RE_NO_UNIT = /^\s*(\d+)\s*(\d{4}\.\d{2}\.\d{2})\s*([A-Z]{2})\s*(.+?)\s*([\d,]+\.\d{2})\s*$/i;

function parseURARow(rawLine: string): MvPdfRow | null {
  // Join tab parts so we handle both November (4-tab) and December (3-tab) layouts
  const line = rawLine.split('\t').map(p => p.trim()).filter(Boolean).join('  ');
  if (!line) return null;

  let serialNumber = '';
  let hscCode = '';
  let countryOrigin = '';
  let rawDescription = '';
  let ccStr = '';
  let cifStr = '';

  const m1 = line.match(RE_WITH_UNIT);
  if (m1) {
    serialNumber   = m1[1] ? m1[1].trim() : '';
    hscCode        = m1[2] ? m1[2].trim() : '';
    countryOrigin  = m1[3] ? m1[3].trim() : '';
    rawDescription = m1[4].trim();
    ccStr          = m1[5].trim();
    cifStr         = m1[6].trim();
  } else {
    const m2 = line.match(RE_NO_UNIT);
    if (!m2) return null;
    serialNumber   = m2[1] ? m2[1].trim() : '';
    hscCode        = m2[2] ? m2[2].trim() : '';
    countryOrigin  = m2[3] ? m2[3].trim() : '';
    rawDescription = m2[4].trim();
    cifStr         = m2[5].trim();
  }

  if (!rawDescription) return null;

  // Check if year got squashed into ccStr (e.g. "20102000 cc" or "2010 2000 cc")
  let extractedYearFromCc: string | null = null;
  const squashedYearMatch = ccStr.match(/^(19[89]\d|20[0-3]\d)\s*(.*)$/);
  if (squashedYearMatch) {
    extractedYearFromCc = squashedYearMatch[1];
    ccStr = squashedYearMatch[2]; // remaining string, e.g. "2000 cc"
  }

  // Also check if year got squashed at end of description
  const descYearSquashed = rawDescription.match(/^(.*?)(19[89]\d|20[0-3]\d)$/);
  if (descYearSquashed) {
    rawDescription = descYearSquashed[1].trim();
    if (!extractedYearFromCc) extractedYearFromCc = descYearSquashed[2];
  }

  // Append extracted year back to description temporarily to reuse original year parsing logic
  if (extractedYearFromCc) {
    rawDescription += ' ' + extractedYearFromCc;
  }

  // ── Year extraction ──────────────────────────────────────────────────────
  // Handles: "…, 2020"  "…, 1990 and below"  "…, 1990 and above"  year ranges
  const allYears: RegExpExecArray[] = [];
  { const re = /\b(19[89]\d|20[0-3]\d)\b/g; let m; while ((m = re.exec(rawDescription)) !== null) allYears.push(m); }
  if (allYears.length === 0) return null;

  const lastMatch  = allYears[allYears.length - 1];
  const lastYear   = parseInt(lastMatch[1]);
  const lastYearIdx = rawDescription.lastIndexOf(lastMatch[1]);
  const afterYear  = rawDescription.slice(lastYearIdx + 4).trim().toLowerCase();

  let yearFrom: number | null = lastYear;
  let yearTo:   number | null = lastYear;

  if (afterYear.startsWith('and below')) {
    yearFrom = null;
    yearTo   = lastYear;
  } else if (afterYear.startsWith('and above')) {
    yearFrom = lastYear;
    yearTo   = null;
  } else if (allYears.length >= 2) {
    // e.g. "2010 to 2015" or two years present
    yearFrom = parseInt(allYears[0][1]);
    yearTo   = lastYear;
  }

  // ── Strip year (+ trailing noise) from description ───────────────────────
  const vehicleDesc = rawDescription
    .slice(0, lastYearIdx)
    .replace(/,\s*$/, '')
    .trim();

  // ── Extract model code: ", model CODE" or ", Model CODE" ─────────────────
  let modelCode: string | null = null;
  let cleanDesc = vehicleDesc;

  const mcMatch = vehicleDesc.match(/,\s*[Mm]odel[:\s]+(.+)$/);
  if (mcMatch) {
    modelCode = mcMatch[1].trim();
    cleanDesc = vehicleDesc.slice(0, vehicleDesc.lastIndexOf(',')).trim();
  }

  if (!cleanDesc) return null;

  // ── Fuel Type ────────────────────────────────────────────────────────────
  let fuelType: string | null = null;
  const fuelMatch = cleanDesc.match(/\b(PETROL|DIESEL|HYBRID|ELECTRIC|LPG|GAS)\b/i);
  if (fuelMatch) {
    fuelType = fuelMatch[1].charAt(0).toUpperCase() + fuelMatch[1].slice(1).toLowerCase();
    cleanDesc = cleanDesc.replace(new RegExp(`\\b${fuelMatch[1]}\\b`, 'i'), '').replace(/\s{2,}/g, ' ').trim();
  }

  // ── Make / Model split ───────────────────────────────────────────────────
  const mm = extractMakeModel(cleanDesc);
  if (!mm || !mm.make || !mm.model) return null;

  // ── Engine CC ─────────────────────────────────────────────────────────────
  const ccMatch     = ccStr.match(/^([\d,.]+)\s*(?:cc|Ton|bhp|Hp|HP|kW|KW|Kw|Axle|Axles)/i);
  const engineSizeCC = ccMatch ? parseInt(ccMatch[1].replace(/[,.]/g, '')) : null;

  return {
    make:               mm.make,
    model:              mm.model,
    modelCode,
    bodyType:           null,
    yearFrom,
    yearTo,
    engineSizeCC,
    fuelType,
    fobValue:           null,
    customsValue:       parseNum(cifStr),
    importDuty:         null,
    exciseDuty:         null,
    vat:                null,
    infrastructureLevy: null,
    environmentalLevy:  null,
    withholdingTax:     null,
    registrationFee:    null,
    totalTaxUGX:        null,
    serialNumber:       serialNumber || null,
    hscCode:            hscCode || null,
    countryOrigin:      countryOrigin || null,
    description:        rawDescription || null,
  };
}

function parseURAFormat(lines: string[]): { rows: MvPdfRow[]; headerLine: string } {
  let headerIdx  = -1;
  let headerLine = '';

  // Header detection: flexible — match any variation of HSC/HS CODE
  for (let i = 0; i < lines.length; i++) {
    const u = lines[i].toUpperCase();
    const hasHSC = u.includes('HSC') || u.includes('HS CODE') || u.includes('HSCODE') || u.includes('H.S.');
    if (hasHSC) {
      const window = [u, ...lines.slice(i + 1, i + 4).map(l => l.toUpperCase())].join(' ');
      if (window.includes('CIF') || window.includes('DESCRIPTION') || window.includes('COUNTRY') || window.includes('COO')) {
        headerIdx  = i;
        headerLine = lines[i];
        break;
      }
    }
  }

  if (headerIdx === -1) return { rows: [], headerLine: '' };

  const rows: MvPdfRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const row = parseURARow(lines[i]);
    if (row) rows.push(row);
  }

  return { rows, headerLine };
}

// Strategy 0b: Brute-force — try the URA row regex on every line without header detection.
// Handles PDFs where the header text doesn't match any known pattern.
function parseURABrute(lines: string[]): { rows: MvPdfRow[]; headerLine: string } {
  const rows: MvPdfRow[] = [];
  for (const line of lines) {
    const row = parseURARow(line);
    if (row) rows.push(row);
  }
  return { rows, headerLine: '(brute-force scan)' };
}

// Strategy 0c: Multi-line reconstruction — handles PDFs where pdf-parse puts each
// table cell on its own line. Slides a window of 1–7 consecutive lines, joins them
// with a space, and tries to parse the combined string as a URA row.
function parseURAMultiline(lines: string[]): { rows: MvPdfRow[]; headerLine: string } {
  const rows: MvPdfRow[] = [];
  const used = new Set<number>();
  let headerLine = '';

  // Optional: find header to start after it
  let startIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 80); i++) {
    const u = lines[i].toUpperCase();
    if (/HSC|HS[.\s]CODE|HSCODE/.test(u) && /CIF|DESCRIPTION|COUNTRY|COO/.test(u)) {
      headerLine = lines[i];
      startIdx = i + 1;
      break;
    }
  }

  for (let i = startIdx; i < lines.length; i++) {
    if (used.has(i)) continue;
    for (let n = 1; n <= 7 && i + n <= lines.length; n++) {
      // Skip lines already consumed
      let hasUsed = false;
      for (let k = i; k < i + n; k++) { if (used.has(k)) { hasUsed = true; break; } }
      if (hasUsed) break;

      const combined = lines.slice(i, i + n).map(l => l.trim()).filter(Boolean).join(' ');
      const row = parseURARow(combined);
      if (row) {
        rows.push(row);
        for (let k = i; k < i + n; k++) used.add(k);
        i += n - 1;
        break;
      }
    }
  }
  return { rows, headerLine: headerLine || '(multi-line reconstruction)' };
}

// ─── Strategy 1: Header-based 2-space delimiter ───────────────────────────────

const HEADER_MAP: Record<string, keyof MvPdfRow> = {
  make: 'make', manufacturer: 'make',
  model: 'model',
  modelcode: 'modelCode', code: 'modelCode',
  bodytype: 'bodyType', body: 'bodyType',
  yearfrom: 'yearFrom', fromyear: 'yearFrom', yearsfrom: 'yearFrom',
  yearto: 'yearTo', toyear: 'yearTo', yearsto: 'yearTo',
  enginecc: 'engineSizeCC', enginesizecc: 'engineSizeCC', enginesize: 'engineSizeCC',
  enginecapacitycc: 'engineSizeCC', cc: 'engineSizeCC', capacity: 'engineSizeCC',
  fueltype: 'fuelType', fuel: 'fuelType',
  fobvalue: 'fobValue', fob: 'fobValue', fobusd: 'fobValue',
  customsvalue: 'customsValue', customs: 'customsValue', cifvalue: 'customsValue', cif: 'customsValue',
  importduty: 'importDuty', duty: 'importDuty', id: 'importDuty',
  exciseduty: 'exciseDuty', excise: 'exciseDuty', ed: 'exciseDuty',
  vat: 'vat', vat18: 'vat', valueaddedtax: 'vat',
  infrastructurelevy: 'infrastructureLevy', infra: 'infrastructureLevy', il: 'infrastructureLevy',
  environmentallevy: 'environmentalLevy', environmental: 'environmentalLevy', el: 'environmentalLevy',
  withholdingtax: 'withholdingTax', withholding: 'withholdingTax', wht: 'withholdingTax',
  registrationfee: 'registrationFee', registration: 'registrationFee', rf: 'registrationFee',
  totaltax: 'totalTaxUGX', totaltaxugx: 'totalTaxUGX', total: 'totalTaxUGX', tt: 'totalTaxUGX',
};

const TEXT_FIELDS = new Set<keyof MvPdfRow>(['make', 'model', 'modelCode', 'bodyType', 'fuelType']);

function buildRow(cells: string[], fieldMap: (keyof MvPdfRow | null)[]): MvPdfRow | null {
  const raw: Record<string, unknown> = {};
  fieldMap.forEach((field, idx) => {
    if (!field || cells[idx] === undefined) return;
    const val = cells[idx].trim();
    raw[field] = TEXT_FIELDS.has(field) ? (val || null) : parseNum(val);
  });
  const make  = (raw.make  as string | null) ?? null;
  const model = (raw.model as string | null) ?? null;
  if (!make || !model) return null;
  return {
    make, model,
    modelCode:          (raw.modelCode          as string | null) ?? null,
    bodyType:           (raw.bodyType           as string | null) ?? null,
    yearFrom:           (raw.yearFrom           as number | null) ?? null,
    yearTo:             (raw.yearTo             as number | null) ?? null,
    engineSizeCC:       (raw.engineSizeCC       as number | null) ?? null,
    fuelType:           (raw.fuelType           as string | null) ?? null,
    fobValue:           (raw.fobValue           as number | null) ?? null,
    customsValue:       (raw.customsValue       as number | null) ?? null,
    importDuty:         (raw.importDuty         as number | null) ?? null,
    exciseDuty:         (raw.exciseDuty         as number | null) ?? null,
    vat:                (raw.vat                as number | null) ?? null,
    infrastructureLevy: (raw.infrastructureLevy as number | null) ?? null,
    environmentalLevy:  (raw.environmentalLevy  as number | null) ?? null,
    withholdingTax:     (raw.withholdingTax     as number | null) ?? null,
    registrationFee:    (raw.registrationFee    as number | null) ?? null,
    totalTaxUGX:        (raw.totalTaxUGX        as number | null) ?? null,
  };
}

function parseWithHeaders(lines: string[]): { rows: MvPdfRow[]; headerLine: string } {
  let headerIdx = -1; let headerLine = '';
  for (let i = 0; i < lines.length; i++) {
    const u = lines[i].toUpperCase();
    if (/\bMAKE\b|\bMANUFACTURER\b/.test(u) && /\bMODEL\b/.test(u) && /\bTAX\b|\bDUTY\b|\bVAT\b|\bTOTAL\b/.test(u)) {
      headerIdx = i; headerLine = lines[i]; break;
    }
  }
  if (headerIdx === -1) return { rows: [], headerLine: '' };
  const rawHeaders = headerLine.split(/\s{2,}/).map(h => h.trim()).filter(Boolean);
  const fieldMap   = rawHeaders.map(h => HEADER_MAP[norm(h)] ?? null);
  const rows: MvPdfRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split(/\s{2,}/);
    if (cols.length < 4) continue;
    const row = buildRow(cols, fieldMap);
    if (row) rows.push(row);
  }
  return { rows, headerLine };
}

// ─── Strategy 2: Tab-separated with Make/Model headers ───────────────────────

function parseWithTabs(lines: string[]): { rows: MvPdfRow[]; headerLine: string } {
  let headerIdx = -1; let headerLine = '';
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('\t')) {
      const u = lines[i].toUpperCase();
      if (/MAKE|MANUFACTURER/.test(u) && /MODEL/.test(u)) {
        headerIdx = i; headerLine = lines[i]; break;
      }
    }
  }
  if (headerIdx === -1) return { rows: [], headerLine: '' };
  const rawHeaders = headerLine.split('\t').map(h => h.trim()).filter(Boolean);
  const fieldMap   = rawHeaders.map(h => HEADER_MAP[norm(h)] ?? null);
  const rows: MvPdfRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (!lines[i].includes('\t')) continue;
    const cols = lines[i].split('\t');
    if (cols.length < 4) continue;
    const row = buildRow(cols, fieldMap);
    if (row) rows.push(row);
  }
  return { rows, headerLine };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function parseMvDatabasePDF(
  buffer: Buffer,
  maxPages?: number
): Promise<{ rows: MvPdfRow[]; diagnostics: ParseDiagnostics }> {
  // Import from lib directly to avoid pdf-parse v1's test-file bug at module load
  const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default as (buf: Buffer, opts?: object) => Promise<{ text: string }>;
  const opts = maxPages ? { max: maxPages } : undefined;
  const { text: rawText } = await pdfParse(buffer, opts);
  const rawTextSample = rawText.slice(0, 3000);

  const allLines = rawText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !/^page\s+\d+$/i.test(l));

  let rows: MvPdfRow[] = [];
  let headerLine = '';
  let strategy   = '';

  // Strategy 0: URA S/N + HSC CODE + CIF format (November & December)
  const r0 = parseURAFormat(allLines);
  if (r0.rows.length > 0) {
    rows = r0.rows; headerLine = r0.headerLine; strategy = 'ura-sn-hsc-cif';
  }

  // Strategy 0b: brute-force URA row scan (header not found / different header text)
  if (rows.length === 0) {
    const r0b = parseURABrute(allLines);
    if (r0b.rows.length > 0) {
      rows = r0b.rows; headerLine = r0b.headerLine; strategy = 'ura-brute';
    }
  }

  // Strategy 0c: multi-line reconstruction (pdf-parse puts each cell on its own line)
  if (rows.length === 0) {
    const r0c = parseURAMultiline(allLines);
    if (r0c.rows.length > 0) {
      rows = r0c.rows; headerLine = r0c.headerLine; strategy = 'ura-multiline';
    }
  }

  // Strategy 1: explicit Make/Model/Tax column headers, 2-space separated
  if (rows.length === 0) {
    const r1 = parseWithHeaders(allLines);
    if (r1.rows.length > 0) {
      rows = r1.rows; headerLine = r1.headerLine; strategy = 'header-2space';
    }
  }

  // Strategy 2: explicit Make/Model column headers, tab separated
  if (rows.length === 0) {
    const r2 = parseWithTabs(allLines);
    if (r2.rows.length > 0) {
      rows = r2.rows; headerLine = r2.headerLine; strategy = 'header-tabs';
    }
  }

  const diagnostics: ParseDiagnostics = {
    rawTextSample,
    detectedHeaderLine: headerLine,
    totalLinesFound:    allLines.length,
    rowsParsed:         rows.length,
    rowsWithMakeModel:  rows.filter(r => r.make && r.model).length,
    firstFiveRows:      rows.slice(0, 5),
    strategy,
  };

  return { rows, diagnostics };
}

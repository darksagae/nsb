/** Mirrors sales_system PDFService._parseInvoiceNotes */

export type ParsedInvoiceNotes = {
  make?: string;
  model?: string;
  year?: number;
  engineCc?: number;
  cfMombasaUsd?: number;
  clearanceUsd?: number;
  cfKampalaUsd?: number;
  ttUsd?: number;
  phase1Rate?: number;
  phase1TotalUgx?: number;
  includePhase2?: boolean;
  taxesUra?: number;
  plates?: number;
  insurance?: number;
  agent?: number;
  registrationProcess?: number;
  secondInstallment?: number;
  cv?: number;
  idf?: number;
  importDuty?: number;
  vat?: number;
  wht?: number;
  envLevy?: number;
  infra?: number;
  regFee?: number;
  stamp?: number;
  regForm?: number;
  sheetUsed?: string;
};

function tryParseMoney(raw: string): number | undefined {
  const cleaned = raw.replace(/[^0-9.-]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

export function parseInvoiceNotes(notes?: string | null): ParsedInvoiceNotes {
  const parsed: ParsedInvoiceNotes = {};
  if (!notes?.trim()) return parsed;

  for (const line of notes.split('\n').map((e) => e.trim())) {
    const normalizedLine = line.toLowerCase();
    if (line.startsWith('Make:')) {
      parsed.make = line.slice(5).trim();
    } else if (line.startsWith('Model:')) {
      parsed.model = line.slice(6).trim();
    } else if (line.startsWith('Year:')) {
      parsed.year = parseInt(line.slice(5).trim(), 10) || undefined;
    } else if (line.startsWith('Engine:')) {
      const cc = line.match(/(\d+)/)?.[1];
      parsed.engineCc = cc ? parseInt(cc, 10) : undefined;
    } else if (line.startsWith('TT Charges:')) {
      parsed.ttUsd = tryParseMoney(line.slice(11));
    } else if (line.startsWith('Phase 1 Total:')) {
      parsed.phase1TotalUgx = tryParseMoney(line.slice(14));
    } else if (line.startsWith('C&F Mombasa:')) {
      if (!line.includes('Not selected')) parsed.cfMombasaUsd = tryParseMoney(line.slice(13));
    } else if (line.startsWith('C&F Kampala:')) {
      if (!line.includes('Not selected')) parsed.cfKampalaUsd = tryParseMoney(line.slice(13));
    } else if (line.startsWith('Clearance Msa→Kla:') || line.startsWith('Clearance Msa->Kla:')) {
      if (!line.includes('Not selected')) parsed.clearanceUsd = tryParseMoney(line.slice(19));
    } else if (line.startsWith('Phase 1 Rate:')) {
      parsed.phase1Rate = tryParseMoney(line.slice(13));
    } else if (line.startsWith('Phase 2 Included:')) {
      parsed.includePhase2 = line.slice(17).trim().toLowerCase() === 'yes';
    } else if (line.startsWith('URA Taxes:')) {
      if (!line.toLowerCase().includes('not included')) {
        parsed.taxesUra = tryParseMoney(line.slice(10));
      }
    } else if (line.startsWith('Number Plates:')) {
      parsed.plates = tryParseMoney(line.slice(14));
    } else if (line.startsWith('3rd Party Insurance:')) {
      parsed.insurance = tryParseMoney(line.slice(20));
    } else if (line.startsWith('Agency Fees:')) {
      parsed.agent = tryParseMoney(line.slice(12));
    } else if (line.startsWith('Registration Process:')) {
      parsed.registrationProcess = tryParseMoney(line.slice(21));
    } else if (normalizedLine.startsWith('customs value')) {
      parsed.cv = tryParseMoney(line.split(':').pop() ?? '');
    } else if (normalizedLine.startsWith('import declaration')) {
      parsed.idf = tryParseMoney(line.split(':').pop() ?? '');
    } else if (normalizedLine.startsWith('import duty')) {
      parsed.importDuty = tryParseMoney(line.split(':').pop() ?? '');
    } else if (normalizedLine.startsWith('vat')) {
      parsed.vat = tryParseMoney(line.split(':').pop() ?? '');
    } else if (normalizedLine.startsWith('withholding tax') || normalizedLine.startsWith('wht')) {
      parsed.wht = tryParseMoney(line.split(':').pop() ?? '');
    } else if (normalizedLine.startsWith('environmental levy')) {
      parsed.envLevy = tryParseMoney(line.split(':').pop() ?? '');
    } else if (normalizedLine.startsWith('infrastructure levy')) {
      parsed.infra = tryParseMoney(line.split(':').pop() ?? '');
    } else if (normalizedLine.startsWith('registration fee')) {
      parsed.regFee = tryParseMoney(line.split(':').pop() ?? '');
    } else if (normalizedLine.startsWith('stamp duty')) {
      parsed.stamp = tryParseMoney(line.split(':').pop() ?? '');
    } else if (normalizedLine.startsWith('reg form')) {
      parsed.regForm = tryParseMoney(line.split(':').pop() ?? '');
    } else if (normalizedLine.startsWith('sheet used:')) {
      parsed.sheetUsed = line.slice(11).trim();
    }
  }

  if (parsed.secondInstallment == null && parsed.taxesUra != null) {
    parsed.registrationProcess =
      (parsed.taxesUra ?? 0) + (parsed.plates ?? 0) + (parsed.insurance ?? 0) + (parsed.agent ?? 0);
    parsed.secondInstallment = parsed.registrationProcess;
  }

  if (parsed.envLevy != null && parsed.envLevy > 0) {
    parsed.sheetUsed = 'with surcharge';
  } else if (parsed.envLevy != null && parsed.envLevy === 0) {
    parsed.sheetUsed = 'without surcharge';
  }

  return parsed;
}

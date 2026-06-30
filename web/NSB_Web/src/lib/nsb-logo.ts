import fs from 'fs';
import path from 'path';

export const NSB_LOGO_PUBLIC_PATH = '/assets/images/nsb-logo.png';

const LOGO_CANDIDATES = [
  path.join(process.cwd(), 'public/assets/images/nsb-logo.png'),
  path.join(process.cwd(), 'public/assets/images/favicon-32x32.png'),
];

/** Base64 data URI for server-side PDF generation (@react-pdf/renderer). */
export function getNsbLogoDataUri(): string | null {
  for (const file of LOGO_CANDIDATES) {
    try {
      if (!fs.existsSync(file)) continue;
      const buf = fs.readFileSync(file);
      return `data:image/png;base64,${buf.toString('base64')}`;
    } catch {
      continue;
    }
  }
  return null;
}

/** Resolve logo src for PDF: settings URL, embedded data URI, or null. */
export function resolveInvoiceLogoSrc(settingsLogoUrl?: string): string | null {
  const fromSettings = settingsLogoUrl?.trim();
  if (fromSettings) return fromSettings;
  return getNsbLogoDataUri();
}

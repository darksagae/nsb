import fs from 'fs';
import path from 'path';

const ICON_FILES = {
  location: 'address.png',
  whatsapp: 'whatsapp.png',
  facebook: 'facebook.png',
  instagram: 'insta.png',
  x: 'x.png',
  tiktok: 'tiktok.png',
  gmail: 'gmail.png',
} as const;

export type PdfIconKey = keyof typeof ICON_FILES;

const ICON_DIR = path.join(process.cwd(), 'public/assets/pdf-icons');

function readIconDataUri(filename: string): string | null {
  try {
    const file = path.join(ICON_DIR, filename);
    if (!fs.existsSync(file)) return null;
    const buf = fs.readFileSync(file);
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/** Load PDF header icons when bundled under public/assets/pdf-icons (same filenames as sales_system). */
export function getPdfIconDataUris(): Partial<Record<PdfIconKey, string>> {
  const out: Partial<Record<PdfIconKey, string>> = {};
  for (const [key, file] of Object.entries(ICON_FILES) as [PdfIconKey, string][]) {
    const uri = readIconDataUri(file);
    if (uri) out[key] = uri;
  }
  return out;
}

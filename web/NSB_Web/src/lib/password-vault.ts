import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

function vaultKey(): Buffer {
  const secret = process.env.SESSION_SECRET ?? 'nsb-dev-session-secret-change-me';
  return createHash('sha256').update(`nsb-password-vault:${secret}`).digest();
}

/** Encrypt plaintext password for admin recovery display (AES-256-GCM). */
export function encryptPasswordPlain(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', vaultKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

export function decryptPasswordPlain(stored: string | null | undefined): string | null {
  if (!stored) return null;
  try {
    const [ivB, tagB, dataB] = stored.split('.');
    if (!ivB || !tagB || !dataB) return null;
    const decipher = createDecipheriv('aes-256-gcm', vaultKey(), Buffer.from(ivB, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

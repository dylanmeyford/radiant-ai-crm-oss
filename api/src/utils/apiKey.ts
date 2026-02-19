import crypto from 'crypto';
import bcrypt from 'bcrypt';

export function generatePlainApiKey(): string {
  // 32 bytes -> 43 char base64url; prefix for readability
  const raw = crypto.randomBytes(32).toString('base64url');
  return `rk_${raw}`; // rk = REST key
}

export async function hashApiKey(plain: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(plain, salt);
}



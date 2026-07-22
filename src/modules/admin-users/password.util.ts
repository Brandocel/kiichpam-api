import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

/**
 * Hash de contraseñas usando scrypt (incluido en Node, sin dependencias externas).
 * Formato almacenado: scrypt$<saltHex>$<hashHex>
 */
const KEY_LENGTH = 64;
const PREFIX = 'scrypt';

export function hashPassword(plainPassword: string): string {
  const salt = randomBytes(16);
  const derivedKey = scryptSync(plainPassword, salt, KEY_LENGTH);

  return `${PREFIX}$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

export function verifyPassword(
  plainPassword: string,
  storedHash: string,
): boolean {
  if (!storedHash) {
    return false;
  }

  const parts = storedHash.split('$');

  if (parts.length !== 3 || parts[0] !== PREFIX) {
    return false;
  }

  const [, saltHex, hashHex] = parts;

  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const derivedKey = scryptSync(plainPassword, salt, expected.length);

    if (derivedKey.length !== expected.length) {
      return false;
    }

    return timingSafeEqual(derivedKey, expected);
  } catch {
    return false;
  }
}

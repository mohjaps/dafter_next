import "server-only";
import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * ASP.NET Core Identity PasswordHasher V3 format, so administrator passwords created
 * by the previous .NET backend keep working: 0x01 | prf | iterations | saltLen | salt | subkey.
 */
const PRF: Record<number, string> = { 0: "sha1", 1: "sha256", 2: "sha512" };
const ITERATIONS = 100_000;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const subkey = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha512");
  const header = Buffer.alloc(13);
  header[0] = 0x01;
  header.writeUInt32BE(2, 1);
  header.writeUInt32BE(ITERATIONS, 5);
  header.writeUInt32BE(salt.length, 9);
  return Buffer.concat([header, salt, subkey]).toString("base64");
}

export function verifyPassword(hash: string, password: string): boolean {
  try {
    const bytes = Buffer.from(hash, "base64");
    if (bytes.length < 13 || bytes[0] !== 0x01) return false;
    const prf = PRF[bytes.readUInt32BE(1)];
    const iterations = bytes.readUInt32BE(5);
    const saltLength = bytes.readUInt32BE(9);
    if (!prf || saltLength < 16 || iterations < 1 || 13 + saltLength >= bytes.length) return false;
    const salt = bytes.subarray(13, 13 + saltLength);
    const expected = bytes.subarray(13 + saltLength);
    if (expected.length < 16) return false;
    const actual = pbkdf2Sync(password, salt, iterations, expected.length, prf);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

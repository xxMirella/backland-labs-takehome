import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const N = 2 ** 15; // ~32 MB per hash; stored in the hash so it can be raised later
const R = 8;
const P = 1;
const KEY_LEN = 64;
const MAXMEM = 128 * N * R * 2;

const derive = (password: string, salt: Buffer, n: number, keyLen: number) =>
  scrypt(password.normalize("NFKC"), salt, keyLen, { N: n, r: R, p: P, maxmem: MAXMEM });

/** Format: scrypt$N$salt(base64)$key(base64). Every hash gets its own random salt. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, KEY_LEN);
  return `scrypt$${N}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, salt, key] = stored.split("$");
  if (alg !== "scrypt" || !n || !salt || !key) return false;
  const cost = Number(n);
  if (!Number.isInteger(cost) || cost < 2 ** 10 || cost > 2 ** 20) return false;
  const expected = Buffer.from(key, "base64");
  const actual = await derive(password, Buffer.from(salt, "base64"), cost, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

let dummyHash: Promise<string> | undefined;
/** Hash of a random password: verifying against it costs the same as a real check (hides unknown emails). */
export const getDummyHash = () => (dummyHash ??= hashPassword(randomBytes(16).toString("hex")));

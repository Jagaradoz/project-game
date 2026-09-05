/**
 * Password digests for the local stand-in accounts.
 *
 * The plain password is never stored and never leaves this module. PBKDF2 with
 * a per-account random salt is not required for a demo, but writing the weak
 * version would leave a shape that looks ready to promote -- and this file is
 * exactly the sort that gets copied into the real thing.
 *
 * Real authentication is the backend's, per TOR 5. This exists so /login and
 * /register can be built and reviewed now.
 */

const PBKDF2_ITERATIONS = 120_000;
const DIGEST_BITS = 256;
const SALT_BYTES = 16;

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('This browser does not expose Web Crypto over a secure context.');
  }
  return subtle;
}

export function createSalt(): string {
  const bytes = new Uint8Array(SALT_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export async function derivePasswordDigest(password: string, salt: string): Promise<string> {
  const subtle = getSubtle();
  const key = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);

  const bits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: fromHex(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    key,
    DIGEST_BITS,
  );

  return toHex(new Uint8Array(bits));
}

/**
 * Length-independent comparison. The timing of a local string compare is not a
 * realistic attack here, but the correct shape costs one loop.
 */
export function digestsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * The explicit `Uint8Array<ArrayBuffer>` matters: TypeScript's newer lib types
 * widen a bare `new Uint8Array(n)` to `ArrayBufferLike`, which BufferSource
 * (and therefore deriveBits) will not accept.
 */
function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

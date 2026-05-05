// src/lib/crypto/generateKeys.ts — FINAL, uses AES-GCM (no block size issues)

export function bufToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function base64ToBuf(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes as Uint8Array<ArrayBuffer>;
}

export async function generateRSAKeyPair(): Promise<CryptoKeyPair> {
  return await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const buf = await crypto.subtle.exportKey("spki", key);
  return bufToBase64(buf);
}

// Derives AES-GCM key from password+salt (replaces AES-KW — no block size req)
export async function deriveWrappingKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  // ✅ AES-GCM instead of AES-KW — authenticated encryption, no % 8 requirement
  return await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Wraps private key: export pkcs8 → encrypt with AES-GCM
// Output layout: [12 bytes IV] + [AES-GCM ciphertext]
export async function wrapPrivateKey(
  privateKey: CryptoKey,
  wrappingKey: CryptoKey
): Promise<ArrayBuffer> {
  // Export raw pkcs8 — works regardless of byte length
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", privateKey);
  console.log("[wrapPrivateKey] pkcs8 byteLength:", pkcs8.byteLength); // 1216-1219, any is fine

  // Random 12-byte IV for AES-GCM
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt pkcs8 bytes — AES-GCM handles any length
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    wrappingKey,
    pkcs8
  );

  console.log("[wrapPrivateKey] encrypt SUCCESS, ciphertext byteLength:", ciphertext.byteLength);

  // Prepend IV so we can decrypt later: [12 IV bytes] + [ciphertext]
  const out = new ArrayBuffer(12 + ciphertext.byteLength);
  new Uint8Array(out).set(iv, 0);
  new Uint8Array(out).set(new Uint8Array(ciphertext), 12);
  return out;
}

// Unwraps private key: split IV + ciphertext → decrypt → importKey
export async function unwrapPrivateKey(
  wrappedBuf: ArrayBuffer,
  wrappingKey: CryptoKey
): Promise<CryptoKey> {
  // Split IV and ciphertext
  const iv         = wrappedBuf.slice(0, 12);
  const ciphertext = wrappedBuf.slice(12);

  // Decrypt to get raw pkcs8 bytes
  const pkcs8 = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    wrappingKey,
    ciphertext
  );

  // Import as non-extractable RSA-OAEP private key
  return await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"]
  );
}
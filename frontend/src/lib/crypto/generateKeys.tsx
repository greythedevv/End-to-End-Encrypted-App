//
// 🔑 RSA KEY PAIR
//
export async function generateRSAKeyPair() {
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

//
// 📤 EXPORT PUBLIC KEY (base64)
//
export async function exportPublicKey(key: CryptoKey) {
  const exported = await crypto.subtle.exportKey("spki", key);
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
}

//
// 🔐 PBKDF2 → AES-KW WRAPPING KEY
//
export async function deriveWrappingKey(
  password: string,
  salt: ArrayBuffer
) {
  const enc = new TextEncoder();

  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    baseKey,
    {
      name: "AES-KW",
      length: 256,
    },
    true,
    ["wrapKey", "unwrapKey"]
  );
}

//
// 🔒 WRAP PRIVATE KEY (REGISTER FLOW)
//
export async function wrapPrivateKey(
  privateKey: CryptoKey,
  wrappingKey: CryptoKey
) {
  return await crypto.subtle.wrapKey(
    "pkcs8",
    privateKey,
    wrappingKey,
    "AES-KW"
  );
}

//
// 🔓 UNWRAP PRIVATE KEY (LOGIN FLOW)
//
export async function unwrapPrivateKey(
  wrappedKey: ArrayBuffer,
  wrappingKey: CryptoKey
) {
  return await crypto.subtle.unwrapKey(
    "pkcs8",
    wrappedKey,
    wrappingKey,
    "AES-KW",
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["decrypt"]
  );
}
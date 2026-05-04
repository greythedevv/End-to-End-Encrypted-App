export async function encryptMessage(
  message: string,
  recipientPublicKey: CryptoKey
) {
  const enc = new TextEncoder();

  // 1. Generate AES key
  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));

  // 2. Encrypt message
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    enc.encode(message)
  );

  // 3. Export AES key
  const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);

  // 4. Encrypt AES key with recipient RSA key
  const encryptedKey = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    recipientPublicKey,
    rawAesKey
  );

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    iv: btoa(String.fromCharCode(...iv)),
    encryptedKey: btoa(String.fromCharCode(...new Uint8Array(encryptedKey))),
  };
}
export async function encryptMessage(
  message: string,
  recipientPublicKey: CryptoKey,
  senderPublicKey: CryptoKey // 👈 REQUIRED now
) {
  const enc = new TextEncoder();

  // -------------------------
  // 1. Generate AES-GCM key
  // -------------------------
  const aesKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  // -------------------------
  // 2. Generate IV (12 bytes)
  // -------------------------
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // -------------------------
  // 3. Optional AAD (must match decrypt)
  // -------------------------
  const additionalData = enc.encode("whisperbox");

  // -------------------------
  // 4. Encrypt message
  // -------------------------
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData,
    },
    aesKey,
    enc.encode(message)
  );

  // -------------------------
  // 5. Export AES key
  // -------------------------
  const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);

  // -------------------------
  // 6. Encrypt AES key for recipient
  // -------------------------
  const encryptedKey = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    recipientPublicKey,
    rawAesKey
  );

  // -------------------------
  // 7. Encrypt AES key for sender (SELF)
  // -------------------------
  const encryptedKeyForSelf = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    senderPublicKey,
    rawAesKey
  );

  // -------------------------
  // 8. Helpers
  // -------------------------
  const toBase64 = (buf: ArrayBuffer | Uint8Array) =>
    btoa(
      String.fromCharCode(
        ...new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer)
      )
    );

  // -------------------------
  // 9. Return payload
  // -------------------------
  return {
    ciphertext: toBase64(ciphertext),
    iv: toBase64(iv),
    encryptedKey: toBase64(encryptedKey),
    encryptedKeyForSelf: toBase64(encryptedKeyForSelf),
  };
}
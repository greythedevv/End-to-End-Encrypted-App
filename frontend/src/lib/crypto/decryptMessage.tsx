export async function decryptMessage(
  payload: any,
  privateKey: CryptoKey
) {
  const base64ToBuf = (b64: string): ArrayBuffer => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  };

  try {
    // -------------------------
    // 1. Decode encrypted AES key
    // -------------------------
    const encryptedKeyBuf = base64ToBuf(payload.encryptedKey);

    // -------------------------
    // 2. Decrypt AES key using RSA private key
    // -------------------------
    const rawAesKey = await crypto.subtle.decrypt(
      {
        name: "RSA-OAEP",
      },
      privateKey,
      encryptedKeyBuf
    );

    // -------------------------
    // 3. Import AES key
    // -------------------------
    const aesKey = await crypto.subtle.importKey(
      "raw",
      rawAesKey,
      "AES-GCM",
      false,
      ["decrypt"]
    );

    // -------------------------
    // 4. Decode IV + ciphertext
    // -------------------------
    const iv = base64ToBuf(payload.iv);
    const ciphertext = base64ToBuf(payload.ciphertext);

    // -------------------------
    // 5. Decrypt message
    // -------------------------
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
      },
      aesKey,
      ciphertext
    );

    return new TextDecoder().decode(decryptedBuffer);

  } catch (err) {
    console.error("Decrypt failed:", err);
    return "[Unable to decrypt message]";
  }
}
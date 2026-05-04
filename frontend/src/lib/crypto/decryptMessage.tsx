export async function decryptMessage(
  payload: any,
  privateKey: CryptoKey,
  isSender: boolean // to determine which encrypted key to use
) {
  // -------------------------
  // Helpers
  // -------------------------
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
    // 1. Choose correct encrypted AES key
    // -------------------------
    const encryptedKeyBase64 = isSender
      ? payload.encryptedKeyForSelf
      : payload.encryptedKey;

    if (!encryptedKeyBase64) {
      throw new Error("Missing encrypted key");
    }

    const encryptedKeyBuf = base64ToBuf(encryptedKeyBase64);

    // -------------------------
    // 2. Decrypt AES key (RSA-OAEP)
    // -------------------------
    const rawAesKey = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      encryptedKeyBuf
    );

    // -------------------------
    // 3. Import AES-GCM key
    // -------------------------
    const aesKey = await crypto.subtle.importKey(
      "raw",
      rawAesKey,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );

    // -------------------------
    // 4. Decode IV + ciphertext
    // -------------------------
    const iv = new Uint8Array(base64ToBuf(payload.iv));
    const ciphertext = base64ToBuf(payload.ciphertext);

    if (!iv || !ciphertext) {
      throw new Error("Invalid payload (iv/ciphertext missing)");
    }

    // -------------------------
    // 5. Optional AAD (if you add it in encryption)
    // -------------------------
    const additionalData = new TextEncoder().encode("whisperbox");

    // -------------------------
    // 6. Decrypt message (AES-GCM)
    // -------------------------
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData, // 👈 must match encryption
      },
      aesKey,
      ciphertext
    );

    // -------------------------
    // 7. Convert to string
    // -------------------------
    return new TextDecoder().decode(decryptedBuffer);

  } catch (err) {
    console.error("Decrypt failed:", err);
    return "[Unable to decrypt message]";
  }
}
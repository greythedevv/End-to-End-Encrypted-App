const DB_NAME = "whisperbox-db";
const STORE = "keys";

export async function savePrivateKey(key: CryptoKey) {
  const db = await openDB();
  const exported = await crypto.subtle.exportKey("pkcs8", key);

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const req = store.put(exported, "privateKey");

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getPrivateKey(): Promise<ArrayBuffer | null> {
  const db = await openDB();

  return new Promise<ArrayBuffer | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.get("privateKey");

    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

// -----------------------
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);

    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
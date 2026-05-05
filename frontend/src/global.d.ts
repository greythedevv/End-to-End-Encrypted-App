declare global {
  interface Window {
    __PRIVATE_KEY__?: CryptoKey;
  }
}

export {};
# 🔐 WhisperBox

> **End-to-End Encrypted Messaging** — The server never sees your plaintext. Ever.

WhisperBox is a secure real-time messaging application built with React, TypeScript, and the Web Crypto API. All encryption and decryption happens exclusively on the client — the backend stores and forwards only encrypted blobs.

---

## 📋 Table of Contents

- [Live Demo](#live-demo)
- [Architecture Diagram](#architecture-diagram)
- [Encryption Flow](#encryption-flow)
- [Key Management](#key-management)
- [Security Trade-offs](#security-trade-offs)
- [Known Limitations](#known-limitations)
- [Getting Started](#getting-started)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)

---

## 🌐 Live Demo

> **URL:** `https://your-deployment-url.vercel.app`  
> **API:** `https://whisperbox.koyeb.app`

---

## 🏛️ Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                        CLIENT                            │
│                                                          │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────┐ │
│  │   React UI  │───▶│  Web Crypto  │───▶│  IndexedDB  │ │
│  │  (Pages/    │    │     API      │    │ (CryptoKey  │ │
│  │  Components)│    │              │    │  storage)   │ │
│  └──────┬──────┘    └──────┬───────┘    └─────────────┘ │
│         │                  │                             │
│         │    Encrypted     │                             │
│         │    payloads      │                             │
│         ▼                  ▼                             │
│  ┌──────────────────────────────────────────────────┐    │
│  │           HTTP / WebSocket Layer                 │    │
│  │         (Axios + native WebSocket)               │    │
│  └────────────────────┬─────────────────────────────┘    │
└───────────────────────│──────────────────────────────────┘
                        │ HTTPS / WSS only
                        │ (ciphertext only, never plaintext)
                        │
┌───────────────────────▼──────────────────────────────────┐
│                       BACKEND                            │
│                  (WhisperBox API)                        │
│                                                          │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────┐ │
│  │    Auth     │    │   Messages   │    │    Users    │ │
│  │  (JWT/PBKDF2│    │  (encrypted  │    │  (public    │ │
│  │   salts)    │    │   blobs)     │    │   keys)     │ │
│  └─────────────┘    └──────────────┘    └─────────────┘ │
│                                                          │
│         ⚠️  Backend NEVER sees plaintext content         │
└──────────────────────────────────────────────────────────┘
```

### System Responsibilities

| Layer | Responsibility |
|---|---|
| **React UI** | User interaction, rendering, routing, state management |
| **Web Crypto API** | Key generation, wrapping, encryption, decryption |
| **IndexedDB** | Secure in-browser storage of `CryptoKey` objects (non-extractable) |
| **Axios** | REST API calls with JWT bearer tokens, auto-refresh on 401 |
| **WebSocket** | Real-time bidirectional message delivery |
| **Backend (API)** | JWT auth, user identity, public key directory, encrypted blob relay |

---

## 🔑 Encryption Flow

WhisperBox uses a **hybrid encryption scheme**: RSA-OAEP for key exchange and AES-GCM for message content.

### Registration — Key Setup

```
User inputs password
        │
        ▼
┌─────────────────────────────────────────┐
│  1. Generate RSA-OAEP 2048-bit keypair  │  ← Web Crypto API
│     { publicKey, privateKey }           │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  2. Generate random 128-bit PBKDF2 salt │  ← crypto.getRandomValues()
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  3. Derive AES-KW wrapping key          │  ← PBKDF2(password, salt,
│     from password + salt                │      100,000 iterations, SHA-256)
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  4. Wrap private key with AES-KW        │  ← AES-KW(privateKey, wrappingKey)
│     → wrappedPrivateKey (base64)        │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  5. POST /auth/register                 │  ← Sends to server:
│     { publicKey,                        │    - publicKey (plaintext, intended)
│       wrappedPrivateKey,               │    - wrappedPrivateKey (encrypted)
│       pbkdf2Salt }                      │    - salt (for future login)
└─────────────────────────────────────────┘
   ✅ Private key NEVER sent in plaintext
```

### Login — Key Restoration

```
User inputs password
        │
        ▼
POST /auth/login → receives { wrappedPrivateKey, pbkdf2Salt, ... }
        │
        ▼
┌─────────────────────────────────────────┐
│  1. Re-derive AES-KW wrapping key       │  ← Same PBKDF2 parameters
│     from password + stored salt         │
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  2. Unwrap private key                  │  ← AES-KW unwrap
│     → CryptoKey (non-extractable)       │    extractable: false
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  3. Store CryptoKey in IndexedDB        │  ← Never as raw bytes
│     (browser manages secure storage)    │
└─────────────────────────────────────────┘
   ✅ Private key reconstructed in memory only
   ✅ Server salt + wrapped key → useless without the password
```

### Sending a Message

```
Alice writes: "Hello Bob"
        │
        ▼
┌─────────────────────────────────────────────────────┐
│  1. GET /users/{bobId}/public-key                   │
│     → bobPublicKey (RSA-OAEP)                       │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│  2. Generate AES-GCM 256-bit key + 96-bit IV        │  ← Per-message key
│     aesKey = crypto.subtle.generateKey(AES-GCM)     │
│     iv = crypto.getRandomValues(12 bytes)           │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│  3. Encrypt plaintext with AES-GCM                  │
│     ciphertext = AES-GCM(message, aesKey, iv)       │
│     + additionalData = "whisperbox" (AAD)           │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│  4. Encrypt AES key twice (RSA-OAEP):               │
│     encryptedKey        = RSA(aesKey, bobPublicKey) │  ← Bob can decrypt
│     encryptedKeyForSelf = RSA(aesKey, alicePublicKey│  ← Alice can re-read
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│  5. Send via WebSocket (or POST /messages fallback) │
│     payload: { ciphertext, iv,                      │
│                encryptedKey, encryptedKeyForSelf }  │
└─────────────────────────────────────────────────────┘
   ✅ Server receives 4 encrypted blobs, no plaintext
```

### Receiving a Message

```
Bob receives WebSocket event: message.receive
        │
        ▼
┌─────────────────────────────────────────────────────┐
│  payload: { ciphertext, iv,                         │
│             encryptedKey, encryptedKeyForSelf }      │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│  1. Select correct encrypted key                    │
│     isSender? → use encryptedKeyForSelf             │
│     isRecipient? → use encryptedKey                 │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│  2. Decrypt AES key with RSA-OAEP private key       │
│     rawAesKey = RSA-OAEP.decrypt(encryptedKey,      │
│                                  bobPrivateKey)     │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│  3. Import AES-GCM key from raw bytes               │
│     aesKey = importKey("raw", rawAesKey, AES-GCM)   │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│  4. Decrypt ciphertext with AES-GCM                 │
│     plaintext = AES-GCM.decrypt(ciphertext,         │
│                                 aesKey, iv)         │
│     (AAD "whisperbox" verified automatically)       │
└─────────────────────────────────────────────────────┘
   ✅ "Hello Bob" — only Bob's private key could do this
```

---

## 🗝️ Key Management

### Key Lifecycle

| Key | Generated | Stored | Never |
|---|---|---|---|
| **RSA Public Key** | Client, on register | Backend (plaintext — intended) | N/A |
| **RSA Private Key** | Client, on register | IndexedDB as `CryptoKey` object | Sent to server; stored as raw bytes |
| **AES-KW Wrapping Key** | Derived from password | In memory only (during session) | Persisted anywhere |
| **AES-GCM Message Key** | Per message | Never stored | Reused |
| **PBKDF2 Salt** | Client, on register | Backend (plaintext — needed for key derivation) | N/A |

### Why IndexedDB for the Private Key?

- IndexedDB can store `CryptoKey` objects natively — the browser manages the secure handle
- When `extractable: false` is set on `unwrapKey`, the raw key bytes **cannot be exported** even by JavaScript running on the same page
- This is stronger than `localStorage` (which only stores strings, requiring raw bytes exposure)
- The `CryptoKey` object survives page refreshes via IndexedDB but cannot be read by other origins (same-origin policy)

### Password-Based Key Derivation

```
password + salt
     │
     ▼
PBKDF2 (SHA-256, 100,000 iterations)
     │
     ▼
AES-KW 256-bit wrapping key
     │
     ├──▶ wrapKey(privateKey) → wrappedPrivateKey (stored on server)
     │
     └──▶ (derived fresh on every login, never stored)
```

- 100,000 PBKDF2 iterations makes brute-force attacks on the password expensive
- The salt prevents rainbow table attacks
- The server has `wrappedPrivateKey` + `salt` but **cannot derive the wrapping key** without the password

---

## 🛡️ Security Trade-offs

### Decisions Made

| Decision | Why | Trade-off |
|---|---|---|
| **RSA-OAEP 2048-bit** | Wide browser support, proven security | Larger keys than ECDH; no forward secrecy |
| **AES-GCM 256-bit** | Authenticated encryption (integrity + confidentiality) | Requires unique IV per message |
| **AAD `"whisperbox"`** | Binds ciphertext to application context, prevents replay across apps | Static AAD; doesn't bind to message metadata |
| **`encryptedKeyForSelf`** | Sender can read their own sent messages | Doubles RSA encryption cost per message |
| **IndexedDB for private key** | Survives page refresh without re-login | If device is compromised, key is accessible |
| **JWT access tokens (15 min expiry)** | Short-lived reduces stolen token window | Requires refresh token management |
| **PBKDF2 100k iterations** | Slows brute-force on wrapped key | Slightly slower login (~200ms) |

### What the Server Can See

| Data | Visible to Server? |
|---|---|
| Message content | ❌ Never (AES-GCM ciphertext) |
| Who sent to whom | ✅ Yes (routing metadata) |
| When messages were sent | ✅ Yes (timestamps) |
| Public keys | ✅ Yes (intentional — needed for key exchange) |
| Wrapped private key | ✅ Yes (useless without password) |
| PBKDF2 salt | ✅ Yes (needed for login) |

> **Metadata leakage is an inherent trade-off** in any networked messaging system. The server must know routing information to deliver messages.

---

## ⚠️ Known Limitations

### Current Limitations

1. **No Forward Secrecy** — RSA-OAEP is used for key exchange. If a user's private key is ever compromised, all past messages encrypted to that key can be decrypted. A proper implementation would use ephemeral ECDH (Signal Protocol's X3DH) to achieve forward secrecy.

2. **No Message Authentication Beyond Encryption** — Messages are authenticated by AES-GCM's AEAD property, but there's no cryptographic signature binding a message to the sender's identity. A malicious server could (in theory) swap who a message appears to come from.

3. **Metadata Leakage** — The server knows who messages whom and when. Only the content is hidden.

4. **Single Device** — Private keys stored in IndexedDB are device-specific. There's no key sync mechanism across devices. Logging in on a new device generates a new keypair, making old messages unreadable on the new device.

5. **No Key Rotation** — If a private key is suspected compromised, there's no mechanism to rotate keys and re-encrypt existing message history.

6. **Password Change Invalidates Keys** — Changing the password requires re-wrapping the private key. The current implementation doesn't support password changes.

7. **Replay Attack Partial Protection** — AES-GCM with a unique IV prevents bit-flipping but the application doesn't track message IDs to prevent replaying the same encrypted blob. The backend's UUID-based message IDs provide some protection.

8. **Browser Storage Persistence** — IndexedDB can be cleared by the browser (private browsing, storage pressure, user action). Users lose their session and must log in again (key is re-derived from password server material).

### Bonus Features Implemented

- ✅ `encryptedKeyForSelf` — sender can re-read sent messages
- ✅ AES-GCM Additional Authenticated Data (`"whisperbox"`) — ties ciphertext to application context
- ✅ Proactive WebSocket token refresh (4001 reconnect flow)
- ✅ Offline message fallback (`POST /messages`)
- ⬜ Forward secrecy (not implemented — would require ECDH ephemeral keys)
- ⬜ Replay attack prevention via server-side nonce tracking

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
git clone https://github.com/your-username/whisperbox.git
cd whisperbox
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Environment

No `.env` file needed — the API base URL is hardcoded to `https://whisperbox.koyeb.app` (the shared backend).

---

## 🧰 Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript |
| Routing | React Router v6 |
| State Management | Zustand |
| HTTP Client | Axios (with JWT interceptor) |
| WebSocket | Native browser WebSocket API |
| Cryptography | Web Crypto API (browser-native) |
| Storage | IndexedDB (CryptoKey objects) |
| Styling | Tailwind CSS |
| Build Tool | Vite |
| Backend | WhisperBox API (shared, provided) |

---

## 📁 Project Structure

```
src/
├── pages/
│   ├── RegisterPage.tsx      # Key generation + account creation
│   ├── LoginPage.tsx         # Key restoration + session init
│   └── ChatPage.tsx          # Main messaging UI
│
├── components/
│   ├── Conversations.tsx     # Sidebar: conversation list
│   ├── MessageList.tsx       # Chat window with decrypted messages
│   ├── MessageInput.tsx      # Compose + encrypt + send
│   └── UserSearch.tsx        # Search users to start a conversation
│
├── lib/
│   ├── api.ts                # Axios instance, auth token, interceptors
│   ├── auth.ts               # register(), login(), getMe() API wrappers
│   ├── ws.ts                 # WebSocket connect + reconnect logic
│   ├── refresh.ts            # Token refresh (singleton promise)
│   │
│   └── crypto/
│       ├── generateKeys.ts   # RSA keygen, PBKDF2, AES-KW wrap/unwrap
│       ├── encryptMessage.ts # AES-GCM encrypt + RSA key wrapping
│       ├── decryptMessage.ts # RSA key unwrap + AES-GCM decrypt
│       └── keyStorage.ts     # IndexedDB CryptoKey persistence
│
└── store/
    └── useAuth.ts            # Zustand: token, userId, privateKey ref
```

---

## 🔒 Security Checklist

- [x] Private keys never leave the client
- [x] Private keys stored as non-extractable `CryptoKey` objects in IndexedDB
- [x] Password never sent beyond login (PBKDF2 derived locally first)
- [x] AES-GCM provides authenticated encryption (integrity + confidentiality)
- [x] Unique IV generated per message
- [x] RSA-OAEP for asymmetric key exchange
- [x] JWT access tokens expire in 15 minutes
- [x] Refresh token revocation on logout
- [x] HTTPS/WSS only (enforced by API)
- [x] Sender can re-read own messages via `encryptedKeyForSelf`
- [x] Decryption failures handled gracefully (no crashes)
- [x] No sensitive data in `localStorage` (token only; private key in IndexedDB)
- [ ] Forward secrecy (future: ECDH ephemeral keys)
- [ ] Message signing (future: EdDSA sender authentication)

---

## 👥 Team

| Name | Role |
|---|---|
| Your Name | Frontend, Crypto Implementation |

---

*Built for Frontend Wizards — Stage 4B End-to-End Encrypted App Challenge*
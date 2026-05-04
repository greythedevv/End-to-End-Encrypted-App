import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { register } from "../lib/auth";
import {
  generateRSAKeyPair,
  exportPublicKey,
  deriveWrappingKey,
  wrapPrivateKey,
} from "../lib/crypto/generateKeys";

export default function RegisterPage() {
  const [form, setForm] = useState({
    username: "",
    displayName: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const arrayBufferToBase64 = (buffer: ArrayBuffer) =>
    btoa(String.fromCharCode(...new Uint8Array(buffer)));

  const handleRegister = async () => {
    setError(null);

    if (!form.username.trim() || !form.displayName.trim() || !form.password) {
      setError("Please enter username, display name, and password.");
      return;
    }

    try {
      setLoading(true);

      // 🔑 1. Generate RSA key pair
      const { publicKey, privateKey } = await generateRSAKeyPair();

      // 📤 2. Export public key
      const publicKeyBase64 = await exportPublicKey(publicKey);

      // 🔐 3. Create salt for PBKDF2
      const salt = crypto.getRandomValues(new Uint8Array(16));

      // 🔐 4. Derive wrapping key from password + salt
      const wrappingKey = await deriveWrappingKey(
        form.password,
        salt.buffer
      );

      // 🔐 5. Wrap the private key with AES-KW
      const wrappedPrivateKey = await wrapPrivateKey(
        privateKey,
        wrappingKey
      );

      const wrappedPrivateKeyBase64 = arrayBufferToBase64(
        wrappedPrivateKey
      );

      // 🧾 6. Send to WhisperBox API
      const res = await register({
        username: form.username,
        display_name: form.displayName,
        password: form.password,
        public_key: publicKeyBase64,
        wrapped_private_key: wrappedPrivateKeyBase64,
        pbkdf2_salt: btoa(String.fromCharCode(...salt)),
      });

      console.log("User created:", res);
      alert("Account created 🔐");
      navigate("/login");
    } catch (err) {
      console.error(err);
      const message =
        err instanceof Error
          ? err.message
          : "Registration failed. Please try again.";
      setError(message);
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-black via-purple-900 to-black text-white">
      <div className="w-full max-w-md p-8 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20">

        <h1 className="text-3xl font-bold text-center mb-6">
          🔐 WhisperBox
        </h1>

        <div className="space-y-4">

          <input
            className="w-full p-3 rounded bg-black/30 border border-gray-600"
            placeholder="Username"
            onChange={(e) =>
              setForm({ ...form, username: e.target.value })
            }
          />

          <input
            className="w-full p-3 rounded bg-black/30 border border-gray-600"
            placeholder="Display Name"
            onChange={(e) =>
              setForm({ ...form, displayName: e.target.value })
            }
          />

          <input
            type="password"
            className="w-full p-3 rounded bg-black/30 border border-gray-600"
            placeholder="Password"
            onChange={(e) =>
              setForm({ ...form, password: e.target.value })
            }
          />

          {error && (
            <div className="p-3 rounded bg-red-900/20 text-sm text-red-100">
              {error}
            </div>
          )}

          <button
            onClick={handleRegister}
            disabled={loading}
            className="w-full p-3 bg-purple-600 hover:bg-purple-700 rounded font-semibold"
          >
            {loading ? "Creating..." : "Create Account"}
          </button>

          <div className="text-center text-sm text-gray-300">
            Already have an account? <Link to="/login" className="text-purple-300 hover:underline">Login</Link>
          </div>
        </div>

        <p className="text-xs text-center text-gray-400 mt-6">
          End-to-end encrypted system 🔐
        </p>
      </div>
    </div>
  );
}
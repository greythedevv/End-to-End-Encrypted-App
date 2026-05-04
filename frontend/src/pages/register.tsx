import { useState } from "react";
import { register } from "../lib/auth";
import { generateRSAKeyPair, exportPublicKey } from "../lib/crypto/generateKeys";

export default function RegisterPage() {
  const [form, setForm] = useState({
    username: "",
    displayName: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    try {
      setLoading(true);

      // 🔑 1. Generate RSA key pair
      const { publicKey, privateKey } = await generateRSAKeyPair();

      // 📤 2. Export public key
      const publicKeyBase64 = await exportPublicKey(publicKey);

      // 🔐 3. Create salt (for backend encryption flow)
      const salt = crypto.getRandomValues(new Uint8Array(16));

      // 🧾 4. Send to WhisperBox API
      const res = await register({
        username: form.username,
        display_name: form.displayName,
        password: form.password,
        public_key: publicKeyBase64,
        wrapped_private_key: "", // backend expects it, but real wrapping is done in login flow spec
        pbkdf2_salt: btoa(String.fromCharCode(...salt)),
      });

      console.log("User created:", res);

      alert("Account created 🔐");
    } catch (err) {
      console.error(err);
      alert("Registration failed");
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

          <button
            onClick={handleRegister}
            disabled={loading}
            className="w-full p-3 bg-purple-600 hover:bg-purple-700 rounded font-semibold"
          >
            {loading ? "Creating..." : "Create Account"}
          </button>
        </div>

        <p className="text-xs text-center text-gray-400 mt-6">
          End-to-end encrypted system 🔐
        </p>
      </div>
    </div>
  );
}
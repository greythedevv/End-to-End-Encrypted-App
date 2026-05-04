import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { login } from "../lib/auth";
import { deriveWrappingKey, unwrapPrivateKey } from "../lib/crypto/generateKeys";
import { setAuthToken } from "../lib/api";

export default function Login() {
  const [form, setForm] = useState({
    username: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const base64ToBuf = (b64: string): ArrayBuffer => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  };

  const isAesKwInputLengthError = (error: unknown) => {
    return (
      error instanceof Error &&
      /AES-KW.*not a multiple of 8 bytes|input data length is invalid/i.test(
        error.message
      )
    );
  };

  const handleLogin = async () => {
    setError(null);
    try {
      setLoading(true);

      // 🔐 1. Login via API layer
      const data = await login(form.username, form.password);

      const user = data.user;

      // 🔑 2. Get encrypted key material
      const wrappedKey = base64ToBuf(user.wrapped_private_key);
      const salt = base64ToBuf(user.pbkdf2_salt);

      // 🧠 3. Derive AES-KW key (from lib crypto)
      const wrappingKey = await deriveWrappingKey(form.password, salt);

      // 🔓 4. Unwrap private key (from lib crypto)
      const privateKey = await unwrapPrivateKey(
        wrappedKey,
        wrappingKey
      );

      // 💾 5. Store session
      setAuthToken(data.access_token);
      localStorage.setItem("token", data.access_token);
      (window as any).__PRIVATE_KEY__ = privateKey;

      alert("Login successful 🔐");
      navigate("/chat");
    } catch (err) {
      console.error(err);

      let message =
        err instanceof Error ? err.message : "Login failed. Please try again.";

      if (isAesKwInputLengthError(err)) {
        message =
          "Unable to restore your private key. Check your password and try again.";
      }

      setError(message);
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="w-96 p-6 bg-white/10 rounded-xl space-y-4">

        <h1 className="text-xl font-bold text-center">Login</h1>

        <input
          className="w-full p-2 bg-black/40 rounded"
          placeholder="Username"
          value={form.username}
          onChange={(e) =>
            setForm({ ...form, username: e.target.value })
          }
        />

        <input
          type="password"
          className="w-full p-2 bg-black/40 rounded"
          placeholder="Password"
          value={form.password}
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
          onClick={handleLogin}
          className="w-full p-2 bg-purple-600 rounded"
        >
          {loading ? "Loading..." : "Login"}
        </button>

        <div className="text-center text-sm text-gray-300">
          Don't have an account? <Link to="/" className="text-purple-300 hover:underline">Register</Link>
        </div>
      </div>
    </div>
  );
}
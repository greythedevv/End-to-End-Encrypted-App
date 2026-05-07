// src/pages/LoginPage.tsx
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { login } from "../lib/auth";
import {
  deriveWrappingKey,
  unwrapPrivateKey,
  base64ToBuf,
} from "../lib/crypto/generateKeys";
import { setAuthToken } from "../lib/api";
import { savePrivateKey } from "../lib/crypto/keyStorage";
import { useAuth } from "../store/useAuth";

export default function LoginPage() {
  const [form, setForm] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { setSession } = useAuth();

  const handleLogin = async () => {
    setError(null);
    if (!form.username.trim() || !form.password) {
      setError("Please enter your username and password.");
      return;
    }

    try {
      setLoading(true);

      const data = await login(form.username, form.password);
      const user = data.user;

      const wrappedKeyBytes = base64ToBuf(user.wrapped_private_key);
      const saltBytes = base64ToBuf(user.pbkdf2_salt);

      const wrappingKey = await deriveWrappingKey(form.password, saltBytes);
      const privateKey = await unwrapPrivateKey(wrappedKeyBytes.buffer, wrappingKey);

      // Save private key to IndexedDB — the ONLY place it lives
      await savePrivateKey(privateKey);

      setAuthToken(data.access_token);

      // ✅ sessionStorage instead of localStorage
      sessionStorage.setItem("token", data.access_token);
      sessionStorage.setItem("refreshToken", data.refresh_token);
      sessionStorage.setItem("userId", user.id);

      setSession({
        token: data.access_token,
        refreshToken: data.refresh_token,
        userId: user.id,
        privateKey,
      });

      navigate("/chat");
    } catch (err) {
      console.error(err);
      let message = "Login failed. Please try again.";
      if (err instanceof Error) {
        if (/AES-KW|not a multiple of 8|input data length is invalid/i.test(err.message)) {
          message = "Wrong password — could not restore your private key.";
        } else if (/401|wrong credentials|unauthorized/i.test(err.message)) {
          message = "Incorrect username or password.";
        } else if (/network|failed to fetch|no response/i.test(err.message)) {
          message = "Network error. Check your connection and try again.";
        } else {
          message = err.message;
        }
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleLogin();
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Syne:wght@700;800&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg-deep:    #0a0b0f;
          --bg-panel:   #0f1117;
          --bg-card:    #151821;
          --bg-hover:   #1c2030;
          --bg-input:   #1a1f2e;
          --border:     #1e2436;
          --border-lit: #2a3250;
          --accent:     #4f8ef7;
          --accent-dim: #2a4a8a;
          --accent-glow:#4f8ef720;
          --green:      #34d399;
          --text-1:     #eef0f7;
          --text-2:     #7b82a0;
          --text-3:     #3d4460;
          --danger:     #f87171;
          --danger-dim: #f8717118;
          --font-body:  'DM Sans', sans-serif;
          --font-head:  'Syne', sans-serif;
        }

        .auth-root {
          min-height: 100vh; width: 100vw; background: var(--bg-deep);
          font-family: var(--font-body); color: var(--text-1);
          display: flex; align-items: center; justify-content: center;
          position: relative; overflow: hidden;
        }

        .auth-root::before {
          content: ''; position: absolute; top: -200px; left: 50%;
          transform: translateX(-50%); width: 600px; height: 600px;
          background: radial-gradient(circle, #4f8ef712 0%, transparent 70%);
          pointer-events: none;
        }

        .auth-root::after {
          content: ''; position: absolute; bottom: -200px; right: -100px;
          width: 400px; height: 400px;
          background: radial-gradient(circle, #8b5cf608 0%, transparent 70%);
          pointer-events: none;
        }

        .auth-grid {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(var(--border) 1px, transparent 1px),
            linear-gradient(90deg, var(--border) 1px, transparent 1px);
          background-size: 40px 40px; opacity: 0.3; pointer-events: none;
        }

        .auth-card {
          position: relative; z-index: 1; width: 100%; max-width: 400px;
          margin: 24px; background: var(--bg-panel); border: 1px solid var(--border);
          border-radius: 20px; padding: 40px 36px;
          box-shadow: 0 32px 80px #00000060, 0 0 0 1px #ffffff06 inset;
          animation: cardIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        @keyframes cardIn {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        .auth-logo { display: flex; align-items: center; gap: 10px; margin-bottom: 32px; }

        .auth-logo-icon {
          width: 36px; height: 36px;
          background: linear-gradient(135deg, var(--accent), #8b5cf6);
          border-radius: 10px; display: flex; align-items: center;
          justify-content: center; font-size: 17px;
          box-shadow: 0 4px 16px #4f8ef730;
        }

        .auth-logo-text {
          font-family: var(--font-head); font-size: 20px;
          font-weight: 800; letter-spacing: -0.5px; color: var(--text-1);
        }

        .auth-title {
          font-family: var(--font-head); font-size: 26px;
          font-weight: 800; letter-spacing: -0.5px;
          color: var(--text-1); margin-bottom: 6px;
        }

        .auth-subtitle { font-size: 13px; color: var(--text-2); margin-bottom: 28px; line-height: 1.5; }

        .field { margin-bottom: 14px; }

        .field-label {
          font-size: 11px; font-weight: 600; letter-spacing: 0.08em;
          text-transform: uppercase; color: var(--text-3); margin-bottom: 7px;
        }

        .field-wrap { position: relative; }

        .field-input {
          width: 100%; background: var(--bg-input); border: 1px solid var(--border);
          border-radius: 11px; padding: 12px 14px; color: var(--text-1);
          font-size: 14px; font-family: var(--font-body); outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .field-input::placeholder { color: var(--text-3); }

        .field-input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-glow);
        }

        .field-input.has-toggle { padding-right: 44px; }

        .toggle-pw {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          background: none; border: none; color: var(--text-3); cursor: pointer;
          padding: 4px; display: flex; align-items: center; transition: color 0.2s;
        }

        .toggle-pw:hover { color: var(--text-2); }

        .error-box {
          background: var(--danger-dim); border: 1px solid #f8717130;
          border-radius: 10px; padding: 11px 14px; font-size: 13px;
          color: var(--danger); margin-bottom: 14px;
          display: flex; align-items: flex-start; gap: 8px;
          animation: shake 0.3s ease;
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25%       { transform: translateX(-4px); }
          75%       { transform: translateX(4px); }
        }

        .submit-btn {
          width: 100%; padding: 13px; background: var(--accent); border: none;
          border-radius: 11px; color: white; font-family: var(--font-body);
          font-size: 14px; font-weight: 600; cursor: pointer;
          transition: background 0.2s, transform 0.1s, box-shadow 0.2s, opacity 0.2s;
          margin-top: 6px; box-shadow: 0 4px 16px #4f8ef730;
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }

        .submit-btn:hover:not(:disabled) {
          background: #6ba3ff; box-shadow: 0 6px 24px #4f8ef740; transform: translateY(-1px);
        }

        .submit-btn:active:not(:disabled) { transform: translateY(0); }
        .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .spinner {
          width: 15px; height: 15px; border: 2px solid #ffffff40;
          border-top-color: white; border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .auth-divider { display: flex; align-items: center; gap: 12px; margin: 20px 0; }
        .auth-divider-line { flex: 1; height: 1px; background: var(--border); }
        .auth-divider-text { font-size: 12px; color: var(--text-3); }

        .auth-link-row { text-align: center; font-size: 13px; color: var(--text-2); }

        .auth-link { color: var(--accent); text-decoration: none; font-weight: 500; transition: color 0.2s; }
        .auth-link:hover { color: #6ba3ff; }

        .enc-notice {
          display: flex; align-items: center; justify-content: center;
          gap: 6px; margin-top: 24px; font-size: 11px; color: var(--text-3);
        }
      `}</style>

      <div className="auth-root" onKeyDown={handleKeyDown}>
        <div className="auth-grid" />

        <div className="auth-card">
          <div className="auth-logo">
            <div className="auth-logo-icon">🔐</div>
            <div className="auth-logo-text">WhisperBox</div>
          </div>

          <div className="auth-title">Welcome back</div>
          <div className="auth-subtitle">
            Sign in to continue your encrypted conversations.
          </div>

          <div className="field">
            <div className="field-label">Username</div>
            <div className="field-wrap">
              <input
                className="field-input"
                placeholder="your_username"
                value={form.username}
                autoComplete="username"
                autoFocus
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </div>
          </div>

          <div className="field">
            <div className="field-label">Password</div>
            <div className="field-wrap">
              <input
                className="field-input has-toggle"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={form.password}
                autoComplete="current-password"
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <button className="toggle-pw" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>
                {showPassword
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
          </div>

          {error && (
            <div className="error-box">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{flexShrink:0, marginTop:1}}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          <button className="submit-btn" onClick={handleLogin} disabled={loading}>
            {loading ? <><div className="spinner" /> Unlocking vault...</> : "Sign In"}
          </button>

          <div className="auth-divider">
            <div className="auth-divider-line" />
            <div className="auth-divider-text">or</div>
            <div className="auth-divider-line" />
          </div>

          <div className="auth-link-row">
            Don't have an account?{" "}
            <Link to="/" className="auth-link">Create one</Link>
          </div>

          <div className="enc-notice">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            Your keys never leave this device
          </div>
        </div>
      </div>
    </>
  );
}

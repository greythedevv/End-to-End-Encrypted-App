// src/pages/RegisterPage.tsx
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { register } from "../lib/auth";

function buf2b64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// AES-GCM replaces AES-KW — no block-size requirement, works on any pkcs8 length
async function doRegisterCrypto(password: string) {
  // 1. Generate RSA-OAEP keypair
  const keypair = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["encrypt", "decrypt"]
  );

  // 2. Export public key
  const pubBuf = await crypto.subtle.exportKey("spki", keypair.publicKey);
  const publicKeyBase64 = buf2b64(pubBuf);

  // 3. Export private key as pkcs8 bytes (Chrome outputs 1216–1219 bytes — any length is fine with AES-GCM)
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", keypair.privateKey);

  // 4. Generate salt
  const saltBuf = new ArrayBuffer(16);
  crypto.getRandomValues(new Uint8Array(saltBuf));

  // 5. Derive AES-GCM key from password + salt via PBKDF2
  const pwKey = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]
  );
  const wrappingKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: new Uint8Array(saltBuf), iterations: 100_000, hash: "SHA-256" },
    pwKey,
    { name: "AES-GCM", length: 256 }, // ✅ no block-size constraint
    false,
    ["encrypt", "decrypt"]
  );

  // 6. Encrypt pkcs8 with AES-GCM (random 12-byte IV)
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrappingKey, pkcs8);

  // 7. Pack: [12 bytes IV] + [ciphertext]
  const wrappedBuf = new ArrayBuffer(12 + ciphertext.byteLength);
  new Uint8Array(wrappedBuf).set(iv, 0);
  new Uint8Array(wrappedBuf).set(new Uint8Array(ciphertext), 12);

  return {
    publicKeyBase64,
    wrappedBase64: buf2b64(wrappedBuf),
    saltBase64: buf2b64(saltBuf),
  };
}

export default function RegisterPage() {
  const [form, setForm] = useState({ username: "", displayName: "", password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<"idle" | "keys" | "sending">("idle");
  const navigate = useNavigate();

  const handleRegister = async () => {
    setError(null);
    if (!form.username.trim() || !form.displayName.trim() || !form.password) { setError("Please fill in all fields."); return; }
    if (form.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (form.password !== form.confirmPassword) { setError("Passwords do not match."); return; }
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(form.username)) { setError("Username: 3–32 chars, letters/digits/_ only."); return; }

    try {
      setLoading(true);
      setStep("keys");
      const { publicKeyBase64, wrappedBase64, saltBase64 } = await doRegisterCrypto(form.password);
      setStep("sending");
      await register({
        username: form.username, display_name: form.displayName, password: form.password,
        public_key: publicKeyBase64, wrapped_private_key: wrappedBase64, pbkdf2_salt: saltBase64,
      });
      navigate("/login");
    } catch (err) {
      console.error(err);
      let message = "Registration failed. Please try again.";
      if (err instanceof Error) {
        if (/409|username.*taken|already exists/i.test(err.message)) message = "Username already taken.";
        else if (/422/i.test(err.message)) message = "Invalid input. Check your username.";
        else message = err.message;
      }
      setError(message);
    } finally {
      setLoading(false);
      setStep("idle");
    }
  };

  const stepLabel = { idle: "Create Account", keys: "Generating & encrypting keys…", sending: "Creating account…" }[step];

  const passwordStrength = (() => {
    const p = form.password;
    if (!p) return null;
    let s = 0;
    if (p.length >= 8) s++; if (p.length >= 12) s++;
    if (/[A-Z]/.test(p)) s++; if (/[0-9]/.test(p)) s++; if (/[^a-zA-Z0-9]/.test(p)) s++;
    if (s <= 1) return { label: "Weak",   color: "#f87171", width: "20%"  };
    if (s <= 2) return { label: "Fair",   color: "#fbbf24", width: "45%"  };
    if (s <= 3) return { label: "Good",   color: "#60a5fa", width: "70%"  };
    return             { label: "Strong", color: "#34d399", width: "100%" };
  })();

  const EyeOpen = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
  const EyeOff = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Syne:wght@700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        :root{
          --bg-deep:#0a0b0f;--bg-panel:#0f1117;--bg-input:#1a1f2e;
          --border:#1e2436;--accent:#4f8ef7;--accent-dim:#2a4a8a;--accent-glow:#4f8ef720;
          --green:#34d399;--text-1:#eef0f7;--text-2:#7b82a0;--text-3:#3d4460;
          --danger:#f87171;--danger-dim:#f8717118;
          --font-body:'DM Sans',sans-serif;--font-head:'Syne',sans-serif;
        }
        .auth-root{min-height:100vh;width:100vw;background:var(--bg-deep);font-family:var(--font-body);color:var(--text-1);display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;padding:24px 0;}
        .auth-root::before{content:'';position:absolute;top:-200px;left:50%;transform:translateX(-50%);width:600px;height:600px;background:radial-gradient(circle,#4f8ef712 0%,transparent 70%);pointer-events:none;}
        .auth-root::after{content:'';position:absolute;bottom:-200px;right:-100px;width:400px;height:400px;background:radial-gradient(circle,#8b5cf608 0%,transparent 70%);pointer-events:none;}
        .auth-grid{position:absolute;inset:0;opacity:0.3;pointer-events:none;background-image:linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(90deg,var(--border) 1px,transparent 1px);background-size:40px 40px;}
        .auth-card{position:relative;z-index:1;width:100%;max-width:420px;margin:24px;background:var(--bg-panel);border:1px solid var(--border);border-radius:20px;padding:40px 36px;box-shadow:0 32px 80px #00000060,0 0 0 1px #ffffff06 inset;animation:cardIn 0.5s cubic-bezier(0.16,1,0.3,1) both;}
        @keyframes cardIn{from{opacity:0;transform:translateY(24px) scale(0.97)}to{opacity:1;transform:none}}
        .auth-logo{display:flex;align-items:center;gap:10px;margin-bottom:28px}
        .auth-logo-icon{width:36px;height:36px;border-radius:10px;font-size:17px;background:linear-gradient(135deg,var(--accent),#8b5cf6);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px #4f8ef730;}
        .auth-logo-text{font-family:var(--font-head);font-size:20px;font-weight:800;letter-spacing:-0.5px}
        .auth-title{font-family:var(--font-head);font-size:26px;font-weight:800;letter-spacing:-0.5px;margin-bottom:6px}
        .auth-subtitle{font-size:13px;color:var(--text-2);margin-bottom:24px;line-height:1.5}
        .e2ee-callout{background:#34d39908;border:1px solid #34d39920;border-radius:10px;padding:12px 14px;margin-bottom:20px;display:flex;gap:10px;align-items:flex-start;}
        .e2ee-callout-text{font-size:12px;color:var(--text-2);line-height:1.6}
        .e2ee-callout-text strong{color:var(--green);font-weight:600}
        .field{margin-bottom:14px}
        .field-label{font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-3);margin-bottom:7px}
        .field-wrap{position:relative}
        .field-input{width:100%;background:var(--bg-input);border:1px solid var(--border);border-radius:11px;padding:12px 14px;color:var(--text-1);font-size:14px;font-family:var(--font-body);outline:none;transition:border-color 0.2s,box-shadow 0.2s;}
        .field-input::placeholder{color:var(--text-3)}
        .field-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-glow)}
        .field-input.has-toggle{padding-right:44px}
        .toggle-pw{position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-3);cursor:pointer;padding:4px;display:flex;align-items:center;transition:color 0.2s;}
        .toggle-pw:hover{color:var(--text-2)}
        .pw-strength{margin-top:8px;display:flex;align-items:center;gap:10px}
        .pw-bar-track{flex:1;height:3px;background:var(--border);border-radius:2px;overflow:hidden}
        .pw-bar-fill{height:100%;border-radius:2px;transition:width 0.3s ease,background 0.3s ease}
        .pw-label{font-size:11px;font-weight:500;min-width:40px;text-align:right}
        .step-indicator{display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--accent-glow);border:1px solid #4f8ef730;border-radius:10px;margin-bottom:14px;font-size:13px;color:var(--accent);animation:pulse 1.5s ease-in-out infinite;}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.7}}
        .error-box{background:var(--danger-dim);border:1px solid #f8717130;border-radius:10px;padding:11px 14px;font-size:13px;color:var(--danger);margin-bottom:14px;display:flex;align-items:flex-start;gap:8px;animation:shake 0.3s ease;}
        @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
        .submit-btn{width:100%;padding:13px;background:var(--accent);border:none;border-radius:11px;color:white;font-family:var(--font-body);font-size:14px;font-weight:600;cursor:pointer;margin-top:6px;box-shadow:0 4px 16px #4f8ef730;display:flex;align-items:center;justify-content:center;gap:8px;transition:background 0.2s,transform 0.1s,box-shadow 0.2s,opacity 0.2s;}
        .submit-btn:hover:not(:disabled){background:#6ba3ff;box-shadow:0 6px 24px #4f8ef740;transform:translateY(-1px)}
        .submit-btn:active:not(:disabled){transform:translateY(0)}
        .submit-btn:disabled{opacity:0.5;cursor:not-allowed}
        .spinner{width:15px;height:15px;border:2px solid #ffffff40;border-top-color:white;border-radius:50%;animation:spin 0.7s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}
        .auth-divider{display:flex;align-items:center;gap:12px;margin:20px 0}
        .auth-divider-line{flex:1;height:1px;background:var(--border)}
        .auth-divider-text{font-size:12px;color:var(--text-3)}
        .auth-link-row{text-align:center;font-size:13px;color:var(--text-2)}
        .auth-link{color:var(--accent);text-decoration:none;font-weight:500;transition:color 0.2s}
        .auth-link:hover{color:#6ba3ff}
        .enc-notice{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:24px;font-size:11px;color:var(--text-3)}
      `}</style>

      <div className="auth-root" onKeyDown={(e) => e.key === "Enter" && handleRegister()}>
        <div className="auth-grid" />
        <div className="auth-card">
          <div className="auth-logo">
            <div className="auth-logo-icon">🔐</div>
            <div className="auth-logo-text">WhisperBox</div>
          </div>
          <div className="auth-title">Create account</div>
          <div className="auth-subtitle">Your keys are generated locally. The server never sees your messages.</div>

          <div className="e2ee-callout">
            <span style={{fontSize:16,flexShrink:0,marginTop:1}}>🔑</span>
            <div className="e2ee-callout-text">
              <strong>End-to-end encrypted.</strong> An RSA keypair is generated in your browser. Your private key is encrypted with AES-GCM and your password — it never leaves this device in plaintext.
            </div>
          </div>

          <div className="field">
            <div className="field-label">Username</div>
            <input className="field-input" placeholder="your_username" value={form.username} autoComplete="username" autoFocus onChange={(e) => setForm({...form, username: e.target.value})} />
          </div>

          <div className="field">
            <div className="field-label">Display Name</div>
            <input className="field-input" placeholder="Your Name" value={form.displayName} autoComplete="name" onChange={(e) => setForm({...form, displayName: e.target.value})} />
          </div>

          <div className="field">
            <div className="field-label">Password</div>
            <div className="field-wrap">
              <input className="field-input has-toggle" type={showPassword ? "text" : "password"} placeholder="••••••••" value={form.password} autoComplete="new-password" onChange={(e) => setForm({...form, password: e.target.value})} />
              <button className="toggle-pw" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}>{showPassword ? <EyeOff /> : <EyeOpen />}</button>
            </div>
            {passwordStrength && (
              <div className="pw-strength">
                <div className="pw-bar-track"><div className="pw-bar-fill" style={{width: passwordStrength.width, background: passwordStrength.color}} /></div>
                <div className="pw-label" style={{color: passwordStrength.color}}>{passwordStrength.label}</div>
              </div>
            )}
          </div>

          <div className="field">
            <div className="field-label">Confirm Password</div>
            <input className="field-input" type={showPassword ? "text" : "password"} placeholder="••••••••" value={form.confirmPassword} autoComplete="new-password"
              style={{borderColor: form.confirmPassword && form.confirmPassword !== form.password ? "#f8717160" : form.confirmPassword && form.confirmPassword === form.password ? "#34d39960" : undefined}}
              onChange={(e) => setForm({...form, confirmPassword: e.target.value})} />
          </div>

          {loading && step !== "idle" && (
            <div className="step-indicator">
              <div className="spinner" style={{borderTopColor:"var(--accent)",borderColor:"var(--accent-dim)"}} />
              {stepLabel}
            </div>
          )}

          {error && (
            <div className="error-box">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{flexShrink:0,marginTop:1}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}

          <button className="submit-btn" onClick={handleRegister} disabled={loading}>
            {loading ? <><div className="spinner"/>{stepLabel}</> : "Create Account"}
          </button>

          <div className="auth-divider">
            <div className="auth-divider-line"/><div className="auth-divider-text">or</div><div className="auth-divider-line"/>
          </div>
          <div className="auth-link-row">Already have an account? <Link to="/login" className="auth-link">Sign in</Link></div>
          <div className="enc-notice">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            Keys generated locally · Server stores only ciphertext
          </div>
        </div>
      </div>
    </>
  );
}
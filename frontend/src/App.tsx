// src/App.tsx
import { useEffect } from "react";
import {  Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./store/useAuth";
import { setAuthToken } from "./lib/api";
import LoginPage from "./pages/login";
import RegisterPage from "./pages/register";
import ChatPage from "./pages/Chat";

export default function App() {
  const { token, privateKey, loadPrivateKey } = useAuth();

  useEffect(() => {
    // Restore auth token into axios on every page load
    if (token) setAuthToken(token);

    // ✅ KEY FIX: Load private key from IndexedDB on every page load/refresh
    // This covers the case where the page was refreshed and
    // window.__PRIVATE_KEY__ was lost (the old broken approach)
    if (!privateKey) {
      loadPrivateKey();
    }
  }, []);

  return (
    <Routes>
      <Route path="/" element={<RegisterPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/chat"
        element={token ? <ChatPage /> : <Navigate to="/login" replace />}
      />
    </Routes>
  );
}



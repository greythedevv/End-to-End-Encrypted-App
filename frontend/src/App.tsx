import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import ChatPage from "./pages/Chat";
import LoginPage from "./pages/login";
import RegisterPage from "./pages/register";
import { useAuth } from "./store/useAuth";
import { getPrivateKey } from "./lib/crypto/keyStorage";
import { setAuthToken } from "./lib/api";

const App = () => {
  const { token, privateKey } = useAuth();

  useEffect(() => {
    if (!token) return;

    setAuthToken(token);

    if (privateKey) return;

    getPrivateKey()
      .then((key) => {
        if (key) {
          window.__PRIVATE_KEY__ = key;
          useAuth.setState({ privateKey: key });
        }
      })
      .catch((err) => {
        console.error("Failed to restore private key from IndexedDB:", err);
      });
  }, [token, privateKey]);

  return (
    <div>
      <Routes>
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RegisterPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
};

export default App

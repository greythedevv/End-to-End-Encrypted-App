import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { encryptMessage } from "../lib/crypto/encryptMessage";
import { decryptMessage } from "../lib/crypto/decryptMessage";
import { connectWS } from "../lib/ws";
import { useNavigate } from "react-router-dom";

export default function ChatPage() {
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [isSending, setIsSending] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  const token = localStorage.getItem("token");
  const currentUserId = localStorage.getItem("userId");
  const privateKey = (window as any).__PRIVATE_KEY__;

  const wsRef = useRef<WebSocket | null>(null);
  const navigate = useNavigate();

  // -------------------------
  // GET RECIPIENT PUBLIC KEY
  // -------------------------
  const getRecipientKey = async () => {
    const res = await api.get(`/users/${recipientId}/public-key`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const raw = Uint8Array.from(
      atob(res.data.public_key),
      (c) => c.charCodeAt(0)
    );

    return crypto.subtle.importKey(
      "spki",
      raw,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["encrypt"]
    );
  };

  // -------------------------
  // GET MY PUBLIC KEY (for self encryption)
  // -------------------------
  const getMyPublicKey = async () => {
    const res = await api.get("/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });

    const raw = Uint8Array.from(
      atob(res.data.public_key),
      (c) => c.charCodeAt(0)
    );

    return crypto.subtle.importKey(
      "spki",
      raw,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["encrypt"]
    );
  };

  // -------------------------
  // SEND MESSAGE
  // -------------------------
  const sendMessage = async () => {
    if (!text.trim() || !recipientId) return;

    setIsSending(true);
    setError(null);

    try {
      const recipientKey = await getRecipientKey();
      const myKey = await getMyPublicKey();

      const encrypted = await encryptMessage(
        text,
        recipientKey,
        myKey
      );

      // Prefer WS
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            event: "message.send",
            to: recipientId,
            payload: encrypted,
          })
        );
      } else {
        // fallback HTTP
        await api.post(
          "/messages",
          { to: recipientId, payload: encrypted },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }

      setText("");
    } catch (err) {
      console.error(err);
      setError("Failed to send message");
    } finally {
      setIsSending(false);
    }
  };

  // -------------------------
  // LOAD MESSAGES
  // -------------------------
  const loadMessages = async () => {
    if (!recipientId || !privateKey) return;

    setIsLoadingMessages(true);

    try {
      const res = await api.get(
        `/conversations/${recipientId}/messages`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const decrypted = await Promise.all(
        res.data.map(async (m: any) => {
          const text = await decryptMessage(
            m.payload,
            privateKey
          );

          return { ...m, text };
        })
      );

      setMessages(decrypted.reverse());
    } catch (err) {
      console.error(err);
      setError("Failed to load messages");
    } finally {
      setIsLoadingMessages(false);
    }
  };

  // -------------------------
  // WEBSOCKET SETUP
  // -------------------------
  useEffect(() => {
    if (!token || !privateKey) return;

    const ws = connectWS(token);
    wsRef.current = ws;

    ws.onopen = () => console.log("🟢 WS connected");

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      if (data.event === "message.receive") {
        const text = await decryptMessage(
          data.payload,
          privateKey
        );

        setMessages((prev) => [
          ...prev,
          { ...data, text },
        ]);
      }
    };

    ws.onclose = (e) => {
      console.log("🔴 WS closed", e.code);

      if (e.code === 4001) {
        alert("Session expired. Please login again.");
        navigate("/login");
      }

      if (e.code === 4003) {
        navigate("/login");
      }
    };

    ws.onerror = (err) => console.error("WS error", err);

    return () => ws.close();
  }, [token, privateKey]);

  // -------------------------
  // LOAD ON RECIPIENT CHANGE
  // -------------------------
  useEffect(() => {
    if (recipientId) loadMessages();
  }, [recipientId]);

  // -------------------------
  // UI
  // -------------------------
  return (
    <div className="h-screen flex flex-col bg-black text-white">

      <div className="p-4 border-b border-gray-700">
        <input
          className="p-2 bg-gray-800 rounded w-full"
          placeholder="Recipient ID"
          value={recipientId}
          onChange={(e) => setRecipientId(e.target.value)}
        />
      </div>

      {error && (
        <div className="m-4 p-3 bg-red-900/20 text-red-200">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {isLoadingMessages ? (
          <div>Loading...</div>
        ) : messages.length ? (
          messages.map((m, i) => (
            <div
              key={i}
              className={`p-2 rounded ${
                m.from_user_id === currentUserId
                  ? "bg-purple-600 ml-auto"
                  : "bg-gray-700"
              }`}
            >
              {m.text}
            </div>
          ))
        ) : (
          <div>No messages</div>
        )}
      </div>

      <div className="p-4 flex gap-2 border-t border-gray-700">
        <input
          className="flex-1 p-2 bg-gray-800 rounded"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={isSending}
        />

        <button
          onClick={sendMessage}
          disabled={isSending}
          className="px-4 bg-purple-600 rounded"
        >
          Send
        </button>
      </div>
    </div>
  );
}
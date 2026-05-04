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

  const token = localStorage.getItem("token");
  const currentUserId = localStorage.getItem("userId");
  const privateKey = (window as any).__PRIVATE_KEY__;

  const wsRef = useRef<WebSocket | null>(null);
  const navigate = useNavigate();

  // -------------------------
  // GET PUBLIC KEYS
  // -------------------------
  const getRecipientKey = async () => {
    const res = await api.get(`/users/${recipientId}/public-key`);
    const raw = Uint8Array.from(atob(res.data.public_key), c => c.charCodeAt(0));

    return crypto.subtle.importKey(
      "spki",
      raw,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["encrypt"]
    );
  };

  const getMyPublicKey = async () => {
    const res = await api.get("/auth/me");
    const raw = Uint8Array.from(atob(res.data.public_key), c => c.charCodeAt(0));

    return crypto.subtle.importKey(
      "spki",
      raw,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["encrypt"]
    );
  };

  // -------------------------
  // SEND
  // -------------------------
  const sendMessage = async () => {
    if (!text || !recipientId) return;

    const recipientKey = await getRecipientKey();
    const myKey = await getMyPublicKey();

    const payload = await encryptMessage(text, recipientKey, myKey);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        event: "message.send",
        to: recipientId,
        payload
      }));
    } else {
      await api.post("/messages", { to: recipientId, payload });
    }

    setText("");
  };

  // -------------------------
  // LOAD MESSAGES
  // -------------------------
  const loadMessages = async () => {
    const res = await api.get(`/conversations/${recipientId}/messages`);

    const decrypted = await Promise.all(
      res.data.map(async (m: any) => {
        const isSender = m.from_user_id === currentUserId;

        const text = await decryptMessage(
          m.payload,
          privateKey,
          isSender
        );

        return { ...m, text };
      })
    );

    setMessages(decrypted.reverse());
  };

  // -------------------------
  // WEBSOCKET
  // -------------------------
  useEffect(() => {
    if (!token) return;

    const ws = connectWS(token);
    wsRef.current = ws;

    ws.onmessage = async (e) => {
      const data = JSON.parse(e.data);

      if (data.event === "message.receive") {
        const isSender = data.from_user_id === currentUserId;

        const text = await decryptMessage(
          data.payload,
          privateKey,
          isSender
        );

        setMessages(prev => [...prev, { ...data, text }]);
      }
    };

    ws.onclose = (e) => {
      if (e.code === 4001 || e.code === 4003) {
        navigate("/login");
      }
    };

    return () => ws.close();
  }, [token]);

  useEffect(() => {
    if (recipientId) loadMessages();
  }, [recipientId]);

  // -------------------------
  // UI
  // -------------------------
  return (
    <div className="h-screen flex flex-col bg-black text-white">

      <input
        value={recipientId}
        onChange={(e) => setRecipientId(e.target.value)}
        placeholder="Recipient ID"
        className="p-2"
      />

      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={m.from_user_id === currentUserId
              ? "text-right"
              : "text-left"}
          >
            {m.text}
          </div>
        ))}
      </div>

      <div className="flex">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1"
        />
        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
}
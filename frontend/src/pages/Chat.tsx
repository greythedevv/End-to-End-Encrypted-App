// src/pages/ChatPage.tsx
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../store/useAuth";
import { connectWS, getWS } from "../lib/ws";
import { decryptMessage } from "../lib/crypto/decryptMessage";
import { encryptMessage } from "../lib/crypto/encryptMessage";
import { api } from "../lib/api";
import { base64ToBuf, } from "../lib/crypto/generateKeys";
import { useNavigate } from "react-router-dom";

interface Message {
  id: string;
  from_user_id: string;
  to_user_id: string;
  payload: {
    ciphertext: string;
    iv: string;
    encryptedKey: string;
    encryptedKeyForSelf: string;
  };
  text: string;
  created_at: string;
}

interface Conversation {
  user_id: string;
  display_name: string;
  username: string;
  last_message_at: string;
}

interface SearchUser {
  id: string;
  username: string;
  display_name: string;
}

interface OnlineUsers {
  [userId: string]: boolean;
}

export default function ChatPage() {
  const { token, privateKey, userId } = useAuth();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [recipientId, setRecipientId] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPublicKey, setRecipientPublicKey] = useState<CryptoKey | null>(null);
  const [myPublicKey, setMyPublicKey] = useState<CryptoKey | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUsers>({});
  // On mobile: "list" = show sidebar, "chat" = show conversation
  const [view, setView] = useState<"list" | "chat">("list");
  const [encryptedIndicator, setEncryptedIndicator] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const flashEncrypted = () => {
    setEncryptedIndicator(true);
    setTimeout(() => setEncryptedIndicator(false), 900);
  };

  useEffect(() => {
    if (!token) return;
    api.get("/auth/me").then((res) => {
      const pubKeyB64 = res.data.public_key;
      const pubKeyBytes = base64ToBuf(pubKeyB64);
      crypto.subtle.importKey(
        "spki",
        pubKeyBytes.buffer,
        { name: "RSA-OAEP", hash: "SHA-256" },
        true,
        ["encrypt"]
      ).then(setMyPublicKey);
    });
  }, [token]);

  useEffect(() => {
    if (!token) return;
    api.get("/conversations").then((res) => setConversations(res.data));
  }, [token]);

  useEffect(() => {
    if (!token || !privateKey) return;
    connectWS(token, async (data) => {
      if (data.event === "message.receive") {
        const isSender = data.from_user_id === userId;
        const text = await decryptMessage(data.payload, privateKey, isSender);
        const newMsg: Message = { ...data, text };
        setMessages((prev) => {
          if (prev.find((m) => m.id === data.id)) return prev;
          return [...prev, newMsg];
        });
        api.get("/conversations").then((res) => setConversations(res.data));
      }
      if (data.event === "user.online") setOnlineUsers((p) => ({ ...p, [data.user_id]: true }));
      if (data.event === "user.offline") setOnlineUsers((p) => ({ ...p, [data.user_id]: false }));
    });
  }, [token, privateKey]);

  useEffect(() => {
    if (!recipientId || !privateKey) return;
    setMessages([]);
    api.get(`/conversations/${recipientId}/messages`).then(async (res) => {
      const decrypted = await Promise.all(
        res.data.map(async (m: Message) => {
          const isSender = m.from_user_id === userId;
          const text = await decryptMessage(m.payload, privateKey!, isSender);
          return { ...m, text };
        })
      );
      setMessages(decrypted.reverse());
    });
    api.get(`/users/${recipientId}/public-key`).then(async (res) => {
      const pubKeyBytes = base64ToBuf(res.data.public_key);
      const pubKey = await crypto.subtle.importKey(
        "spki",
        pubKeyBytes.buffer,
        { name: "RSA-OAEP", hash: "SHA-256" },
        true,
        ["encrypt"]
      );
      setRecipientPublicKey(pubKey);
    });
  }, [recipientId, privateKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      api.get(`/users/search?q=${searchQuery}`).then((res) => {
        setSearchResults(res.data);
        setSearchOpen(true);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const closeSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setSearchOpen(false);
  };

  const selectConversation = (conv: Conversation) => {
    setRecipientId(conv.user_id);
    setRecipientName(conv.display_name);
    closeSearch();
    setView("chat");
  };

  const selectSearchResult = (user: SearchUser) => {
    setRecipientId(user.id);
    setRecipientName(user.display_name);
    closeSearch();
    setView("chat");
  };

  const goBack = () => setView("list");

  const sendMessage = async () => {
    if (!input.trim() || !recipientId || !recipientPublicKey || !myPublicKey || sending) return;
    const text = input.trim();
    setInput("");
    if (inputRef.current) { inputRef.current.style.height = "auto"; }
    setSending(true);
    flashEncrypted();
    try {
      const payload = await encryptMessage(text, recipientPublicKey, myPublicKey);
      const ws = getWS();
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ event: "message.send", to: recipientId, payload }));
      } else {
        await api.post("/messages", { to: recipientId, payload });
      }
      const optimistic: Message = {
        id: crypto.randomUUID(),
        from_user_id: userId!,
        to_user_id: recipientId,
        payload,
        text,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
    } catch (err) {
      console.error("Send failed:", err);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleLogout = async () => {
    const refreshToken = localStorage.getItem("refreshToken");
    if (refreshToken) {
      try { await api.post("/auth/logout", { refresh_token: refreshToken }); } catch (_) {}
    }
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    navigate("/login");
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const formatConvTime = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const groupedMessages = messages.reduce((groups: { date: string; msgs: Message[] }[], msg) => {
    const date = formatDate(msg.created_at);
    const last = groups[groups.length - 1];
    if (last && last.date === date) { last.msgs.push(msg); }
    else { groups.push({ date, msgs: [msg] }); }
    return groups;
  }, []);

  const isOnline = onlineUsers[recipientId] === true;

  const avatarColor = (name: string) => {
    const colors = [
      ["#1a4a8a", "#3b82f6"], ["#4c1d95", "#8b5cf6"],
      ["#065f46", "#10b981"], ["#7c2d12", "#f97316"],
      ["#831843", "#ec4899"], ["#1e3a5f", "#38bdf8"],
    ];
    const i = name.charCodeAt(0) % colors.length;
    return colors[i];
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg:         #0d0f14;
          --surface:    #13151c;
          --surface2:   #1a1d27;
          --surface3:   #20243a;
          --border:     rgba(255,255,255,0.07);
          --border2:    rgba(255,255,255,0.12);
          --blue:       #3b82f6;
          --blue-glow:  rgba(59,130,246,0.18);
          --blue-deep:  #1d4ed8;
          --green:      #22c55e;
          --text:       #f1f5f9;
          --text2:      #94a3b8;
          --text3:      #475569;
          --danger:     #f87171;
          --font:       'Plus Jakarta Sans', sans-serif;
          --font-head:  'Outfit', sans-serif;
          --safe-bottom: env(safe-area-inset-bottom, 0px);
          --safe-top:    env(safe-area-inset-top, 0px);
        }

        html, body, #root {
          height: 100%;
          width: 100%;
          overflow: hidden;
          background: var(--bg);
        }

        /* ── ROOT ── */
        .app {
          display: flex;
          height: 100dvh;
          width: 100%;
          font-family: var(--font);
          color: var(--text);
          background: var(--bg);
          overflow: hidden;
          position: relative;
        }

        /* ═══════════════════════════════
           SIDEBAR / CONVERSATION LIST
        ═══════════════════════════════ */
        .sidebar {
          width: 100%;
          max-width: 380px;
          display: flex;
          flex-direction: column;
          background: var(--surface);
          border-right: 1px solid var(--border);
          flex-shrink: 0;
          height: 100%;
          position: relative;
          z-index: 2;
        }

        /* Mobile: full-screen views */
        @media (max-width: 700px) {
          .sidebar {
            max-width: 100%;
            position: absolute;
            inset: 0;
            transition: transform 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.28s ease;
          }
          .sidebar.hidden {
            transform: translateX(-100%);
            opacity: 0;
            pointer-events: none;
          }
          .chat-panel {
            position: absolute;
            inset: 0;
            transition: transform 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.28s ease;
          }
          .chat-panel.hidden {
            transform: translateX(100%);
            opacity: 0;
            pointer-events: none;
          }
        }

        .sidebar-header {
          padding: calc(var(--safe-top) + 14px) 18px 14px;
          display: flex;
          align-items: center;
          gap: 12px;
          border-bottom: 1px solid var(--border);
          background: var(--surface);
          position: sticky;
          top: 0;
          z-index: 10;
        }

        .logo {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 9px;
          font-family: var(--font-head);
          font-size: 19px;
          font-weight: 700;
          letter-spacing: -0.3px;
          color: var(--text);
        }

        .logo-mark {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          background: linear-gradient(135deg, var(--blue-deep), #6d28d9);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(59,130,246,0.35);
        }

        .icon-btn {
          width: 36px;
          height: 36px;
          border: none;
          border-radius: 10px;
          background: var(--surface2);
          color: var(--text2);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s, color 0.15s;
          flex-shrink: 0;
        }

        .icon-btn:hover { background: var(--surface3); color: var(--text); }
        .icon-btn.danger:hover { background: rgba(248,113,113,0.15); color: var(--danger); }

        /* Search */
        .search-container {
          padding: 12px 16px;
          border-bottom: 1px solid var(--border);
          position: relative;
        }

        .search-box {
          width: 100%;
          height: 42px;
          background: var(--surface2);
          border: 1px solid var(--border2);
          border-radius: 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 14px;
          transition: border-color 0.2s;
        }

        .search-box:focus-within {
          border-color: rgba(59,130,246,0.5);
          box-shadow: 0 0 0 3px var(--blue-glow);
        }

        .search-box svg { color: var(--text3); flex-shrink: 0; }

        .search-input {
          flex: 1;
          background: none;
          border: none;
          outline: none;
          color: var(--text);
          font-family: var(--font);
          font-size: 14px;
        }

        .search-input::placeholder { color: var(--text3); }

        .search-clear {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--surface3);
          border: none;
          color: var(--text2);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          line-height: 1;
          flex-shrink: 0;
        }

        .search-dropdown {
          position: absolute;
          top: calc(100% - 4px);
          left: 16px;
          right: 16px;
          background: var(--surface2);
          border: 1px solid var(--border2);
          border-radius: 14px;
          overflow: hidden;
          z-index: 50;
          box-shadow: 0 16px 40px rgba(0,0,0,0.5);
        }

        .search-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          cursor: pointer;
          transition: background 0.12s;
          border-bottom: 1px solid var(--border);
        }

        .search-item:last-child { border-bottom: none; }
        .search-item:hover { background: var(--surface3); }

        .search-item-info { flex: 1; min-width: 0; }

        .search-item-name {
          font-size: 14px;
          font-weight: 600;
          color: var(--text);
        }

        .search-item-un {
          font-size: 12px;
          color: var(--text3);
          margin-top: 1px;
        }

        /* Section label */
        .section-label {
          padding: 14px 18px 8px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text3);
        }

        /* Conv list */
        .conv-list {
          flex: 1;
          overflow-y: auto;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
        }

        .conv-list::-webkit-scrollbar { display: none; }

        .conv-empty {
          padding: 40px 24px;
          text-align: center;
          color: var(--text3);
          font-size: 14px;
          line-height: 1.7;
        }

        .conv-empty-icon {
          font-size: 36px;
          margin-bottom: 12px;
        }

        .conv-item {
          display: flex;
          align-items: center;
          gap: 13px;
          padding: 13px 18px;
          cursor: pointer;
          transition: background 0.12s;
          position: relative;
          -webkit-tap-highlight-color: transparent;
        }

        .conv-item:active { background: var(--surface2); }
        .conv-item.active { background: var(--blue-glow); }

        .conv-item.active::before {
          content: '';
          position: absolute;
          left: 0;
          top: 8px;
          bottom: 8px;
          width: 3px;
          background: var(--blue);
          border-radius: 0 3px 3px 0;
        }

        /* Avatar */
        .ava {
          position: relative;
          flex-shrink: 0;
        }

        .ava-circle {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-head);
          font-size: 18px;
          font-weight: 700;
          color: #fff;
          letter-spacing: -0.5px;
        }

        .ava-circle.sm {
          width: 38px;
          height: 38px;
          font-size: 14px;
        }

        .ava-circle.lg {
          width: 42px;
          height: 42px;
          font-size: 16px;
        }

        .ava-dot {
          position: absolute;
          bottom: 1px;
          right: 1px;
          width: 12px;
          height: 12px;
          background: var(--green);
          border-radius: 50%;
          border: 2.5px solid var(--surface);
        }

        .ava-dot.on-chat {
          border-color: var(--bg);
        }

        .conv-body { flex: 1; min-width: 0; }

        .conv-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .conv-name {
          font-size: 15px;
          font-weight: 600;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .conv-ts {
          font-size: 11px;
          color: var(--text3);
          white-space: nowrap;
          flex-shrink: 0;
        }

        .conv-preview {
          font-size: 13px;
          color: var(--text2);
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* ═══════════════════════════════
           CHAT PANEL
        ═══════════════════════════════ */
        .chat-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          height: 100%;
          background: var(--bg);
          overflow: hidden;
        }

        /* Chat header */
        .chat-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: calc(var(--safe-top) + 10px) 16px 10px;
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
          min-height: 64px;
          position: sticky;
          top: 0;
          z-index: 5;
        }

        .back-btn {
          width: 38px;
          height: 38px;
          border: none;
          border-radius: 10px;
          background: var(--surface2);
          color: var(--text);
          cursor: pointer;
          display: none;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: background 0.15s;
          -webkit-tap-highlight-color: transparent;
        }

        .back-btn:active { background: var(--surface3); }

        @media (max-width: 700px) {
          .back-btn { display: flex; }
        }

        .chat-header-info { flex: 1; min-width: 0; }

        .chat-header-name {
          font-size: 16px;
          font-weight: 700;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .chat-status {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 12px;
          color: var(--text3);
          margin-top: 1px;
        }

        .status-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--text3);
          flex-shrink: 0;
        }

        .status-dot.online { background: var(--green); }

        .status-label.online { color: var(--green); }

        .enc-pill {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 6px 10px;
          background: var(--surface2);
          border: 1px solid var(--border2);
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
          color: var(--text3);
          flex-shrink: 0;
          transition: all 0.25s ease;
          white-space: nowrap;
        }

        .enc-pill.active {
          background: rgba(34,197,94,0.12);
          border-color: rgba(34,197,94,0.3);
          color: var(--green);
          box-shadow: 0 0 12px rgba(34,197,94,0.2);
        }

        /* Messages */
        .messages-scroll {
          flex: 1;
          overflow-y: auto;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
          padding: 16px 14px 10px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .messages-scroll::-webkit-scrollbar { display: none; }

        .date-sep {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 16px 0 10px;
        }

        .date-sep-line {
          flex: 1;
          height: 1px;
          background: var(--border);
        }

        .date-sep-label {
          font-size: 11px;
          font-weight: 600;
          color: var(--text3);
          background: var(--surface2);
          padding: 3px 10px;
          border-radius: 20px;
        }

        .msg-group {
          display: flex;
          flex-direction: column;
          gap: 2px;
          margin: 2px 0;
        }

        .msg-row {
          display: flex;
          align-items: flex-end;
          gap: 8px;
        }

        .msg-row.sent { justify-content: flex-end; }
        .msg-row.recv { justify-content: flex-start; }

        .msg-bubble {
          max-width: min(72%, 340px);
          padding: 10px 14px;
          font-size: 15px;
          line-height: 1.55;
          word-break: break-word;
          position: relative;
        }

        .msg-row.sent .msg-bubble {
          background: linear-gradient(145deg, #2563eb, #1d4ed8);
          color: #fff;
          border-radius: 20px 20px 5px 20px;
          box-shadow: 0 4px 16px rgba(37,99,235,0.3);
        }

        .msg-row.recv .msg-bubble {
          background: var(--surface2);
          color: var(--text);
          border-radius: 20px 20px 20px 5px;
          border: 1px solid var(--border);
        }

        .msg-meta {
          display: flex;
          align-items: center;
          gap: 5px;
          margin-top: 4px;
          justify-content: flex-end;
        }

        .msg-row.recv .msg-meta { justify-content: flex-start; }

        .msg-time {
          font-size: 10px;
          color: rgba(255,255,255,0.5);
        }

        .msg-row.recv .msg-time { color: var(--text3); }

        .decrypt-fail {
          font-size: 13px;
          color: var(--text3);
          font-style: italic;
          display: flex;
          align-items: center;
          gap: 5px;
        }

        /* ── INPUT ── */
        .input-area {
          padding: 10px 12px calc(10px + var(--safe-bottom));
          background: var(--surface);
          border-top: 1px solid var(--border);
          display: flex;
          align-items: flex-end;
          gap: 10px;
          flex-shrink: 0;
        }

        .input-box {
          flex: 1;
          min-height: 44px;
          max-height: 120px;
          background: var(--surface2);
          border: 1.5px solid var(--border2);
          border-radius: 22px;
          display: flex;
          align-items: flex-end;
          padding: 10px 16px;
          transition: border-color 0.2s, box-shadow 0.2s;
          overflow: hidden;
        }

        .input-box:focus-within {
          border-color: rgba(59,130,246,0.5);
          box-shadow: 0 0 0 3px var(--blue-glow);
        }

        .msg-textarea {
          flex: 1;
          background: none;
          border: none;
          outline: none;
          color: var(--text);
          font-family: var(--font);
          font-size: 15px;
          line-height: 1.5;
          resize: none;
          min-height: 24px;
          max-height: 100px;
          overflow-y: auto;
        }

        .msg-textarea::placeholder { color: var(--text3); }
        .msg-textarea::-webkit-scrollbar { display: none; }

        .send-btn {
          width: 44px;
          height: 44px;
          min-width: 44px;
          border-radius: 50%;
          border: none;
          background: var(--blue);
          color: #fff;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s, transform 0.1s, opacity 0.15s, box-shadow 0.15s;
          box-shadow: 0 4px 14px rgba(59,130,246,0.4);
          flex-shrink: 0;
          -webkit-tap-highlight-color: transparent;
        }

        .send-btn:hover:not(:disabled) { background: #2563eb; box-shadow: 0 4px 20px rgba(59,130,246,0.55); }
        .send-btn:active:not(:disabled) { transform: scale(0.92); }
        .send-btn:disabled { opacity: 0.35; cursor: not-allowed; box-shadow: none; }

        /* Empty / no selection */
        .no-chat {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 14px;
          color: var(--text3);
          padding: 32px;
          text-align: center;
        }

        .no-chat-icon {
          width: 72px;
          height: 72px;
          border-radius: 24px;
          background: var(--surface2);
          border: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 32px;
          margin-bottom: 6px;
        }

        .no-chat-title {
          font-family: var(--font-head);
          font-size: 20px;
          font-weight: 700;
          color: var(--text2);
        }

        .no-chat-sub {
          font-size: 14px;
          color: var(--text3);
          line-height: 1.6;
          max-width: 260px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .spinner {
          animation: spin 0.9s linear infinite;
        }

        /* Prevent iOS bounce on non-scroll containers */
        .app { touch-action: none; }
        .messages-scroll, .conv-list { touch-action: pan-y; }
      `}</style>

      <div className="app">
        {/* ── SIDEBAR ── */}
        <aside className={`sidebar${view === "chat" ? " hidden" : ""}`}>
          <div className="sidebar-header">
            <div className="logo">
              <div className="logo-mark">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              WhisperBox
            </div>
            <button className="icon-btn danger" onClick={handleLogout} title="Sign out">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>

          {/* Search */}
          <div className="search-container">
            <div className="search-box">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                className="search-input"
                placeholder="Search people…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="search-clear" onClick={closeSearch}>×</button>
              )}
            </div>

            {searchOpen && searchResults.length > 0 && (
              <div className="search-dropdown">
                {searchResults.map((u) => {
                  const [from, to] = avatarColor(u.display_name);
                  return (
                    <div key={u.id} className="search-item" onClick={() => selectSearchResult(u)}>
                      <div className="ava">
                        <div className="ava-circle sm" style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}>
                          {u.display_name[0].toUpperCase()}
                        </div>
                      </div>
                      <div className="search-item-info">
                        <div className="search-item-name">{u.display_name}</div>
                        <div className="search-item-un">@{u.username}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Conversation list */}
          <div className="conv-list">
            {conversations.length === 0 ? (
              <div className="conv-empty">
                <div className="conv-empty-icon">💬</div>
                <div>No conversations yet.<br />Search for someone to start chatting.</div>
              </div>
            ) : (
              <>
                <div className="section-label">Messages</div>
                {conversations.map((c) => {
                  const [from, to] = avatarColor(c.display_name);
                  return (
                    <div
                      key={c.user_id}
                      className={`conv-item${recipientId === c.user_id ? " active" : ""}`}
                      onClick={() => selectConversation(c)}
                    >
                      <div className="ava">
                        <div className="ava-circle" style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}>
                          {c.display_name[0].toUpperCase()}
                        </div>
                        {onlineUsers[c.user_id] && <div className="ava-dot" />}
                      </div>
                      <div className="conv-body">
                        <div className="conv-row">
                          <div className="conv-name">{c.display_name}</div>
                          <div className="conv-ts">{formatConvTime(c.last_message_at)}</div>
                        </div>
                        <div className="conv-preview">
                          {onlineUsers[c.user_id] ? "● Active now" : "Tap to open"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </aside>

        {/* ── CHAT PANEL ── */}
        <div className={`chat-panel${view === "list" && !recipientId ? " hidden" : ""}${view === "list" ? " hidden" : ""}`}>
          {!recipientId ? (
            <div className="no-chat">
              <div className="no-chat-icon">💬</div>
              <div className="no-chat-title">No chat open</div>
              <div className="no-chat-sub">Pick a conversation or search for someone to message.</div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="chat-header">
                <button className="back-btn" onClick={goBack} aria-label="Back">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="m15 18-6-6 6-6"/>
                  </svg>
                </button>

                {(() => {
                  const [from, to] = avatarColor(recipientName);
                  return (
                    <div className="ava">
                      <div className="ava-circle lg" style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}>
                        {recipientName[0]?.toUpperCase()}
                      </div>
                      {isOnline && <div className="ava-dot on-chat" />}
                    </div>
                  );
                })()}

                <div className="chat-header-info">
                  <div className="chat-header-name">{recipientName}</div>
                  <div className="chat-status">
                    <div className={`status-dot${isOnline ? " online" : ""}`} />
                    <span className={`status-label${isOnline ? " online" : ""}`}>
                      {isOnline ? "Online" : "Offline"}
                    </span>
                  </div>
                </div>

                <div className={`enc-pill${encryptedIndicator ? " active" : ""}`}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="11" width="18" height="11" rx="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  E2E
                </div>
              </div>

              {/* Messages */}
              <div className="messages-scroll">
                {groupedMessages.map((group) => (
                  <div key={group.date}>
                    <div className="date-sep">
                      <div className="date-sep-line" />
                      <div className="date-sep-label">{group.date}</div>
                      <div className="date-sep-line" />
                    </div>
                    {group.msgs.map((m) => {
                      const isSent = m.from_user_id === userId;
                      return (
                        <div key={m.id} className={`msg-row${isSent ? " sent" : " recv"}`}>
                          <div className="msg-bubble">
                            {m.text === "[Unable to decrypt message]" ? (
                              <span className="decrypt-fail">🔒 Can't decrypt</span>
                            ) : m.text}
                            <div className="msg-meta">
                              <span className="msg-time">{formatTime(m.created_at)}</span>
                              {isSent && (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5">
                                  <polyline points="20 6 9 17 4 12"/>
                                </svg>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="input-area">
                <div className="input-box">
                  <textarea
                    ref={inputRef}
                    className="msg-textarea"
                    placeholder="Message…"
                    value={input}
                    rows={1}
                    onChange={(e) => {
                      setInput(e.target.value);
                      e.target.style.height = "auto";
                      e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px";
                    }}
                    onKeyDown={handleKeyDown}
                  />
                </div>
                <button
                  className="send-btn"
                  onClick={sendMessage}
                  disabled={!input.trim() || sending || !recipientPublicKey}
                  aria-label="Send"
                >
                  {sending ? (
                    <svg className="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="22" y1="2" x2="11" y2="13"/>
                      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

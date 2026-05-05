// src/pages/ChatPage.tsx
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../store/useAuth";
import { connectWS, getWS } from "../lib/ws";
import { decryptMessage } from "../lib/crypto/decryptMessage";
import { encryptMessage } from "../lib/crypto/encryptMessage";
import { api } from "../lib/api";
import { base64ToBuf, bufToBase64 } from "../lib/crypto/generateKeys";
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
  const [onlineUsers, setOnlineUsers] = useState<OnlineUsers>({});
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [encryptedIndicator, setEncryptedIndicator] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Flash the encrypted indicator when sending
  const flashEncrypted = () => {
    setEncryptedIndicator(true);
    setTimeout(() => setEncryptedIndicator(false), 1000);
  };

  // Load my public key on mount
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

  // Load conversations
  useEffect(() => {
    if (!token) return;
    api.get("/conversations").then((res) => setConversations(res.data));
  }, [token]);

  // WebSocket connection
  useEffect(() => {
    if (!token || !privateKey) return;

    connectWS(token, async (data) => {
      if (data.event === "message.receive") {
        const isSender = data.from_user_id === userId;
        const text = await decryptMessage(data.payload, privateKey, isSender);
        const newMsg: Message = { ...data, text };

        setMessages((prev) => {
          // avoid duplicates
          if (prev.find((m) => m.id === data.id)) return prev;
          return [...prev, newMsg];
        });

        // refresh conversations list for updated last_message_at
        api.get("/conversations").then((res) => setConversations(res.data));
      }

      if (data.event === "user.online") {
        setOnlineUsers((prev) => ({ ...prev, [data.user_id]: true }));
      }

      if (data.event === "user.offline") {
        setOnlineUsers((prev) => ({ ...prev, [data.user_id]: false }));
      }
    });
  }, [token, privateKey]);

  // Load message history when recipient changes
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
      setMessages(decrypted.reverse()); // API returns newest first
    });

    // Fetch recipient public key
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

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Search users
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timeout = setTimeout(() => {
      api.get(`/users/search?q=${searchQuery}`).then((res) => {
        setSearchResults(res.data);
      });
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const selectConversation = (conv: Conversation) => {
    setRecipientId(conv.user_id);
    setRecipientName(conv.display_name);
    setSearchQuery("");
    setSearchResults([]);
  };

  const selectSearchResult = (user: SearchUser) => {
    setRecipientId(user.id);
    setRecipientName(user.display_name);
    setSearchQuery("");
    setSearchResults([]);
  };

  const sendMessage = async () => {
    if (!input.trim() || !recipientId || !recipientPublicKey || !myPublicKey || sending) return;

    const text = input.trim();
    setInput("");
    setSending(true);
    flashEncrypted();

    try {
      const payload = await encryptMessage(text, recipientPublicKey, myPublicKey);

      const ws = getWS();
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ event: "message.send", to: recipientId, payload }));
      } else {
        // Offline fallback
        await api.post("/messages", { to: recipientId, payload });
      }

      // Optimistically add to UI
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
      try {
        await api.post("/auth/logout", { refresh_token: refreshToken });
      } catch (_) {}
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

  // Group messages by date
  const groupedMessages = messages.reduce((groups: { date: string; msgs: Message[] }[], msg) => {
    const date = formatDate(msg.created_at);
    const last = groups[groups.length - 1];
    if (last && last.date === date) {
      last.msgs.push(msg);
    } else {
      groups.push({ date, msgs: [msg] });
    }
    return groups;
  }, []);

  const isOnline = onlineUsers[recipientId] === true;

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
          --green-dim:  #34d39920;
          --text-1:     #eef0f7;
          --text-2:     #7b82a0;
          --text-3:     #3d4460;
          --sent-bg:    #1a2d52;
          --sent-border:#2a4a8a;
          --recv-bg:    #151821;
          --recv-border:#1e2436;
          --danger:     #f87171;
          --font-body: 'DM Sans', sans-serif;
          --font-head: 'Syne', sans-serif;
        }

        .chat-root {
          display: flex;
          height: 100vh;
          width: 100vw;
          background: var(--bg-deep);
          font-family: var(--font-body);
          color: var(--text-1);
          overflow: hidden;
        }

        /* ── SIDEBAR ── */
        .sidebar {
          width: 300px;
          min-width: 300px;
          background: var(--bg-panel);
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          transition: transform 0.3s ease;
          position: relative;
          z-index: 10;
        }

        .sidebar-header {
          padding: 20px 16px 12px;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .logo {
          font-family: var(--font-head);
          font-size: 18px;
          font-weight: 800;
          letter-spacing: -0.5px;
          color: var(--text-1);
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .logo-icon {
          width: 28px;
          height: 28px;
          background: linear-gradient(135deg, var(--accent), #8b5cf6);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
        }

        .logout-btn {
          background: none;
          border: none;
          color: var(--text-3);
          cursor: pointer;
          padding: 6px;
          border-radius: 6px;
          transition: color 0.2s, background 0.2s;
          display: flex;
          align-items: center;
        }

        .logout-btn:hover {
          color: var(--danger);
          background: #f8717110;
        }

        .search-wrap {
          padding: 12px 16px;
          border-bottom: 1px solid var(--border);
          position: relative;
        }

        .search-input {
          width: 100%;
          background: var(--bg-input);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 9px 12px 9px 36px;
          color: var(--text-1);
          font-size: 13px;
          font-family: var(--font-body);
          outline: none;
          transition: border-color 0.2s;
        }

        .search-input::placeholder { color: var(--text-3); }
        .search-input:focus { border-color: var(--border-lit); }

        .search-icon {
          position: absolute;
          left: 28px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-3);
          width: 14px;
        }

        .search-results {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 10px;
          margin: 4px 16px 0;
          overflow: hidden;
          position: absolute;
          left: 0;
          right: 0;
          z-index: 100;
          box-shadow: 0 8px 32px #00000060;
        }

        .search-result-item {
          padding: 10px 14px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 10px;
          transition: background 0.15s;
        }

        .search-result-item:hover { background: var(--bg-hover); }

        .conv-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px 0;
        }

        .conv-list::-webkit-scrollbar { width: 3px; }
        .conv-list::-webkit-scrollbar-track { background: transparent; }
        .conv-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

        .conv-item {
          padding: 12px 16px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 12px;
          transition: background 0.15s;
          border-radius: 0;
          position: relative;
        }

        .conv-item:hover { background: var(--bg-hover); }

        .conv-item.active {
          background: var(--accent-glow);
          border-right: 2px solid var(--accent);
        }

        .avatar {
          width: 40px;
          height: 40px;
          min-width: 40px;
          border-radius: 12px;
          background: linear-gradient(135deg, var(--accent-dim), #4c1d95);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-head);
          font-size: 15px;
          font-weight: 700;
          color: var(--text-1);
          position: relative;
        }

        .avatar.small {
          width: 32px;
          height: 32px;
          min-width: 32px;
          font-size: 12px;
          border-radius: 9px;
        }

        .online-dot {
          position: absolute;
          bottom: -2px;
          right: -2px;
          width: 10px;
          height: 10px;
          background: var(--green);
          border-radius: 50%;
          border: 2px solid var(--bg-panel);
        }

        .conv-info { flex: 1; min-width: 0; }

        .conv-name {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-1);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .conv-time {
          font-size: 11px;
          color: var(--text-3);
          margin-top: 2px;
        }

        /* ── MAIN CHAT ── */
        .chat-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          background: var(--bg-deep);
        }

        .chat-header {
          padding: 0 24px;
          height: 60px;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          gap: 12px;
          background: var(--bg-panel);
          flex-shrink: 0;
        }

        .chat-header-info { flex: 1; }

        .chat-header-name {
          font-size: 15px;
          font-weight: 600;
          color: var(--text-1);
        }

        .chat-header-status {
          font-size: 12px;
          color: var(--text-2);
          margin-top: 1px;
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .status-online { color: var(--green); }

        /* Encrypted badge */
        .enc-badge {
          display: flex;
          align-items: center;
          gap: 5px;
          background: var(--green-dim);
          border: 1px solid #34d39930;
          border-radius: 20px;
          padding: 4px 10px;
          font-size: 11px;
          font-weight: 500;
          color: var(--green);
          transition: all 0.3s ease;
        }

        .enc-badge.flash {
          background: #34d39930;
          border-color: var(--green);
          box-shadow: 0 0 12px #34d39940;
        }

        /* Empty state */
        .empty-state {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          color: var(--text-3);
        }

        .empty-icon {
          width: 64px;
          height: 64px;
          background: var(--bg-card);
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
          border: 1px solid var(--border);
        }

        .empty-title {
          font-family: var(--font-head);
          font-size: 18px;
          font-weight: 700;
          color: var(--text-2);
        }

        .empty-sub {
          font-size: 13px;
          color: var(--text-3);
          text-align: center;
          max-width: 260px;
          line-height: 1.6;
        }

        /* Messages */
        .messages-area {
          flex: 1;
          overflow-y: auto;
          padding: 20px 24px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .messages-area::-webkit-scrollbar { width: 3px; }
        .messages-area::-webkit-scrollbar-track { background: transparent; }
        .messages-area::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

        .date-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 16px 0 8px;
        }

        .date-divider-line {
          flex: 1;
          height: 1px;
          background: var(--border);
        }

        .date-divider-label {
          font-size: 11px;
          color: var(--text-3);
          background: var(--bg-card);
          padding: 3px 10px;
          border-radius: 20px;
          border: 1px solid var(--border);
        }

        .msg-row {
          display: flex;
          margin: 1px 0;
        }

        .msg-row.sent { justify-content: flex-end; }
        .msg-row.recv { justify-content: flex-start; }

        .msg-bubble {
          max-width: 65%;
          padding: 10px 14px;
          border-radius: 16px;
          font-size: 14px;
          line-height: 1.55;
          word-break: break-word;
          position: relative;
        }

        .msg-row.sent .msg-bubble {
          background: var(--sent-bg);
          border: 1px solid var(--sent-border);
          border-bottom-right-radius: 4px;
          color: var(--text-1);
        }

        .msg-row.recv .msg-bubble {
          background: var(--recv-bg);
          border: 1px solid var(--recv-border);
          border-bottom-left-radius: 4px;
          color: var(--text-1);
        }

        .msg-time {
          font-size: 10px;
          color: var(--text-3);
          margin-top: 4px;
          text-align: right;
        }

        .msg-row.recv .msg-time { text-align: left; }

        /* Failed decrypt */
        .decrypt-fail {
          color: var(--text-3);
          font-style: italic;
          font-size: 13px;
        }

        /* Input area */
        .input-area {
          padding: 16px 24px;
          border-top: 1px solid var(--border);
          background: var(--bg-panel);
          display: flex;
          align-items: flex-end;
          gap: 12px;
        }

        .input-wrap {
          flex: 1;
          background: var(--bg-input);
          border: 1px solid var(--border);
          border-radius: 14px;
          display: flex;
          align-items: flex-end;
          padding: 10px 14px;
          transition: border-color 0.2s;
        }

        .input-wrap:focus-within { border-color: var(--border-lit); }

        .msg-input {
          flex: 1;
          background: none;
          border: none;
          outline: none;
          color: var(--text-1);
          font-family: var(--font-body);
          font-size: 14px;
          resize: none;
          max-height: 120px;
          line-height: 1.5;
        }

        .msg-input::placeholder { color: var(--text-3); }

        .send-btn {
          width: 40px;
          height: 40px;
          min-width: 40px;
          background: var(--accent);
          border: none;
          border-radius: 12px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s, transform 0.1s, opacity 0.2s;
          color: white;
        }

        .send-btn:hover:not(:disabled) { background: #6ba3ff; transform: scale(1.05); }
        .send-btn:active:not(:disabled) { transform: scale(0.95); }
        .send-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .no-select-prompt {
          color: var(--text-3);
          font-size: 13px;
          padding: 16px 24px;
          border-top: 1px solid var(--border);
          background: var(--bg-panel);
          text-align: center;
        }
      `}</style>

      <div className="chat-root">
        {/* ── SIDEBAR ── */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="logo">
              <div className="logo-icon">🔐</div>
              WhisperBox
            </div>
            <button className="logout-btn" onClick={handleLogout} title="Logout">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>

          {/* Search */}
          <div className="search-wrap">
            <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              ref={searchRef}
              className="search-input"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            {searchResults.length > 0 && (
              <div className="search-results">
                {searchResults.map((u) => (
                  <div key={u.id} className="search-result-item" onClick={() => selectSearchResult(u)}>
                    <div className="avatar small">{u.display_name[0].toUpperCase()}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{u.display_name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-3)" }}>@{u.username}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Conversations */}
          <div className="conv-list">
            {conversations.length === 0 && (
              <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
                No conversations yet.<br />Search for a user to start chatting.
              </div>
            )}
            {conversations.map((c) => (
              <div
                key={c.user_id}
                className={`conv-item${recipientId === c.user_id ? " active" : ""}`}
                onClick={() => selectConversation(c)}
              >
                <div className="avatar">
                  {c.display_name[0].toUpperCase()}
                  {onlineUsers[c.user_id] && <div className="online-dot" />}
                </div>
                <div className="conv-info">
                  <div className="conv-name">{c.display_name}</div>
                  <div className="conv-time">{formatDate(c.last_message_at)} · {formatTime(c.last_message_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* ── MAIN CHAT ── */}
        <main className="chat-main">
          {!recipientId ? (
            /* Empty state */
            <div className="empty-state">
              <div className="empty-icon">💬</div>
              <div className="empty-title">No conversation selected</div>
              <div className="empty-sub">Search for a user or pick a conversation from the sidebar to start messaging.</div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="chat-header">
                <div className="avatar">
                  {recipientName[0]?.toUpperCase()}
                  {isOnline && <div className="online-dot" />}
                </div>
                <div className="chat-header-info">
                  <div className="chat-header-name">{recipientName}</div>
                  <div className="chat-header-status">
                    {isOnline
                      ? <span className="status-online">● Online</span>
                      : <span>Offline</span>
                    }
                  </div>
                </div>

                {/* Encrypted indicator — required by spec */}
                <div className={`enc-badge${encryptedIndicator ? " flash" : ""}`}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  End-to-end encrypted
                </div>
              </div>

              {/* Messages */}
              <div className="messages-area">
                {groupedMessages.map((group) => (
                  <div key={group.date}>
                    <div className="date-divider">
                      <div className="date-divider-line" />
                      <div className="date-divider-label">{group.date}</div>
                      <div className="date-divider-line" />
                    </div>
                    {group.msgs.map((m) => {
                      const isSent = m.from_user_id === userId;
                      return (
                        <div key={m.id} className={`msg-row${isSent ? " sent" : " recv"}`}>
                          <div className="msg-bubble">
                            {m.text === "[Unable to decrypt message]"
                              ? <span className="decrypt-fail">🔒 Unable to decrypt</span>
                              : m.text
                            }
                            <div className="msg-time">{formatTime(m.created_at)}</div>
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
                <div className="input-wrap">
                  <textarea
                    ref={inputRef}
                    className="msg-input"
                    placeholder="Message (Enter to send, Shift+Enter for new line)"
                    value={input}
                    rows={1}
                    onChange={(e) => {
                      setInput(e.target.value);
                      // auto-resize
                      e.target.style.height = "auto";
                      e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                    }}
                    onKeyDown={handleKeyDown}
                  />
                </div>
                <button
                  className="send-btn"
                  onClick={sendMessage}
                  disabled={!input.trim() || sending || !recipientPublicKey}
                  title="Send message"
                >
                  {sending
                    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{animation:"spin 1s linear infinite"}}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  }
                </button>
              </div>
            </>
          )}
        </main>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}

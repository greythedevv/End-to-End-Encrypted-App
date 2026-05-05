// src/lib/ws.ts
import { refreshToken } from "./refresh";

let socket: WebSocket | null = null;

export function connectWS(token: string, onMessage: (data: any) => void) {
  socket = new WebSocket(
    `wss://whisperbox.koyeb.app/ws?token=${token}`
  );

  socket.onmessage = (e) => {
    const data = JSON.parse(e.data);
    onMessage(data);
  };

  socket.onclose = async (e) => {
    console.log("WS closed:", e.code);

    if (e.code === 4001) {
      // expired → refresh + reconnect
      const newToken = await refreshToken();
      connectWS(newToken, onMessage);
    }

    if (e.code === 4003) {
      window.location.href = "/login";
    }
  };

  return socket;
}

export function getWS() {
  return socket;
}
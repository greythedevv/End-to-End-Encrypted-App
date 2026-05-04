// src/lib/ws.ts

let socket: WebSocket | null = null;

export function connectWS(token: string) {
  socket = new WebSocket(
    `wss://whisperbox.koyeb.app/ws?token=${token}`
  );

  return socket;
}

export function getWS() {
  if (!socket) throw new Error("WebSocket not connected");
  return socket;
}
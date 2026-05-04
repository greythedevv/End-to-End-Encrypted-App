import axios from "axios";

const API = "https://whisperbox.koyeb.app";

export const api = axios.create({
  baseURL: API,
});

export function setAuthToken(token: string) {
  api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
}
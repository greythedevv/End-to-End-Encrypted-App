// src/lib/refresh.ts
import { api, setAuthToken } from "./api";
import { useAuth } from "../store/useAuth";

let refreshing: Promise<string> | null = null;

export async function refreshToken() {
  if (refreshing) return refreshing;

  const { refreshToken } = useAuth.getState();

  refreshing = (async () => {
    const res = await api.post("/auth/refresh", {
      refresh_token: refreshToken,
    });

    const newToken = res.data.access_token;

    setAuthToken(newToken);

    useAuth.setState({ token: newToken });
    localStorage.setItem("token", newToken);

    refreshing = null;
    return newToken;
  })();

  return refreshing;
}
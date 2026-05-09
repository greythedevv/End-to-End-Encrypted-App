import axios from "axios";
import { refreshToken } from "./refresh";

const API = "https://whisperbox.koyeb.app";

export const api = axios.create({
  baseURL: API,
});



export function setAuthToken(token: string) {
  api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
}



api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const status = err.response?.status;
    const hasToken = !!sessionStorage.getItem("token");

    
    if (status === 401 && hasToken) {
      try {
        const newToken = await refreshToken();
        err.config.headers.Authorization = `Bearer ${newToken}`;
        return api(err.config);
      } catch {
        // Refresh failed — send to login
        sessionStorage.clear();
        window.location.href = "/login";
      }
    }

    return Promise.reject(err);
  }
);
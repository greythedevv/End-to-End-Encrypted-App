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
    if (err.response?.status === 401) {
      const newToken = await refreshToken();
      err.config.headers.Authorization = `Bearer ${newToken}`;
      return api(err.config);
    }
    return Promise.reject(err);
  }
);
import axios from "axios";

const API = "https://whisperbox.koyeb.app";

export const api = axios.create({
  baseURL: API,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        error.message =
          error.response.data?.detail ||
          error.response.data?.message ||
          `Request failed with status ${error.response.status}`;
      } else if (error.request) {
        error.message = "No response received from the server.";
      } else {
        error.message = error.message || "API request failed.";
      }
    }
    return Promise.reject(error);
  }
);

export function setAuthToken(token: string) {
  api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
}
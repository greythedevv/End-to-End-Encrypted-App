import { api } from "./api";

export async function login(username: string, password: string) {
  const res = await api.post("/auth/login", {
    username,
    password,
  });

  return res.data;
}

export async function register(data: any) {
  const res = await api.post("/auth/register", data);
  return res.data;
}

export async function getMe() {
  const res = await api.get("/auth/me");
  return res.data;
}
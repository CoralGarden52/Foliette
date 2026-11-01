import type { AssetManifest, User, Wall, WallDoc } from "./types";
import type { AdminStats } from './lib/adminStats';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...((init.headers as Record<string, string>) || {}),
  };
  if (init.body && !(init.body instanceof FormData) && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "网络不太稳定，检查一下连接再试试");
  }

  const text = await res.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text.slice(0, 200) };
    }
  }
  if (!res.ok) {
    const message = (data as { error?: string })?.error || `请求失败（${res.status}）`;
    if (res.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("foliette:unauthorized"));
    }
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export const api = {
  adminStats: () => request<AdminStats>('/api/admin/stats', { cache: 'no-store' }),
  me: () => request<{ user: User | null }>("/api/auth/me"),

  register: (body: { username: string; email: string; password: string; confirmPassword: string }) =>
    request<{ user: User }>("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),

  login: (body: { email: string; password: string }) =>
    request<{ user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),

  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),

  updateProfile: (body: { username?: string; avatar?: string }) =>
    request<{ user: User }>("/api/auth/me", { method: "PATCH", body: JSON.stringify(body) }),

  suggestUsername: () => request<{ username: string }>("/api/auth/suggest-username"),

  assets: () => request<AssetManifest>("/api/assets/manifest"),

  listWalls: () => request<{ walls: Wall[]; maxPhotos: number }>("/api/walls"),

  createWall: (body: { title?: string; ratio: { w: number; h: number }; layoutId: string; theme: string }) =>
    request<{ wall: Wall }>("/api/walls", { method: "POST", body: JSON.stringify(body) }),

  getWall: (id: string) => request<{ wall: Wall }>(`/api/walls/${id}`),

  saveWall: (id: string, body: Partial<Wall> & { doc: WallDoc }) =>
    request<{ wall: Wall }>(`/api/walls/${id}`, { method: "PUT", body: JSON.stringify(body) }),

  deleteWall: (id: string) => request<{ ok: true }>(`/api/walls/${id}`, { method: "DELETE" }),

  uploadPhotos: async (id: string, files: File[]) => {
    const form = new FormData();
    for (const f of files) form.append("files", f);
    return request<{ photos: { id: string; name: string; url: string; size: number }[]; total: number; max: number }>(
      `/api/walls/${id}/photos`,
      { method: "POST", body: form }
    );
  },

  deletePhoto: (wallId: string, fileId: string) =>
    request<{ ok: true; photoCount: number }>(`/api/walls/${wallId}/photos/${fileId}`, { method: "DELETE" }),
};

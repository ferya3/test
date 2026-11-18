import type {
  Asset,
  FileEntry,
  Frame,
  Message,
  Meta,
  Project,
  ProjectSettings,
  SpecRecord,
  Task,
  TestResult,
  Usage,
  Version,
} from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
const TOKEN_KEY = "recode.token";
export const UNAUTHORIZED_EVENT = "recode:unauthorized";

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: the session lasts until reload */
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth")) {
    setToken(null);
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT)); // AuthProvider sends the user to /login
  }
  if (!res.ok) {
    let detail: unknown;
    try {
      detail = (await res.json()).detail;
    } catch {
      detail = res.statusText;
    }
    const message =
      typeof detail === "string"
        ? detail
        : detail && typeof detail === "object" && "message" in detail
          ? String((detail as { message: unknown }).message)
          : Array.isArray(detail)
            ? detail.map((d) => d?.msg ?? String(d)).join("; ")
            : `Request failed (${res.status})`;
    throw new ApiError(res.status, message, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const json = (body: unknown) => JSON.stringify(body);

export const api = {
  register: (email: string, password: string, name?: string) =>
    request<{ access_token: string }>("/api/auth/register", { method: "POST", body: json({ email, password, name }) }),
  login: (email: string, password: string) =>
    request<{ access_token: string }>("/api/auth/login", { method: "POST", body: json({ email, password }) }),
  me: () => request<{ id: string; email: string; name: string }>("/api/auth/me"),
  meta: () => request<Meta>("/api/meta"),

  projects: () => request<Project[]>("/api/projects"),
  project: (id: string) => request<Project>(`/api/projects/${id}`),
  createProject: (body: {
    name: string;
    description?: string;
    source_type: string;
    source_url?: string | null;
    framework: string;
    settings?: ProjectSettings;
  }) => request<Project>("/api/projects", { method: "POST", body: json(body) }),
  updateProject: (id: string, body: Partial<Pick<Project, "name" | "description" | "framework">> & { settings?: ProjectSettings }) =>
    request<Project>(`/api/projects/${id}`, { method: "PATCH", body: json(body) }),
  deleteProject: (id: string) => request<void>(`/api/projects/${id}`, { method: "DELETE" }),

  uploadAsset: (id: string, file: File, onProgress?: (fraction: number) => void) =>
    new Promise<Asset>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_URL}/api/projects/${id}/assets`);
      const token = getToken();
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
        else {
          let message = `Upload failed (${xhr.status})`;
          try {
            message = JSON.parse(xhr.responseText).detail ?? message;
          } catch {}
          reject(new ApiError(xhr.status, message));
        }
      };
      xhr.onerror = () => reject(new ApiError(0, "Network error during upload"));
      const form = new FormData();
      form.append("file", file);
      xhr.send(form);
    }),
  assets: (id: string) => request<Asset[]>(`/api/projects/${id}/assets`),
  frames: (id: string) => request<Frame[]>(`/api/projects/${id}/frames`),

  generate: (id: string, body: { reuse_analysis?: boolean; max_fix_iterations?: number | null } = {}) =>
    request<Task>(`/api/projects/${id}/generate`, { method: "POST", body: json(body) }),
  tasks: (id: string) => request<Task[]>(`/api/projects/${id}/tasks`),
  spec: (id: string) => request<SpecRecord | null>(`/api/projects/${id}/spec`),
  rerunQa: (id: string, versionId?: string) =>
    request<Task>(`/api/projects/${id}/qa${versionId ? `?version_id=${versionId}` : ""}`, { method: "POST" }),
  tests: (id: string, versionId?: string) =>
    request<TestResult[]>(`/api/projects/${id}/tests${versionId ? `?version_id=${versionId}` : ""}`),
  usage: (id: string) => request<Usage>(`/api/projects/${id}/usage`),

  files: (id: string, versionId?: string) =>
    request<FileEntry[]>(`/api/projects/${id}/files${versionId ? `?version_id=${versionId}` : ""}`),
  file: (id: string, path: string, versionId?: string) =>
    request<FileEntry>(
      `/api/projects/${id}/file?path=${encodeURIComponent(path)}${versionId ? `&version_id=${versionId}` : ""}`,
    ),
  saveFiles: (id: string, files: Record<string, string>, message: string, deleted: string[] = []) =>
    request<Version>(`/api/projects/${id}/files`, { method: "PUT", body: json({ files, message, deleted }) }),
  versions: (id: string) => request<Version[]>(`/api/projects/${id}/versions`),
  restore: (id: string, versionId: string) =>
    request<Version>(`/api/projects/${id}/versions/${versionId}/restore`, { method: "POST" }),
  previewUrl: (id: string, versionId?: string) =>
    request<{ url: string; version_id: string; ready: boolean; message: string | null }>(
      `/api/projects/${id}/preview-url${versionId ? `?version_id=${versionId}` : ""}`,
    ),

  messages: (id: string) => request<Message[]>(`/api/projects/${id}/messages`),
  sendMessage: (id: string, content: string) =>
    request<Message>(`/api/projects/${id}/messages`, { method: "POST", body: json({ content }) }),

  exportZip: async (id: string, versionId?: string) => {
    const token = getToken();
    const res = await fetch(`${API_URL}/api/projects/${id}/export.zip${versionId ? `?version_id=${versionId}` : ""}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new ApiError(res.status, "Export failed");
    const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "project.zip";
    return { blob: await res.blob(), name };
  },
  exportGithub: (
    id: string,
    body: { token: string; repo: string; branch: string; private: boolean; create: boolean; message: string },
  ) => request<{ url: string; version: number }>(`/api/projects/${id}/export/github`, { method: "POST", body: json(body) }),
};

export function wsUrl(projectId: string): string {
  const base = API_URL.replace(/^http/, "ws");
  return `${base}/api/ws/projects/${projectId}?token=${encodeURIComponent(getToken() ?? "")}`;
}

import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

let accessToken = null;

export function setAccessToken(token) {
  accessToken = token || null;
}

export function clearAccessToken() {
  accessToken = null;
}

export const api = axios.create({ baseURL: API, withCredentials: true });

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error?.config;
    const status = error?.response?.status;
    const url = String(original?.url || "");
    if (status === 401 && original && !original._nexoraRetry && !url.startsWith("/auth/")) {
      original._nexoraRetry = true;
      try {
        const { data } = await axios.post(`${API}/auth/refresh`, {}, { withCredentials: true });
        setAccessToken(data.token);
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${data.token}`;
        return api(original);
      } catch (_) {
        clearAccessToken();
      }
    }
    return Promise.reject(error);
  },
);

export function formatApiError(err) {
  const detail = err?.response?.data?.detail;
  if (detail == null) return err?.message || "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

// Resolve stored image paths (backend-served uploads) or external URLs.
export function resolveImage(src) {
  if (!src) return null;
  if (src.startsWith("http")) return src;
  return `${BACKEND_URL}${src}`;
}

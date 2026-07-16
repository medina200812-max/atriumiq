import type {
  CurrentConditions,
  TrendPoint,
  DailySummary,
  SensorReading,
  UserReport,
  ReportDraft,
  CommunityMood,
} from "./types";

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`API error ${res.status}: ${detail}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

export const api = {
  getCurrent: (location = "Main Atrium") =>
    request<CurrentConditions>(`/current?location=${encodeURIComponent(location)}`),

  getTrend: (hours = 24, location?: string) =>
    request<TrendPoint[]>(`/analytics/trend?hours=${hours}${location ? `&location=${encodeURIComponent(location)}` : ""}`),

  getSummary: () => request<DailySummary>("/analytics/summary"),

  getHistory: (params: Record<string, string | number | undefined>) => {
    const query = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "" && v !== "All")
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join("&");
    return request<SensorReading[]>(`/history?${query}`);
  },

  listReports: (category?: string) =>
    request<UserReport[]>(`/reports${category && category !== "All" ? `?category=${encodeURIComponent(category)}` : ""}`),

  createReport: (draft: ReportDraft) =>
    request<UserReport>("/reports", { method: "POST", body: JSON.stringify(draft) }),

  updateReport: (id: number, patch: Partial<ReportDraft>) =>
    request<UserReport>(`/reports/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  deleteReport: (id: number) => request<void>(`/reports/${id}`, { method: "DELETE" }),

  getCommunityMood: () => request<CommunityMood>("/community-mood"),

  getLocations: () => request<{ locations: string[]; report_categories: string[] }>("/locations"),
};

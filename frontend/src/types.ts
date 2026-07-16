export interface SensorReading {
  id: number;
  timestamp: string;
  location: string;
  atrium_temp: number;
  outdoor_temp: number;
  noise_db: number;
  brightness_lux: number;
  humidity_pct: number;
}

export interface ComfortScores {
  study: number;
  meeting: number;
  relax: number;
  overall: number;
  status: string;
}

export interface CurrentConditions {
  reading: SensorReading;
  temperature_diff: number;
  scores: ComfortScores;
  advisories: string[];
}

export interface TrendPoint {
  timestamp: string;
  atrium: number;
  outdoor: number;
  noise: number;
  light: number;
  diff: number;
}

export interface DailySummary {
  min_temp: number;
  max_temp: number;
  avg_temp: number;
  reading_count: number;
}

export type ReportCategory =
  | "Too Hot"
  | "Too Noisy"
  | "Too Bright"
  | "Too Dark"
  | "Comfortable"
  | "Other";

export interface UserReport {
  id: number;
  created_at: string;
  timestamp: string;
  category: ReportCategory;
  location: string;
  comment: string;
  description: string;
  status: "open" | "in_review" | "resolved";
  author: string;
}

export interface ReportDraft {
  category: ReportCategory;
  location: string;
  description: string;
  comment?: string;
  status?: "open" | "in_review" | "resolved";
  author?: string;
}

export interface CommunityMood {
  total_reports: number;
  satisfaction_rate: number;
  category_breakdown: Record<string, number>;
  top_complaint: string;
}

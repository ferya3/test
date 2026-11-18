export type ProjectStatus =
  | "draft"
  | "processing"
  | "analyzing"
  | "generating"
  | "testing"
  | "ready"
  | "failed";

export type SourceType = "video" | "screenshot" | "url" | "prompt";
export type Framework = "html" | "react-vite";
export type Role = "vision" | "reasoning" | "coding" | "qa";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface RoleModel {
  provider?: "anthropic" | "heuristic" | null;
  model?: string | null;
  effort?: Effort | null;
}

export interface ProjectSettings {
  models?: Partial<Record<Role, RoleModel>>;
  qa_threshold?: number | null;
  max_fix_iterations?: number | null;
  language?: string | null;
  direction?: "ltr" | "rtl" | null;
  font_override?: string | null;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  source_type: SourceType;
  source_url: string | null;
  framework: Framework;
  status: ProjectStatus;
  settings: ProjectSettings;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
  thumbnail_url: string | null;
  score: number | null;
}

export interface TimelineEvent {
  id: string;
  kind: "scroll" | "cut" | "interaction";
  t_start: number;
  t_end: number;
  direction?: "down" | "up" | null;
  distance_px: number;
  bbox?: number[] | null;
  area_ratio: number;
  hint: string;
  frames: number[];
}

export interface Asset {
  id: string;
  kind: "video" | "image";
  filename: string;
  mime: string;
  size: number;
  status: "uploaded" | "processing" | "analyzed" | "failed";
  meta: {
    probe?: { width: number; height: number; fps: number; duration: number; codec: string };
    events?: TimelineEvent[];
    viewport?: { width: number; height: number };
    source_url?: string;
  };
  created_at: string;
  url: string | null;
}

export interface Frame {
  id: string;
  asset_id: string;
  kind: "keyframe" | "stitched";
  frame_index: number;
  timestamp: number;
  width: number;
  height: number;
  meta: { reasons?: string[]; scene?: number; t_end?: number; sticky_header_px?: number };
  url: string | null;
}

export interface TaskLog {
  t: string;
  step: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface Task {
  id: string;
  project_id: string;
  kind: "video" | "pipeline" | "edit" | "qa" | "capture";
  agent: string;
  status: "queued" | "running" | "succeeded" | "failed";
  progress: number;
  step: string;
  output: Record<string, unknown>;
  logs: TaskLog[];
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface Version {
  id: string;
  number: number;
  parent_id: string | null;
  message: string;
  author: "ai" | "user" | "qa-fix" | "restore";
  score: number | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface FileEntry {
  path: string;
  size: number;
  sha: string;
  content?: string | null;
}

export interface SectionMetric {
  page_id: string;
  id: string;
  ref_y: number;
  ref_h: number;
  out_y: number | null;
  out_h: number | null;
  ssim: number;
  color_delta: number;
  ref_bg: string;
  out_bg: string;
  height_ratio: number;
  score: number;
}

export interface QAIssue {
  severity: "high" | "medium" | "low";
  kind: string;
  message: string;
  section_id?: string | null;
  data?: Record<string, unknown>;
}

export interface TestResult {
  id: string;
  version_id: string;
  kind: "visual" | "security" | "build";
  score: number;
  passed: boolean;
  metrics: {
    page_scores?: Record<string, number>;
    overflow?: Record<string, number>;
    sections?: SectionMetric[];
    behavior_checks?: { behavior: string; effect: string; passed: boolean; message?: string }[];
    iteration?: number;
    log?: string;
  };
  issues: (QAIssue & { file?: string })[];
  artifacts: Record<string, string | null>;
  created_at: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  task_id: string | null;
  version_id: string | null;
  meta: { changed_files?: string[]; score?: number | null };
  created_at: string;
}

export interface Element {
  kind: string;
  text: string;
  level?: number | null;
  href?: string | null;
  items?: string[];
}

export interface SectionSpec {
  id: string;
  kind: string;
  component: string;
  layout: string;
  columns: number;
  height_px: number | null;
  background: string | null;
  background_image?: string | null;
  text_color: string | null;
  padding_y: number;
  sticky: boolean;
  elements: Element[];
  items: Record<string, unknown>[];
  source: { reference_key?: string; y?: number; h?: number; page_width?: number };
}

export interface Behavior {
  id: string;
  trigger: string;
  target: string;
  effect: string;
  duration_ms: number;
  delay_ms: number;
  easing: string;
  params: Record<string, unknown>;
  evidence: { t_start?: number; t_end?: number; event_ids?: string[]; source?: string };
  confidence: number;
}

export interface DesignSpec {
  project_name: string;
  framework: Framework;
  language: string;
  direction: "ltr" | "rtl";
  viewport: { width: number; height: number };
  tokens: {
    colors: Record<string, string>;
    fonts: Record<string, string>;
    type_scale: Record<string, { size: number; weight: number; line_height: number }>;
    spacing: Record<string, number>;
    radii: Record<string, number>;
    shadows: Record<string, string>;
    container_width: number;
  };
  pages: {
    id: string;
    route: string;
    title: string;
    reference_url?: string | null;
    reference_width: number;
    reference_height: number;
    sections: SectionSpec[];
  }[];
  components: { name: string; kind: string; description: string; used_in: string[] }[];
  behaviors: Behavior[];
  assumptions: string[];
  requires_backend: boolean;
}

export interface SpecRecord {
  id: string;
  revision: number;
  source: string;
  spec: DesignSpec;
  created_at: string;
}

export interface Usage {
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  by_agent: Record<string, { calls: number; input_tokens: number; output_tokens: number; cost_usd: number }>;
}

export interface Meta {
  roles: Record<Role, { provider: string; model: string; effort: string | null; offline: boolean }>;
  providers: Record<string, { available: boolean; models: string[] }>;
  efforts: Effort[];
  frameworks: Framework[];
  sandbox: { mode: string; available: boolean };
  defaults: { qa_threshold: number; max_fix_iterations: number; max_upload_mb: number; max_video_seconds: number };
}

export interface ProjectEvent {
  type: "progress" | "task" | "project" | "version" | "qa" | "asset" | "message" | "usage" | "ping";
  ts?: number;
  [key: string]: unknown;
}

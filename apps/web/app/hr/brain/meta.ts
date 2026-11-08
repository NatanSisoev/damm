// The engine parameters with the range the sliders allow. Their texts live in lib/i18n/hr-brain.ts under
// grp_<id>_title / grp_<id>_intro and p_<key>_label / p_<key>_hint.
// Keys are the engine_config keys (snake_case). Ranges are guard rails for the UI; the engine validates again.
import type { QuestionType } from "@damm/shared";
import type { BrainKey } from "@/lib/i18n/hr-brain";

export interface ParamMeta {
  key: string;
  /** Dictionary key of the unit ("u_days", "u_answers", "u_ms"). */
  unit?: BrainKey;
  min: number;
  max: number;
  step: number;
  /** Shown as a percentage (value 0..1). */
  percent?: boolean;
}

export interface ParamGroup {
  id: string;
  params: ParamMeta[];
}

export const PARAM_GROUPS: ParamGroup[] = [
  {
    id: "batch",
    params: [
      { key: "questions_per_day", min: 1, max: 8, step: 1 },
      { key: "max_needs_per_day", min: 0, max: 4, step: 1 },
      { key: "item_cooldown_days", unit: "u_days", min: 0, max: 90, step: 1 },
      { key: "domain_floor", min: 0, max: 1, step: 0.01 },
      { key: "outlier_boost", min: 0, max: 3, step: 0.05 },
      { key: "outlier_z", min: 1, max: 4, step: 0.1 },
      { key: "outlier_window_days", unit: "u_days", min: 3, max: 60, step: 1 },
    ],
  },
  {
    id: "confidence",
    params: [
      { key: "half_life_days", unit: "u_days", min: 3, max: 120, step: 1 },
      { key: "se_tolerance", min: 0.01, max: 0.2, step: 0.005 },
      { key: "small_sample_variance", min: 0, max: 0.1, step: 0.001 },
      { key: "process_noise_per_day", min: 0, max: 0.01, step: 0.0001 },
      { key: "item_bias_shrinkage", unit: "u_answers", min: 1, max: 200, step: 1 },
      { key: "min_answer_ms", unit: "u_ms", min: 0, max: 10000, step: 100 },
    ],
  },
  {
    id: "followup",
    params: [
      { key: "followup_z", min: 1, max: 5, step: 0.1 },
      { key: "followup_min_days", unit: "u_days", min: 1, max: 30, step: 1 },
      { key: "followup_max_days", unit: "u_days", min: 1, max: 60, step: 1 },
      { key: "followup_inflation", min: 0, max: 0.2, step: 0.005 },
      { key: "confirm_sigmas", min: 0.5, max: 5, step: 0.1 },
    ],
  },
];

export const FORMAT_KEYS: Record<QuestionType, BrainKey> = {
  scale10: "fmt_scale10",
  scale5: "fmt_scale5",
  yes_no: "fmt_yes_no",
  pair: "fmt_pair",
  choice: "fmt_choice",
  ranking: "fmt_ranking",
  open: "fmt_open",
};

export const CLOSED_TYPES = ["scale10", "scale5", "yes_no", "pair", "choice"] as const;

export const REASON_KEYS: Record<string, BrainKey> = {
  monitor: "reason_monitor",
  need: "reason_need",
  followup: "reason_followup",
};

export const WEIGHT_SOURCE_KEYS: Record<string, BrainKey> = {
  collective: "src_collective",
  default: "src_default",
  none: "src_none",
};

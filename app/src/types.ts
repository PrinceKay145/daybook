/* Mirrors the runner's brief data. The runner is authoritative; this file follows it. */

export interface Action {
  title: string;
  detail: string;
}

export interface BoardRow {
  who: string;
  what: string;
  status: string;
  next_move: string;
  date: string;
}

export interface Metric {
  key: string;
  value: string;
  note: string;
}

export interface Habit {
  label: string;
  count: string;
}

export interface Delivery {
  heartbeat_present: boolean;
  last_tick: string;
  alert_style: string;
  buttons_reachable: boolean;
  undelivered_days: string[];
  yesterday_delivered: boolean;
}

export interface NextUp {
  title: string;
  at: string;
  in_minutes: number;
  message: string;
}

export interface PathReference {
  where: string;
  recorded: string;
  exists: boolean;
  pending: boolean;
}

export interface Brief {
  generated_for: string;
  true_for: string;
  owner_name: string;
  timezone: string;
  clock_description: string;
  clock_frozen: boolean;
  next_up: NextUp | null;
  three: Action[];
  three_reason: string;
  done_for_you: string;
  scoreboard: Metric[];
  habits: Habit[];
  light_schedule_line: string;
  light_schedule_source: string;
  board_live: BoardRow[];
  board_closed: BoardRow[];
  board_note: string;
  not_on_list: string[];
  questions: string[];
  delivery: Delivery;
  closing: { text: string; source: string };
  references: PathReference[];
  warnings: string[];
  finished_labels: string[];
}

export interface AssertionResult {
  id: string;
  name: string;
  ok: boolean;
  detail: string;
  catches: string;
}

export interface Diagnostics {
  heartbeat: Record<string, unknown>;
  invalidMutes: { id: string; title: string; pausedOn: string | null }[];
  providers: { id: string; label: string; authKind: string; detected: boolean }[];
  scope: Record<string, unknown>;
  budget: Record<string, unknown>;
  warnings: string[];
}

export interface Payload {
  folder: string;
  scopeRoot: string;
  clock: { value: string; source: string; frozen: boolean };
  brief: Brief;
  verification: { passed: boolean; results: AssertionResult[] };
  diagnostics: Diagnostics;
}

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  api_football_fixture_id INTEGER NOT NULL UNIQUE,
  stage TEXT NOT NULL,
  kickoff_at TEXT NOT NULL,
  status TEXT NOT NULL,
  venue TEXT,
  home_team_id TEXT NOT NULL,
  home_team_name TEXT NOT NULL,
  home_team_logo_url TEXT,
  away_team_id TEXT NOT NULL,
  away_team_name TEXT NOT NULL,
  away_team_logo_url TEXT,
  home_score INTEGER,
  away_score INTEGER,
  last_synced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS team_display_names (
  api_football_team_id TEXT PRIMARY KEY,
  original_name TEXT NOT NULL,
  display_name_zh TEXT NOT NULL,
  logo_url TEXT,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS odds_snapshots (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id),
  odds_type TEXT NOT NULL,
  bookmaker TEXT NOT NULL,
  home_win REAL,
  draw REAL,
  away_win REAL,
  handicap TEXT,
  over_under TEXT,
  captured_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_predictions (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id),
  predicted_winner TEXT,
  advice TEXT,
  home_percent TEXT,
  draw_percent TEXT,
  away_percent TEXT,
  raw_json TEXT NOT NULL,
  captured_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_models (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES ai_providers(id),
  model_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prompt_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  full_prompt TEXT NOT NULL,
  prompt_summary TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prediction_requests (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id),
  requested_at TEXT NOT NULL,
  status TEXT NOT NULL,
  next_executable_at TEXT
);

CREATE TABLE IF NOT EXISTS prediction_runs (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id),
  scheduled_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  status TEXT NOT NULL,
  failure_reason TEXT
);

CREATE TABLE IF NOT EXISTS prediction_run_logs (
  id TEXT PRIMARY KEY,
  prediction_run_id TEXT NOT NULL REFERENCES prediction_runs(id),
  match_id TEXT NOT NULL REFERENCES matches(id),
  model_id TEXT REFERENCES ai_models(id),
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_predictions (
  id TEXT PRIMARY KEY,
  prediction_run_id TEXT NOT NULL REFERENCES prediction_runs(id),
  match_id TEXT NOT NULL REFERENCES matches(id),
  model_id TEXT NOT NULL REFERENCES ai_models(id),
  prompt_template_id TEXT NOT NULL REFERENCES prompt_templates(id),
  predicted_result TEXT NOT NULL,
  predicted_home_score INTEGER NOT NULL,
  predicted_away_score INTEGER NOT NULL,
  confidence REAL NOT NULL,
  short_reason TEXT NOT NULL,
  analysis_report TEXT NOT NULL DEFAULT '',
  key_factors_json TEXT NOT NULL,
  odds_interpretation TEXT NOT NULL,
  risk_points_json TEXT NOT NULL,
  raw_response TEXT NOT NULL,
  parse_status TEXT NOT NULL,
  eligible_for_scoring INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prediction_scores (
  id TEXT PRIMARY KEY,
  ai_prediction_id TEXT NOT NULL REFERENCES ai_predictions(id),
  match_id TEXT NOT NULL REFERENCES matches(id),
  model_id TEXT NOT NULL REFERENCES ai_models(id),
  result_points INTEGER NOT NULL,
  exact_score_points INTEGER NOT NULL,
  home_goals_points INTEGER NOT NULL,
  away_goals_points INTEGER NOT NULL,
  total_points INTEGER NOT NULL,
  scored_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS manual_overrides (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS system_logs (
  id TEXT PRIMARY KEY,
  level TEXT NOT NULL,
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  details_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE ai_providers ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE ai_providers ADD COLUMN base_url TEXT NOT NULL DEFAULT '';
ALTER TABLE prompt_templates ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE prompt_templates ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS fixture_context_snapshots (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id),
  odds_summary_json TEXT NOT NULL,
  api_prediction_summary_json TEXT NOT NULL,
  head_to_head_summary_json TEXT NOT NULL,
  squad_summary_json TEXT NOT NULL,
  dongqiudi_intel_summary_json TEXT NOT NULL,
  sporttery_summary_json TEXT NOT NULL,
  completeness TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fixture_data_sync_logs (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id),
  domain TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  synced_at TEXT NOT NULL
);

ALTER TABLE prediction_requests ADD COLUMN context_snapshot_id TEXT REFERENCES fixture_context_snapshots(id);
ALTER TABLE prediction_requests ADD COLUMN task_types_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE prediction_requests ADD COLUMN data_options_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE prediction_requests ADD COLUMN prompt_template_id TEXT;
ALTER TABLE prediction_requests ADD COLUMN custom_prompt TEXT NOT NULL DEFAULT '';
ALTER TABLE prediction_requests ADD COLUMN output_style TEXT NOT NULL DEFAULT 'concise';
ALTER TABLE ai_predictions ADD COLUMN analysis_report TEXT NOT NULL DEFAULT '';

ALTER TABLE fixture_context_snapshots ADD COLUMN dongqiudi_intel_summary_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS fixture_dongqiudi_mappings (
  api_football_fixture_id INTEGER PRIMARY KEY,
  dongqiudi_match_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE fixture_context_snapshots ADD COLUMN sporttery_summary_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS fixture_sporttery_mappings (
  api_football_fixture_id INTEGER PRIMARY KEY,
  sporttery_match_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

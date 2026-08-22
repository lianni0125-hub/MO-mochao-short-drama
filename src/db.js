import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.uploadsDir, { recursive: true });
fs.mkdirSync(config.exportsDir, { recursive: true });

export const db = new DatabaseSync(config.dbPath);
db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");

db.exec(`
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  logline TEXT DEFAULT '',
  tags_json TEXT DEFAULT '[]',
  total_episodes INTEGER NOT NULL DEFAULT 60,
  audience TEXT DEFAULT '', platform TEXT DEFAULT '', restrictions TEXT DEFAULT '',
  seed TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'idea',
  current_stage TEXT NOT NULL DEFAULT 'idea', template_id TEXT NOT NULL DEFAULT 'default',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS constraints (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'hard', category TEXT NOT NULL DEFAULT 'other',
  description TEXT NOT NULL, episode_start INTEGER, episode_end INTEGER,
  locked INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
  type TEXT NOT NULL, title TEXT NOT NULL, content_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft', version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_artifact_project_type ON artifacts(project_id, type);
CREATE TABLE IF NOT EXISTS episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
  episode_no INTEGER NOT NULL, title TEXT DEFAULT '', summary TEXT DEFAULT '', purpose TEXT DEFAULT '',
  start_state TEXT DEFAULT '', end_state TEXT DEFAULT '', required_plot TEXT DEFAULT '',
  must_reveal TEXT DEFAULT '', must_not_reveal TEXT DEFAULT '', rhythm TEXT DEFAULT '', emotion TEXT DEFAULT '',
  card_relation TEXT DEFAULT '', novel TEXT DEFAULT '', novel_summary TEXT DEFAULT '', episode_plan TEXT DEFAULT '', character_identifiers_json TEXT DEFAULT '[]', script TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'planned',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id, episode_no)
);
CREATE TABLE IF NOT EXISTS story_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
  category TEXT NOT NULL, subject TEXT NOT NULL, value TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', source_episode INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS deleted_story_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_id INTEGER,
  project_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  value TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  source_episode INTEGER,
  original_updated_at TEXT,
  deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_deleted_story_state_project ON deleted_story_state(project_id,deleted_at DESC);
CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER,
  name TEXT NOT NULL, original_name TEXT NOT NULL, file_path TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'mixed', extracted_text TEXT DEFAULT '', analysis_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS character_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
  character_index INTEGER NOT NULL, character_name TEXT NOT NULL, file_path TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'upload', prompt TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id,character_index)
);
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, kind TEXT NOT NULL, library TEXT NOT NULL DEFAULT 'reality',
  url TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1,
  update_interval_minutes INTEGER NOT NULL DEFAULT 1440,
  last_run_at TEXT, last_status TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS knowledge_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, source_id INTEGER, library TEXT NOT NULL,
  external_id TEXT, title TEXT NOT NULL, summary TEXT DEFAULT '', content TEXT DEFAULT '',
  tags_json TEXT DEFAULT '[]', platform TEXT DEFAULT '', rank_value REAL,
  published_at TEXT, snapshot_date TEXT NOT NULL, source_url TEXT DEFAULT '',
  narrative_json TEXT DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_unique ON knowledge_items(library, source_url, snapshot_date);
CREATE TABLE IF NOT EXISTS generations (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, stage TEXT NOT NULL,
  provider TEXT NOT NULL, model TEXT NOT NULL, prompt TEXT NOT NULL, output TEXT DEFAULT '',
  status TEXT NOT NULL, input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0,
  error TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
  type TEXT NOT NULL, target TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 1,
  message TEXT DEFAULT '', error TEXT DEFAULT '', payload_json TEXT NOT NULL DEFAULT '{}', result_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, started_at TEXT, finished_at TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_jobs_project_created ON jobs(project_id, id DESC);
`);

try { db.exec("ALTER TABLE sources ADD COLUMN library TEXT NOT NULL DEFAULT 'reality'"); } catch {}
try { db.exec("ALTER TABLE projects ADD COLUMN template_id TEXT NOT NULL DEFAULT 'default'"); } catch {}
try { db.exec("ALTER TABLE episodes ADD COLUMN hook TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE projects ADD COLUMN emotion_intensity TEXT NOT NULL DEFAULT 'strong'"); } catch {}
try { db.exec("ALTER TABLE projects ADD COLUMN sort_order INTEGER"); } catch {}
try { db.exec("ALTER TABLE projects ADD COLUMN deleted_at TEXT"); } catch {}
db.exec("UPDATE projects SET sort_order=id WHERE sort_order IS NULL");
db.exec("CREATE INDEX IF NOT EXISTS idx_projects_deleted_at ON projects(deleted_at)");
try { db.exec("ALTER TABLE episodes ADD COLUMN scene_treatment TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE episodes ADD COLUMN novel TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE episodes ADD COLUMN novel_summary TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE episodes ADD COLUMN episode_plan TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE episodes ADD COLUMN character_identifiers_json TEXT DEFAULT '[]'"); } catch {}
try { db.exec("ALTER TABLE jobs ADD COLUMN elapsed_ms INTEGER NOT NULL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE jobs ADD COLUMN attempt_started_at TEXT"); } catch {}
try { db.exec("ALTER TABLE jobs ADD COLUMN auto_retry_count INTEGER NOT NULL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE jobs ADD COLUMN checkpoint_json TEXT NOT NULL DEFAULT '{}'"); } catch {}
db.exec("UPDATE artifacts SET type='benchmark',title='对标和改编' WHERE type='story_design'; UPDATE projects SET current_stage='benchmark' WHERE current_stage='story_design';");
db.exec("UPDATE projects SET current_stage='planning' WHERE current_stage IN ('benchmark','synopsis','cards','expectations'); UPDATE projects SET current_stage='constraints' WHERE current_stage='skeleton';");
db.exec("UPDATE projects SET current_stage='planning' WHERE current_stage NOT IN ('idea','planning') AND id NOT IN (SELECT project_id FROM artifacts WHERE type='planning')");

export function all(sql, params = {}) { return db.prepare(sql).all(params); }
export function get(sql, params = {}) { return db.prepare(sql).get(params); }
export function run(sql, params = {}) { return db.prepare(sql).run(params); }
export function transaction(work) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export function json(value, fallback = {}) {
  try { return JSON.parse(value ?? ""); } catch { return fallback; }
}
export function now() { return new Date().toISOString(); }

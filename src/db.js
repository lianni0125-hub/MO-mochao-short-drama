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
  current_stage TEXT NOT NULL DEFAULT 'idea', template_id TEXT NOT NULL DEFAULT 'default', idea_libraries_json TEXT NOT NULL DEFAULT '[]', story_mode TEXT NOT NULL DEFAULT 'normal',
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
  card_relation TEXT DEFAULT '', first_appearance_characters TEXT DEFAULT '', novel TEXT DEFAULT '', novel_summary TEXT DEFAULT '', episode_plan TEXT DEFAULT '', character_identifiers_json TEXT DEFAULT '[]', script TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'planned',
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
CREATE TABLE IF NOT EXISTS memory_entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'character', canonical_name TEXT NOT NULL,
  aliases_json TEXT NOT NULL DEFAULT '[]', initial_identity TEXT DEFAULT '',
  personality TEXT DEFAULT '', backstory TEXT DEFAULT '', source_type TEXT NOT NULL DEFAULT 'characters',
  source_ref TEXT DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id,kind,canonical_name)
);
CREATE TABLE IF NOT EXISTS memory_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
  episode_no INTEGER NOT NULL DEFAULT 0, event_order INTEGER NOT NULL DEFAULT 0,
  event_type TEXT NOT NULL DEFAULT 'event', subject TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '', object_text TEXT DEFAULT '', location TEXT DEFAULT '', time_text TEXT DEFAULT '',
  timeline_type TEXT NOT NULL DEFAULT 'main', timeline_label TEXT DEFAULT '', temporal_anchor TEXT DEFAULT '',
  temporal_relation TEXT NOT NULL DEFAULT 'unknown', snapshot_effect TEXT NOT NULL DEFAULT 'advance_current',
  summary TEXT NOT NULL, participants_json TEXT NOT NULL DEFAULT '[]', source_quote TEXT DEFAULT '',
  source_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id,episode_no,source_hash)
);
CREATE TABLE IF NOT EXISTS memory_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
  from_event_id INTEGER NOT NULL, to_event_id INTEGER NOT NULL,
  relation TEXT NOT NULL DEFAULT '', confidence REAL NOT NULL DEFAULT 1, thread_hint TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY(from_event_id) REFERENCES memory_events(id) ON DELETE CASCADE,
  FOREIGN KEY(to_event_id) REFERENCES memory_events(id) ON DELETE CASCADE,
  UNIQUE(project_id,from_event_id,to_event_id,relation)
);
CREATE TABLE IF NOT EXISTS memory_chains (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '', summary TEXT DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS memory_chain_events (
  chain_id INTEGER NOT NULL, event_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(chain_id,event_id),
  FOREIGN KEY(chain_id) REFERENCES memory_chains(id) ON DELETE CASCADE,
  FOREIGN KEY(event_id) REFERENCES memory_events(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS memory_relationship_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, episode_no INTEGER NOT NULL,
  change_order INTEGER NOT NULL DEFAULT 0, person_a TEXT NOT NULL, person_b TEXT NOT NULL,
  relationship_state TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL, source_quote TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id,episode_no,person_a,person_b,summary)
);
CREATE TABLE IF NOT EXISTS memory_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, pair_key TEXT NOT NULL,
  person_a TEXT NOT NULL, person_b TEXT NOT NULL, current_state TEXT NOT NULL DEFAULT '', latest_episode INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id,pair_key)
);
CREATE TABLE IF NOT EXISTS memory_secondary_characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, canonical_name TEXT NOT NULL,
  identity TEXT NOT NULL DEFAULT '', traits TEXT NOT NULL DEFAULT '', first_episode INTEGER NOT NULL DEFAULT 0,
  latest_episode INTEGER NOT NULL DEFAULT 0, source_quote TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id,canonical_name)
);
CREATE TABLE IF NOT EXISTS memory_golden_fingers (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, canonical_name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT '', owner TEXT NOT NULL DEFAULT '', fixed_rules TEXT NOT NULL DEFAULT '',
  current_state TEXT NOT NULL DEFAULT '', latest_episode INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id,canonical_name)
);
CREATE TABLE IF NOT EXISTS memory_golden_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, episode_no INTEGER NOT NULL,
  change_order INTEGER NOT NULL DEFAULT 0, golden_name TEXT NOT NULL, owner TEXT NOT NULL DEFAULT '',
  change_type TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL, current_snapshot TEXT NOT NULL DEFAULT '', source_quote TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id,episode_no,golden_name,summary)
);
CREATE TABLE IF NOT EXISTS memory_important_props (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, canonical_name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT '', significance TEXT NOT NULL DEFAULT '', current_holder TEXT NOT NULL DEFAULT '',
  current_location TEXT NOT NULL DEFAULT '', origin_text TEXT NOT NULL DEFAULT '', current_state TEXT NOT NULL DEFAULT '', first_episode INTEGER NOT NULL DEFAULT 0,
  latest_episode INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id,canonical_name)
);
CREATE TABLE IF NOT EXISTS memory_prop_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, episode_no INTEGER NOT NULL,
  change_order INTEGER NOT NULL DEFAULT 0, prop_name TEXT NOT NULL, change_type TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL, current_holder TEXT NOT NULL DEFAULT '', current_location TEXT NOT NULL DEFAULT '', origin_text TEXT NOT NULL DEFAULT '',
  current_state TEXT NOT NULL DEFAULT '', source_quote TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id,episode_no,prop_name,summary)
);
CREATE TABLE IF NOT EXISTS memory_resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, owner TEXT NOT NULL,
  canonical_name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT '', amount_text TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT '', availability TEXT NOT NULL DEFAULT '', current_state TEXT NOT NULL DEFAULT '',
  first_episode INTEGER NOT NULL DEFAULT 0, latest_episode INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id,owner,canonical_name)
);
CREATE TABLE IF NOT EXISTS memory_resource_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, episode_no INTEGER NOT NULL,
  change_order INTEGER NOT NULL DEFAULT 0, owner TEXT NOT NULL, resource_name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT '', change_type TEXT NOT NULL DEFAULT '', amount_text TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT '', availability TEXT NOT NULL DEFAULT '', current_state TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL, source_quote TEXT NOT NULL DEFAULT '', temporal_scope TEXT NOT NULL DEFAULT 'current',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id,episode_no,owner,resource_name,summary)
);
CREATE TABLE IF NOT EXISTS memory_golden_abilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, golden_name TEXT NOT NULL,
  canonical_name TEXT NOT NULL, owner TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active', conditions TEXT NOT NULL DEFAULT '', replaces_ability TEXT NOT NULL DEFAULT '',
  first_episode INTEGER NOT NULL DEFAULT 0, latest_episode INTEGER NOT NULL DEFAULT 0,
  source_quote TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id,golden_name,canonical_name)
);
CREATE TABLE IF NOT EXISTS memory_golden_ability_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, episode_no INTEGER NOT NULL,
  change_order INTEGER NOT NULL DEFAULT 0, golden_name TEXT NOT NULL, ability_name TEXT NOT NULL,
  change_type TEXT NOT NULL DEFAULT '', previous_status TEXT NOT NULL DEFAULT '', new_status TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '', source_quote TEXT NOT NULL DEFAULT '', temporal_scope TEXT NOT NULL DEFAULT 'current',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id,episode_no,golden_name,ability_name,summary)
);
CREATE TABLE IF NOT EXISTS memory_vectors (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, memory_type TEXT NOT NULL,
  source_id INTEGER NOT NULL, episode_no INTEGER NOT NULL DEFAULT 0, text_content TEXT NOT NULL,
  embedding_json TEXT NOT NULL, embedding_model TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id,memory_type,source_id,embedding_model)
);
CREATE TABLE IF NOT EXISTS memory_extractions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, episode_no INTEGER NOT NULL,
  scene_count INTEGER NOT NULL DEFAULT 0, paragraph_count INTEGER NOT NULL DEFAULT 0,
  first_pass_count INTEGER NOT NULL DEFAULT 0, audit_added_count INTEGER NOT NULL DEFAULT 0,
  final_count INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'completed',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id,episode_no)
);
CREATE TABLE IF NOT EXISTS memory_temporal_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, event_id INTEGER NOT NULL,
  episode_no INTEGER NOT NULL, marker_order INTEGER NOT NULL DEFAULT 0, marker_text TEXT NOT NULL,
  relation TEXT NOT NULL DEFAULT 'unknown', anchor_event_id INTEGER, anchor_label TEXT NOT NULL DEFAULT '',
  timeline_type TEXT NOT NULL DEFAULT 'main', marker_kind TEXT NOT NULL DEFAULT 'relative',
  precision TEXT NOT NULL DEFAULT 'relative', relation_role TEXT NOT NULL DEFAULT 'occurrence',
  target_label TEXT NOT NULL DEFAULT '', source_quote TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY(event_id) REFERENCES memory_events(id) ON DELETE CASCADE,
  FOREIGN KEY(anchor_event_id) REFERENCES memory_events(id) ON DELETE SET NULL,
  UNIQUE(project_id,event_id,marker_text,relation)
);
CREATE INDEX IF NOT EXISTS idx_memory_entities_project ON memory_entities(project_id,active,kind);
CREATE INDEX IF NOT EXISTS idx_memory_events_project_episode ON memory_events(project_id,active,episode_no,event_order);
CREATE INDEX IF NOT EXISTS idx_memory_links_project ON memory_links(project_id,from_event_id,to_event_id);
CREATE INDEX IF NOT EXISTS idx_memory_chains_project ON memory_chains(project_id,active);
CREATE INDEX IF NOT EXISTS idx_memory_chain_events_event ON memory_chain_events(event_id,chain_id);
CREATE INDEX IF NOT EXISTS idx_memory_vectors_project_type ON memory_vectors(project_id,memory_type,episode_no);
CREATE INDEX IF NOT EXISTS idx_memory_relationship_changes_project ON memory_relationship_changes(project_id,episode_no,change_order);
CREATE INDEX IF NOT EXISTS idx_memory_golden_changes_project ON memory_golden_changes(project_id,episode_no,change_order);
CREATE INDEX IF NOT EXISTS idx_memory_prop_changes_project ON memory_prop_changes(project_id,episode_no,change_order);
CREATE INDEX IF NOT EXISTS idx_memory_resources_project ON memory_resources(project_id,active,owner);
CREATE INDEX IF NOT EXISTS idx_memory_resource_changes_project ON memory_resource_changes(project_id,episode_no,change_order);
CREATE INDEX IF NOT EXISTS idx_memory_temporal_project ON memory_temporal_relations(project_id,episode_no,event_id);
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
  auto_retry_limit INTEGER NOT NULL DEFAULT 5,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, started_at TEXT, finished_at TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_jobs_project_created ON jobs(project_id, id DESC);
CREATE TABLE IF NOT EXISTS workbench_settings (
  id INTEGER PRIMARY KEY CHECK(id=1), parallel_enabled INTEGER NOT NULL DEFAULT 0,
  session_id TEXT NOT NULL DEFAULT '', concurrency_mode TEXT NOT NULL DEFAULT 'auto',
  concurrency_limit INTEGER NOT NULL DEFAULT 3, adaptive_limit INTEGER NOT NULL DEFAULT 3,
  recover_at TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO workbench_settings(id) VALUES(1);
CREATE TABLE IF NOT EXISTS job_step_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, project_id INTEGER NOT NULL,
  episode_no INTEGER, stage TEXT NOT NULL DEFAULT '', round_no INTEGER,
  outcome TEXT NOT NULL, error_type TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '',
  duration_ms INTEGER NOT NULL DEFAULT 0, started_at TEXT, finished_at TEXT NOT NULL,
  FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_job_step_logs_job ON job_step_logs(job_id,id);
`);

try { db.exec("ALTER TABLE sources ADD COLUMN library TEXT NOT NULL DEFAULT 'reality'"); } catch {}
try { db.exec("ALTER TABLE projects ADD COLUMN template_id TEXT NOT NULL DEFAULT 'default'"); } catch {}
try { db.exec("ALTER TABLE episodes ADD COLUMN hook TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE projects ADD COLUMN emotion_intensity TEXT NOT NULL DEFAULT 'strong'"); } catch {}
try { db.exec("ALTER TABLE projects ADD COLUMN narrative_person TEXT NOT NULL DEFAULT 'first'"); } catch {}
try { db.exec("ALTER TABLE projects ADD COLUMN sort_order INTEGER"); } catch {}
try { db.exec("ALTER TABLE projects ADD COLUMN deleted_at TEXT"); } catch {}
try { db.exec("ALTER TABLE projects ADD COLUMN idea_libraries_json TEXT NOT NULL DEFAULT '[]'"); } catch {}
try { db.exec("ALTER TABLE projects ADD COLUMN story_mode TEXT NOT NULL DEFAULT 'normal'"); } catch {}
try { db.exec("ALTER TABLE knowledge_items ADD COLUMN item_type TEXT NOT NULL DEFAULT 'source'"); } catch {}
try { db.exec("ALTER TABLE knowledge_items ADD COLUMN confidence REAL NOT NULL DEFAULT 0.5"); } catch {}
try { db.exec("ALTER TABLE knowledge_items ADD COLUMN expires_at TEXT"); } catch {}
try { db.exec("ALTER TABLE knowledge_items ADD COLUMN embedding_json TEXT DEFAULT '[]'"); } catch {}
try { db.exec("ALTER TABLE knowledge_items ADD COLUMN auto_generated INTEGER NOT NULL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE knowledge_items ADD COLUMN updated_at TEXT"); } catch {}
db.exec("CREATE INDEX IF NOT EXISTS idx_knowledge_active ON knowledge_items(library,item_type,expires_at)");
db.exec("UPDATE projects SET sort_order=id WHERE sort_order IS NULL");
db.exec("CREATE INDEX IF NOT EXISTS idx_projects_deleted_at ON projects(deleted_at)");
try { db.exec("ALTER TABLE episodes ADD COLUMN scene_treatment TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE episodes ADD COLUMN novel TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE episodes ADD COLUMN novel_summary TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE episodes ADD COLUMN episode_plan TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE episodes ADD COLUMN character_identifiers_json TEXT DEFAULT '[]'"); } catch {}
try { db.exec("ALTER TABLE episodes ADD COLUMN first_appearance_characters TEXT DEFAULT ''"); } catch {}
db.exec("UPDATE templates SET project_id=NULL WHERE project_id IS NOT NULL");
try { db.exec("ALTER TABLE jobs ADD COLUMN elapsed_ms INTEGER NOT NULL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE jobs ADD COLUMN attempt_started_at TEXT"); } catch {}
try { db.exec("ALTER TABLE jobs ADD COLUMN auto_retry_count INTEGER NOT NULL DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE jobs ADD COLUMN auto_retry_limit INTEGER NOT NULL DEFAULT 5"); } catch {}
try { db.exec("ALTER TABLE jobs ADD COLUMN checkpoint_json TEXT NOT NULL DEFAULT '{}'"); } catch {}
try { db.exec("ALTER TABLE jobs ADD COLUMN step_started_at TEXT"); } catch {}
try { db.exec("ALTER TABLE jobs ADD COLUMN workbench_session_id TEXT NOT NULL DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE jobs ADD COLUMN interruption_reason TEXT NOT NULL DEFAULT ''"); } catch {}
db.exec("CREATE INDEX IF NOT EXISTS idx_jobs_workbench_session ON jobs(workbench_session_id,status,id)");
try { db.exec("ALTER TABLE memory_events ADD COLUMN scene_no INTEGER NOT NULL DEFAULT 1"); } catch {}
try { db.exec("ALTER TABLE memory_events ADD COLUMN source_line_start INTEGER"); } catch {}
try { db.exec("ALTER TABLE memory_events ADD COLUMN source_line_end INTEGER"); } catch {}
try { db.exec("ALTER TABLE memory_events ADD COLUMN qualifier_text TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE memory_events ADD COLUMN result_text TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE memory_events ADD COLUMN embedding_json TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE memory_events ADD COLUMN embedding_model TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE memory_events ADD COLUMN embedded_at TEXT"); } catch {}
try { db.exec("ALTER TABLE memory_events ADD COLUMN timeline_type TEXT NOT NULL DEFAULT 'main'"); } catch {}
try { db.exec("ALTER TABLE memory_temporal_relations ADD COLUMN marker_kind TEXT NOT NULL DEFAULT 'relative'"); } catch {}
try { db.exec("ALTER TABLE memory_temporal_relations ADD COLUMN precision TEXT NOT NULL DEFAULT 'relative'"); } catch {}
try { db.exec("ALTER TABLE memory_temporal_relations ADD COLUMN relation_role TEXT NOT NULL DEFAULT 'occurrence'"); } catch {}
try { db.exec("ALTER TABLE memory_temporal_relations ADD COLUMN target_label TEXT NOT NULL DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE memory_events ADD COLUMN timeline_label TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE memory_events ADD COLUMN temporal_anchor TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE memory_events ADD COLUMN temporal_relation TEXT NOT NULL DEFAULT 'unknown'"); } catch {}
try { db.exec("ALTER TABLE memory_events ADD COLUMN snapshot_effect TEXT NOT NULL DEFAULT 'advance_current'"); } catch {}
try { db.exec("ALTER TABLE memory_relationship_changes ADD COLUMN temporal_scope TEXT NOT NULL DEFAULT 'current'"); } catch {}
try { db.exec("ALTER TABLE memory_golden_changes ADD COLUMN temporal_scope TEXT NOT NULL DEFAULT 'current'"); } catch {}
try { db.exec("ALTER TABLE memory_prop_changes ADD COLUMN temporal_scope TEXT NOT NULL DEFAULT 'current'"); } catch {}
try { db.exec("ALTER TABLE memory_important_props ADD COLUMN origin_text TEXT NOT NULL DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE memory_prop_changes ADD COLUMN origin_text TEXT NOT NULL DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE memory_secondary_characters ADD COLUMN temporal_scope TEXT NOT NULL DEFAULT 'advance_current'"); } catch {}
try { db.exec("ALTER TABLE memory_links ADD COLUMN thread_hint TEXT DEFAULT ''"); } catch {}
// 旧版会把所有相邻事件默认串成“继续”。这些边只表示顺序，不是可靠的剧情关系。
db.exec("DELETE FROM memory_links WHERE relation='\u7ee7\u7eed'");
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
export function detachLegacyStoryStateFromControls(projectId) {
  const artifact=get("SELECT id,content_json FROM artifacts WHERE project_id=@pid AND type='control_settings'",{pid:Number(projectId)});
  if(!artifact)return false;
  const content=json(artifact.content_json,{});if(content.story_state_detached)return false;
  const labels={fact:"既定事实",knowledge:"人物认知",relationship:"人物关系",capability:"能力或身份变化",system:"系统状态",character:"次要人物",prop:"道具",unresolved:"未解决事件",goal:"当前目标",foreshadow:"伏笔",identity:"身份"};
  const legacy=new Set(all("SELECT category,subject,value FROM story_state WHERE project_id=@pid",{pid:Number(projectId)}).flatMap(item=>{
    const label=labels[item.category]||item.category,body=`${item.subject}：${item.value}`;
    return [`【${label}】${body}`,`【${item.category}】${body}`];
  }).map(line=>line.trim()));
  const before=String(content.hard_constraints||"");
  const after=before.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!legacy.has(line)).join("\n");
  const next={...content,hard_constraints:after,story_state_detached:true};
  run("UPDATE artifacts SET content_json=@content,version=version+1,updated_at=@time WHERE id=@id",{content:JSON.stringify(next),time:now(),id:artifact.id});
  return before!==after;
}

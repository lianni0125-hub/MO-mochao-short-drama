import Parser from "rss-parser";
import { all, get, run, now } from "./db.js";

export function searchKnowledge(query = "", library = "", limit = 20) {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  let sql = "SELECT k.*, s.name source_name FROM knowledge_items k LEFT JOIN sources s ON s.id=k.source_id WHERE 1=1";
  const params = {};
  if (library) { sql += " AND k.library=@library"; params.library = library; }
  if (terms.length) {
    sql += " AND (" + terms.map((_, i) => `(k.title LIKE @q${i} OR k.summary LIKE @q${i} OR k.content LIKE @q${i} OR k.tags_json LIKE @q${i})`).join(" AND ") + ")";
    terms.forEach((t, i) => { params[`q${i}`] = `%${t}%`; });
  }
  sql += " ORDER BY COALESCE(k.published_at,k.snapshot_date) DESC LIMIT @limit";
  params.limit = Number(limit);
  return all(sql, params).map(x => ({ ...x, tags: JSON.parse(x.tags_json || "[]"), narrative: JSON.parse(x.narrative_json || "{}") }));
}

export async function updateSource(source) {
  if (!source.enabled) return { skipped: true, count: 0 };
  if (source.kind !== "rss") throw new Error("当前自动更新器支持 RSS；其他来源可通过手动导入接入。 ");
  const parser = new Parser({ timeout: 15000 });
  const feed = await parser.parseURL(source.url);
  let count = 0;
  const snapshot = new Date().toISOString().slice(0, 10);
  for (const item of feed.items.slice(0, 100)) {
    const url = item.link || item.guid || "";
    try {
      run(`INSERT INTO knowledge_items(source_id,library,external_id,title,summary,content,published_at,snapshot_date,source_url,narrative_json)
           VALUES(@source_id,@library,@external_id,@title,@summary,@content,@published_at,@snapshot_date,@source_url,@narrative_json)`, {
        source_id: source.id, library: source.library || "reality", external_id: item.guid || url,
        title: item.title || "未命名", summary: item.contentSnippet || "", content: item.content || "",
        published_at: item.isoDate || item.pubDate || null, snapshot_date: snapshot, source_url: url,
        narrative_json: JSON.stringify({ scene: "待抽象", roles: [], conflict: "待抽象", transferable_mechanism: "待抽象" })
      }); count++;
    } catch (error) { if (!String(error.message).includes("UNIQUE")) throw error; }
  }
  run("UPDATE sources SET last_run_at=@time,last_status=@status WHERE id=@id", { time: now(), status: `ok:${count}`, id: source.id });
  return { count };
}

export async function updateAllSources() {
  const results = [];
  for (const source of all("SELECT * FROM sources WHERE enabled=1")) {
    try { results.push({ source: source.name, ...(await updateSource(source)) }); }
    catch (error) { run("UPDATE sources SET last_run_at=@time,last_status=@status WHERE id=@id", { time: now(), status: `error:${error.message}`, id: source.id }); results.push({ source: source.name, error: error.message }); }
  }
  return results;
}


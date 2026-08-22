export const STAGES = [
  { id: "idea", label: "灵感孵化", artifact: "idea" },
  { id: "planning", label: "故事策划", artifact: "planning" },
  { id: "characters", label: "人物人设", artifact: "characters" },
  { id: "constraints", label: "卡点与硬约束", artifact: "cards" },
  { id: "outline", label: "分集梗概", artifact: "outline" },
  { id: "writing", label: "分级剧本生成", artifact: null }
];

export const ARTIFACT_TITLES = {
  idea: "已批准创意",
  planning: "故事策划",
  benchmark: "对标和改编",
  synopsis: "故事梗概",
  cards: "集数和付费卡点",
  expectations: "核心期待与画面对标",
  characters: "人物人设",
  character_brief: "人物补充要求",
  skeleton: "故事骨架：主线·秘密·结局·卡点",
  outline: "分集梗概"
};

export const STATE_CATEGORIES = ["knowledge", "relationship", "goal", "fact", "foreshadow", "prop", "identity", "capability", "system", "character", "unresolved"];

export function canonicalRelationshipSubject(subject) {
  const parts=String(subject||"").split(/\s*(?:↔|与|和|—|-)\s*/).map(x=>x.trim()).filter(Boolean);
  if(parts.length!==2||parts.some(x=>x.length>24))return String(subject||"").trim();
  return parts.sort((a,b)=>a.localeCompare(b,"zh-CN")).join(" ↔ ");
}

export function parseProject(row) {
  if (!row) return null;
  return { ...row, tags: JSON.parse(row.tags_json || "[]") };
}

export function parseArtifact(row) {
  if (!row) return null;
  return { ...row, content: JSON.parse(row.content_json || "{}") };
}

import { updateAllSources } from "../knowledge.js";
const results = await updateAllSources();
console.log(JSON.stringify({ updatedAt: new Date().toISOString(), results }, null, 2));


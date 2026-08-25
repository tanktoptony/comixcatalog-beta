import fs from "node:fs";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
const targets = JSON.parse(fs.readFileSync("gap-user-collected.json", "utf8"));
const names = [...new Set(targets.map((target) => target.name).filter(Boolean))];
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await supabase
  .from("series")
  .select("id,title,year_start_cached")
  .in("title", names)
  .order("id", { ascending: true });
if (error) throw error;

const targetKeys = new Set(targets.map((target) => `${String(target.name).toLowerCase()}|${target.year ?? ""}`));
const ids = (data ?? [])
  .filter((row) => targetKeys.has(`${String(row.title).toLowerCase()}|${row.year_start_cached ?? ""}`) || names.includes(row.title))
  .map((row) => row.id);

if (!ids.length) throw new Error("No matching series rows found for gap-user-collected.json");
console.log(`Refreshing ${ids.length} user-collected gap series cache rows`);
const result = spawnSync(process.execPath, ["scripts/refreshSeriesSearchCache.js", "--force", `--only-ids=${ids.join(",")}`], { stdio: "inherit" });
process.exitCode = result.status ?? 1;

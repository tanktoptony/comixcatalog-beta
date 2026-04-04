import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({
  path: path.resolve(__dirname, '../.env.local'),
});

import { createClient } from "@supabase/supabase-js";

console.log("URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log("SERVICE:", process.env.SUPABASE_SERVICE_ROLE_KEY);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  let totalUpdated = 0;

  while (true) {
    const { data, error } = await supabase.rpc("fix_series_batch");

    if (error) {
      console.error(error);
      break;
    }

    console.log("Updated:", data);

    totalUpdated += data;

    if (data === 0) break;
  }

  console.log("DONE. Total updated:", totalUpdated);
}

run();
// Creates the two storage buckets seller photos need (Marketplace v2 Phase 1).
// Safe to re-run: existing buckets are left as they are and reported.
//
//   listing-photo-originals  private. Phone uploads land here through a
//                            one-time signed URL, get processed, and are
//                            deleted. Never readable by the public.
//   listing-photos           public. Only the server writes here: 1600px
//                            WebP plus a 400px thumb, metadata stripped.
//
//   node scripts/createListingPhotoBuckets.js

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local", quiet: true });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BUCKETS = [
  {
    id: "listing-photo-originals",
    options: { public: false, fileSizeLimit: "15MB", allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] },
  },
  {
    id: "listing-photos",
    options: { public: true, fileSizeLimit: "3MB", allowedMimeTypes: ["image/webp"] },
  },
];

(async () => {
  for (const { id, options } of BUCKETS) {
    const { data: existing, error: getError } = await sb.storage.getBucket(id);
    if (existing) {
      console.log(`${id}: already exists (public: ${existing.public})`);
      continue;
    }
    if (getError && !/not found/i.test(getError.message)) throw getError;
    const { error } = await sb.storage.createBucket(id, options);
    if (error) throw error;
    console.log(`${id}: created (public: ${options.public})`);
  }
})().catch((err) => {
  console.error("Bucket setup failed:", err.message || err);
  process.exit(1);
});

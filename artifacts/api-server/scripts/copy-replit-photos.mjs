// One-off: copies coach photos and dictionary pictures out of Replit Object
// Storage into the stored_files table of the new database.
// Run in the Replit Shell (it needs Replit's storage connection):
//   cd artifacts/api-server
//   TARGET_DATABASE_URL="postgresql://..." node scripts/copy-replit-photos.mjs

import { Storage } from "@google-cloud/storage";
import pg from "pg";

const target = process.env.TARGET_DATABASE_URL;
const dir = process.env.PRIVATE_OBJECT_DIR;
if (!target) throw new Error("Set TARGET_DATABASE_URL to the new database's connection string.");
if (!dir) throw new Error("PRIVATE_OBJECT_DIR is not set. Run this in the Replit Shell.");

const sidecar = "http://127.0.0.1:1106";
const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${sidecar}/token`,
    type: "external_account",
    credential_source: {
      url: `${sidecar}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

const [bucketName, ...rest] = dir.replace(/^\/+|\/+$/g, "").split("/");
const prefix = rest.join("/");
const bucket = storage.bucket(bucketName);

const client = new pg.Client({ connectionString: target });
await client.connect();
await client.query(`CREATE TABLE IF NOT EXISTS stored_files (
  key text PRIMARY KEY, content_type text NOT NULL, data bytea NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL)`);

let copied = 0;
let bytes = 0;
for (const folder of ["coach-images/", "dictionary-images/"]) {
  const [files] = await bucket.getFiles({ prefix: prefix ? `${prefix}/${folder}` : folder });
  for (const file of files) {
    const key = prefix ? file.name.slice(prefix.length + 1) : file.name;
    const [data] = await file.download();
    const contentType = file.metadata.contentType || "application/octet-stream";
    await client.query(
      `INSERT INTO stored_files (key, content_type, data) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET content_type = EXCLUDED.content_type, data = EXCLUDED.data`,
      [key, contentType, data],
    );
    copied += 1;
    bytes += data.length;
    if (copied % 25 === 0) console.log(`copied ${copied} photos...`);
  }
}
await client.end();
console.log(`Done: copied ${copied} photos (${(bytes / 1024 / 1024).toFixed(1)} MB).`);

---
name: Bulk row transport through executeSql
description: Moving whole tables between prod and dev through the SQL callback without CSV corruption.
---

`executeSql` returns CSV text — unsafe to parse for columns containing free text (commas, quotes, newlines in note content). For bulk export, wrap the query so it returns ONE opaque value: `replace(encode(convert_to(coalesce(json_agg(t ORDER BY (t.ord))::text,'[]'),'UTF8'),'base64'), chr(10), '')`, fetched in `substr(expr, off, 60000)` slices until empty, then decode+`JSON.parse`.

**Why:** CSV quoting mangled multi-line content; single-cell base64 JSON survives any content, and slicing beats output truncation. The ORDER BY inside json_agg matters — each slice re-runs the query, so row order must be deterministic or the concatenated string is garbage.

**How to apply:** Also: the CodeExecution durable scope has NO `Buffer` (write a manual base64 decoder or use atob/TextDecoder), and `row_to_json` output keys are snake_case — map to drizzle's camelCase TS names generically and fail loudly on unknown columns so nothing is silently dropped. Timestamps arrive as ISO strings (convert *At keys to Date); jsonb arrives pre-parsed.

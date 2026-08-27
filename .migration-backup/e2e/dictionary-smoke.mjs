// Full dictionary rollout smoke test against the restarted runtime.
// It creates throwaway admin/non-admin accounts and cleans up every row.
import { chromium } from "playwright-core";
import pg from "pg";

const BASE = "https://" + process.env.REPLIT_DEV_DOMAIN;
const PASSWORD = "Test1234!";
const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const createdUserIds = [];
const createdEntryIds = [];
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let browser;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(page, method, path, body) {
  return await page.evaluate(
    async ({ method, path, body }) => {
      const response = await fetch(path, {
        method,
        credentials: "include",
        headers: body === undefined ? {} : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      let json = null;
      try {
        json = await response.json();
      } catch {}
      return { status: response.status, json };
    },
    { method, path, body },
  );
}

async function register(page, role) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  const email = `dictionary-${role}-${nonce}@test.local`;
  const response = await api(page, "POST", "/api/auth/register", {
    email,
    password: PASSWORD,
    displayName: `Dictionary ${role}`,
  });
  assert(response.status === 201, `${role} registration failed: ${response.status}`);
  createdUserIds.push(response.json.id);
  return response.json;
}

async function cleanup() {
  if (createdEntryIds.length > 0) {
    await pool.query(
      "DELETE FROM dictionary_suggestions WHERE entry_id = ANY($1::int[])",
      [createdEntryIds],
    );
    await pool.query(
      "DELETE FROM skills WHERE dictionary_entry_id = ANY($1::int[])",
      [createdEntryIds],
    );
    await pool.query(
      "DELETE FROM dictionary_entries WHERE id = ANY($1::int[])",
      [createdEntryIds],
    );
  }
  if (createdUserIds.length > 0) {
    await pool.query(
      "DELETE FROM sessions WHERE sess->>'userId' = ANY($1::text[])",
      [createdUserIds],
    );
    await pool.query(
      "DELETE FROM users WHERE id = ANY($1::text[])",
      [createdUserIds],
    );
  }
}

try {
  browser = await chromium.launch({ headless: true });
  const athleteContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const adminContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const athletePage = await athleteContext.newPage();
  const adminPage = await adminContext.newPage();
  const athlete = await register(athletePage, "athlete");
  const admin = await register(adminPage, "admin");
  await pool.query("UPDATE users SET is_admin = true WHERE id = $1", [admin.id]);

  const active = await api(adminPage, "POST", "/api/dictionary", {
    name: `Barani ${nonce}`,
    code: `41o-${nonce.slice(-4)}`,
    isDrill: 0,
    difficulty: 0.6,
    description: "Dictionary rollout smoke entry",
  });
  assert(active.status === 201, `admin create failed: ${active.status}`);
  createdEntryIds.push(active.json.id);

  const archived = await api(adminPage, "POST", "/api/dictionary", {
    name: `Archived ${nonce}`,
    code: `AR-${nonce.slice(-4)}`,
    isDrill: 1,
    difficulty: 0,
  });
  assert(archived.status === 201, `second admin create failed: ${archived.status}`);
  createdEntryIds.push(archived.json.id);
  const archivedUpdate = await api(
    adminPage,
    "PUT",
    `/api/dictionary/${archived.json.id}`,
    { archived: 1 },
  );
  assert(archivedUpdate.status === 200, "admin archive failed");

  const athleteList = await api(athletePage, "GET", "/api/dictionary");
  assert(athleteList.status === 200 && Array.isArray(athleteList.json), "athlete list is not JSON");
  assert(athleteList.json.some((entry) => entry.id === active.json.id), "active entry hidden");
  assert(!athleteList.json.some((entry) => entry.id === archived.json.id), "archived entry leaked");

  for (const [method, path, body] of [
    ["POST", "/api/dictionary", { name: "Forbidden", code: "NO", difficulty: 0 }],
    ["PUT", `/api/dictionary/${active.json.id}`, { name: "Forbidden" }],
    ["GET", "/api/dictionary/suggestions", undefined],
    ["POST", "/api/dictionary/suggestions/999999/resolve", { action: "reject" }],
  ]) {
    const forbidden = await api(athletePage, method, path, body);
    assert(forbidden.status === 403, `${method} ${path} should be 403, got ${forbidden.status}`);
  }

  const [adoptOne, adoptTwo] = await Promise.all([
    api(athletePage, "POST", `/api/dictionary/${active.json.id}/adopt`),
    api(athletePage, "POST", `/api/dictionary/${active.json.id}/adopt`),
  ]);
  assert(adoptOne.status === 200 && adoptTwo.status === 200, "rapid adoption failed");
  assert(adoptOne.json.skill.id === adoptTwo.json.skill.id, "rapid adoption created different copies");

  const legacyRetry = await api(athletePage, "POST", "/api/skills", {
    name: "Forged name",
    code: "FORGED",
    difficulty: 29,
    isDrill: 1,
    dictionaryEntryId: active.json.id,
  });
  assert(legacyRetry.status === 201, "legacy queued adoption compatibility failed");
  assert(legacyRetry.json.id === adoptOne.json.skill.id, "legacy retry duplicated adoption");
  assert(legacyRetry.json.name === active.json.name, "legacy retry trusted forged copied fields");

  const skillsList = await api(athletePage, "GET", "/api/skills");
  const linked = skillsList.json.filter(
    (skill) => skill.dictionaryEntryId === active.json.id,
  );
  assert(linked.length === 1, `expected one adopted copy, got ${linked.length}`);

  const forgeUpdate = await api(
    athletePage,
    "PUT",
    `/api/skills/${linked[0].id}`,
    { dictionaryEntryId: archived.json.id },
  );
  assert(forgeUpdate.status === 400, "provenance update should be rejected");
  const archiveCopy = await api(
    athletePage,
    "PUT",
    `/api/skills/${linked[0].id}`,
    { archived: 1 },
  );
  assert(archiveCopy.status === 200, "personal archive failed");
  const restore = await api(
    athletePage,
    "POST",
    `/api/dictionary/${active.json.id}/adopt`,
  );
  assert(
    restore.status === 200 &&
      restore.json.status === "restored" &&
      restore.json.skill.id === linked[0].id &&
      restore.json.skill.archived === 0,
    "archived copy was not restored in place",
  );
  assert(
    (await api(athletePage, "POST", `/api/dictionary/${archived.json.id}/adopt`)).status === 404,
    "archived dictionary entry was adoptable",
  );
  assert(
    (await api(athletePage, "POST", "/api/dictionary/2147483647/adopt")).status === 404,
    "missing dictionary entry was adoptable",
  );

  const suggestionName = `Regional ${nonce}`;
  await athletePage.goto(BASE + "/skills/dictionary", { waitUntil: "networkidle" });
  await athletePage.getByTestId("input-library-search").fill(active.json.code);
  await athletePage.getByTestId(`button-actions-dict-${active.json.id}`).click();
  await athletePage.getByTestId(`menu-suggest-${active.json.id}`).click();
  await athletePage.getByTestId("input-suggest-name").fill(suggestionName);
  await athletePage.getByTestId("input-suggest-note").fill("Smoke test");
  await athletePage.getByTestId("button-send-suggestion").click();
  await athletePage.getByText("Suggestion sent", { exact: true }).waitFor();

  const suggestRetry = await api(
    athletePage,
    "POST",
    `/api/dictionary/${active.json.id}/suggest`,
    {
      suggestedName: ` ${suggestionName.toUpperCase()} `,
      note: "Retry",
    },
  );
  assert(
    suggestRetry.status === 409,
    `suggestion retry was not unique: ${suggestRetry.status}`,
  );

  await adminPage.goto(BASE + "/skills/dictionary", { waitUntil: "networkidle" });
  await adminPage.getByTestId("button-review-suggestions").waitFor();
  await adminPage.getByTestId("button-add-skill").waitFor();
  await adminPage.getByTestId("badge-pending-count").waitFor();
  const pending = await api(adminPage, "GET", "/api/dictionary/suggestions");
  const pendingSuggestion = pending.json.find(
    (suggestion) => suggestion.entryId === active.json.id,
  );
  assert(pendingSuggestion, "pending suggestion not visible to admin");
  const accepted = await api(
    adminPage,
    "POST",
    `/api/dictionary/suggestions/${pendingSuggestion.id}/resolve`,
    { action: "accept" },
  );
  assert(accepted.status === 200, "suggestion acceptance failed");
  assert(
    (await api(
      adminPage,
      "POST",
      `/api/dictionary/suggestions/${pendingSuggestion.id}/resolve`,
      { action: "accept" },
    )).status === 404,
    "resolved suggestion accepted twice",
  );
  const adminList = await api(adminPage, "GET", "/api/dictionary");
  const updatedEntry = adminList.json.find((entry) => entry.id === active.json.id);
  assert(updatedEntry.altNames.includes(suggestionName), "accepted alternate name missing");

  const rejectCandidate = await api(
    athletePage,
    "POST",
    `/api/dictionary/${active.json.id}/suggest`,
    { suggestedName: `Reject ${nonce}` },
  );
  assert(rejectCandidate.status === 201, "reject candidate submission failed");
  const rejected = await api(
    adminPage,
    "POST",
    `/api/dictionary/suggestions/${rejectCandidate.json.id}/resolve`,
    { action: "reject" },
  );
  assert(rejected.status === 200, "suggestion rejection failed");

  await athletePage.goto(BASE + "/skills", { waitUntil: "networkidle" });
  await athletePage.getByTestId("button-open-dictionary").click();
  await athletePage.waitForURL("**/skills/dictionary");
  await athletePage.getByTestId("input-library-search").fill(active.json.code);
  await athletePage.getByTestId(`row-dict-${active.json.id}`).waitFor();
  await athletePage.getByTestId(`status-added-${active.json.id}`).waitFor();
  assert(
    (await athletePage.getByTestId("button-add-skill").count()) === 0,
    "non-admin saw dictionary editor",
  );
  assert(
    (await athletePage.getByTestId("button-review-suggestions").count()) === 0,
    "non-admin saw review queue",
  );

  console.log("dictionary smoke: PASS");
} finally {
  await browser?.close();
  await cleanup();
  await pool.end();
}
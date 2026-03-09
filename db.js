import fs from "fs/promises";
import path from "path";

const DATA_DIR = path.resolve("./data");
const DB_FILE = path.join(DATA_DIR, "db.json");

async function ensureDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DB_FILE);
  } catch {
    const seed = { issues: [], responses: [] };
    await fs.writeFile(DB_FILE, JSON.stringify(seed, null, 2), "utf8");
  }
}

async function loadDb() {
  await ensureDb();
  const raw = await fs.readFile(DB_FILE, "utf8");
  return JSON.parse(raw);
}

async function saveDb(db) {
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}

function simplifyIssue(issue) {
  const fields = issue?.fields || {};
  return {
    key: issue?.key,
    summary: fields.summary || "",
    description: extractText(fields.description),
    status: fields.status?.name || "",
    priority: fields.priority?.name || "",
    reporter: fields.reporter?.displayName || fields.reporter?.name || "",
    assignee: fields.assignee?.displayName || fields.assignee?.name || "",
    created: fields.created || "",
    updated: fields.updated || "",
  };
}

function extractText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object") return String(value);

  // Jira Cloud description/comment fields are Atlassian Document Format (ADF).
  if (value.type === "doc" && Array.isArray(value.content)) {
    return flattenAdfText(value).trim();
  }

  return JSON.stringify(value);
}

function flattenAdfText(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(flattenAdfText).join(" ");
  if (node.type === "text" && node.text) return node.text;
  if (node.content) return flattenAdfText(node.content);
  return "";
}

export async function upsertIssue(payload) {
  const issue = payload?.issue || payload;
  if (!issue?.key) return null;

  const simplified = simplifyIssue(issue);
  const db = await loadDb();
  const existingIndex = db.issues.findIndex((i) => i.key === simplified.key);
  const record = {
    ...simplified,
    raw: issue,
    eventType: payload?.webhookEvent || "",
    lastSeenAt: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    db.issues[existingIndex] = { ...db.issues[existingIndex], ...record };
  } else {
    db.issues.unshift(record);
  }

  await saveDb(db);
  return record;
}

export async function listIssues() {
  const db = await loadDb();
  return db.issues;
}

export async function getIssue(key) {
  const db = await loadDb();
  return db.issues.find((i) => i.key === key);
}

export async function addResponse(key, responseText) {
  const db = await loadDb();
  const response = {
    id: cryptoRandomId(),
    key,
    responseText,
    createdAt: new Date().toISOString(),
  };
  db.responses.unshift(response);
  await saveDb(db);
  return response;
}

export async function listResponses(key) {
  const db = await loadDb();
  return db.responses.filter((r) => r.key === key);
}

function cryptoRandomId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

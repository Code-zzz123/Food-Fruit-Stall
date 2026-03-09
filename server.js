import "dotenv/config";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan("dev"));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const config = getSupabaseConfig();
    const email = String(req.body?.email || "").trim();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required." });
    }

    const session = await supabasePasswordAuth(config, { email, password, mode: "login" });
    res.json(session);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

app.post("/api/auth/signup", async (req, res) => {
  try {
    const config = getSupabaseConfig();
    const email = String(req.body?.email || "").trim();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required." });
    }

    const session = await supabasePasswordAuth(config, { email, password, mode: "signup" });
    res.json(session);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/auth/session", async (req, res) => {
  try {
    const config = getSupabaseConfig();
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "missing token" });

    const user = await verifyAccessToken(config, token);
    if (!user) return res.status(401).json({ error: "invalid token" });

    res.json({ user });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

app.get("/api/entries", async (req, res) => {
  try {
    const config = getSupabaseConfig();
    const auth = await requireAuth(req, res, config);
    if (!auth) return;
    const limit = normalizeLimit(req.query.limit);

    const rows = await fetchRows(config, limit, auth.token);
    const records = rows
      .map((row) => ({ ...row, __recordId: row[config.idColumn] }))
      .filter((row) => row.__recordId !== undefined && row.__recordId !== null);
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/entries/:id", async (req, res) => {
  try {
    const config = getSupabaseConfig();
    const auth = await requireAuth(req, res, config);
    if (!auth) return;
    const id = req.params.id;

    const row = await fetchRowById(config, id, auth.token);
    if (!row) {
      return res.status(404).json({ error: "not found" });
    }

    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/entries", async (req, res) => {
  try {
    const config = getSupabaseConfig();
    const auth = await requireAuth(req, res, config);
    if (!auth) return;
    const payload = normalizeInsertPayload(req.body);

    if (!Object.keys(payload).length) {
      return res.status(400).json({ error: "Request body must include at least one field." });
    }

    const created = await insertRow(config, payload, auth.token);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/entries/:id/buyers", async (req, res) => {
  try {
    const config = getSupabaseConfig();
    const auth = await requireAuth(req, res, config);
    if (!auth) return;
    const buyersConfig = getBuyersConfig();

    if (!buyersConfig.table) {
      return res.json([]);
    }

    const row = await fetchRowById(config, req.params.id, auth.token);
    if (!row) {
      return res.status(404).json({ error: "not found" });
    }

    const fruitValue = row[buyersConfig.foodFruitColumn];
    if (fruitValue === undefined || fruitValue === null || String(fruitValue).trim() === "") {
      return res.json([]);
    }

    const buyers = await fetchRelatedRows(config, buyersConfig, fruitValue, auth.token);
    res.json(buyers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/buyers", async (req, res) => {
  try {
    const config = getSupabaseConfig();
    const auth = await requireAuth(req, res, config);
    if (!auth) return;
    const buyersConfig = getBuyersConfig();
    const fruitName = String(req.query.fruitName || "").trim();

    if (!buyersConfig.table) {
      return res.json([]);
    }

    let buyers;
    if (fruitName) {
      buyers = await fetchRelatedRows(config, buyersConfig, fruitName, auth.token);
    } else {
      buyers = await fetchBuyersRows(config, buyersConfig, auth.token);
    }
    res.json(buyers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/buyers", async (req, res) => {
  try {
    const config = getSupabaseConfig();
    const auth = await requireAuth(req, res, config);
    if (!auth) return;
    const buyersConfig = getBuyersConfig();

    if (!buyersConfig.table) {
      return res.status(400).json({ error: "SUPABASE_BUYERS_TABLE is not configured." });
    }

    const payload = normalizeBuyerPayload(req.body);
    if (!Object.keys(payload).length) {
      return res.status(400).json({ error: "Request body must include at least one field." });
    }

    const created = await insertRowIntoTable(config, buyersConfig.table, payload, auth.token);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const anonKey = (process.env.SUPABASE_ANON_KEY || "").trim();
  const table = (process.env.SUPABASE_TABLE || "").trim();
  const idColumn = (process.env.SUPABASE_ID_COLUMN || "id").trim();
  const orderColumn = (process.env.SUPABASE_ORDER_COLUMN || idColumn).trim();

  if (!url || !anonKey || !table) {
    throw new Error(
      "Missing Supabase config. Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_TABLE in .env."
    );
  }

  return { url, anonKey, table, idColumn, orderColumn };
}

function getBuyersConfig() {
  const table = (process.env.SUPABASE_BUYERS_TABLE || "").trim();
  const foodFruitColumn = (process.env.SUPABASE_FOOD_FRUIT_COLUMN || "Fruit Name").trim();
  const buyersFruitColumn = (process.env.SUPABASE_BUYERS_FRUIT_COLUMN || "Fruit Name").trim();
  const buyersOrderColumn = (process.env.SUPABASE_BUYERS_ORDER_COLUMN || "").trim();

  return { table, foodFruitColumn, buyersFruitColumn, buyersOrderColumn };
}

function normalizeLimit(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return 100;
  return Math.max(1, Math.min(parsed, 500));
}

async function fetchRows(config, limit, authToken) {
  const { table, orderColumn } = config;
  const params = new URLSearchParams({
    select: "*",
    order: `${orderColumn}.desc`,
    limit: String(limit),
  });

  return requestSupabase(config, {
    pathWithQuery: `/${encodeURIComponent(table)}?${params.toString()}`,
    authToken,
  });
}

async function fetchRowById(config, id, authToken) {
  const { table, idColumn } = config;
  const filterValue = encodeFilterValue(id);
  const params = new URLSearchParams({
    select: "*",
    [idColumn]: `eq.${filterValue}`,
    limit: "1",
  });

  const rows = await requestSupabase(config, {
    pathWithQuery: `/${encodeURIComponent(table)}?${params.toString()}`,
    authToken,
  });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function insertRow(config, payload, authToken) {
  return insertRowIntoTable(config, config.table, payload, authToken);
}

async function insertRowIntoTable(config, tableName, payload, authToken) {
  const rows = await requestSupabase(config, {
    method: "POST",
    pathWithQuery: `/${encodeURIComponent(tableName)}?select=*`,
    body: payload,
    authToken,
    extraHeaders: {
      Prefer: "return=representation",
    },
  });

  if (!Array.isArray(rows) || !rows.length) {
    throw new Error("Insert succeeded but no row was returned.");
  }

  return rows[0];
}

async function fetchRelatedRows(config, buyersConfig, fruitValue, authToken) {
  const { table, buyersFruitColumn, buyersOrderColumn } = buyersConfig;
  const params = new URLSearchParams({
    select: "*",
    [buyersFruitColumn]: `eq.${encodeFilterValue(fruitValue)}`,
  });

  if (buyersOrderColumn) {
    params.set("order", `${buyersOrderColumn}.desc`);
  }

  return requestSupabase(config, {
    pathWithQuery: `/${encodeURIComponent(table)}?${params.toString()}`,
    authToken,
  });
}

async function fetchBuyersRows(config, buyersConfig, authToken) {
  const { table, buyersOrderColumn } = buyersConfig;
  const params = new URLSearchParams({ select: "*" });
  if (buyersOrderColumn) {
    params.set("order", `${buyersOrderColumn}.desc`);
  }

  return requestSupabase(config, {
    pathWithQuery: `/${encodeURIComponent(table)}?${params.toString()}`,
    authToken,
  });
}

function encodeFilterValue(id) {
  if (id === null || id === undefined) return "";
  return String(id).trim();
}

async function requestSupabase(
  config,
  { method = "GET", pathWithQuery, body = null, authToken = "", extraHeaders = {} }
) {
  const url = `${config.url}/rest/v1${pathWithQuery}`;
  const headers = {
    apikey: config.anonKey,
    Authorization: `Bearer ${authToken || config.anonKey}`,
    Accept: "application/json",
    ...extraHeaders,
  };
  let requestBody;

  if (body !== null && body !== undefined) {
    headers["Content-Type"] = "application/json";
    requestBody = JSON.stringify(body);
  }

  const response = await fetch(url, {
    method,
    headers,
    body: requestBody,
  });

  const text = await response.text();
  const payload = safeJson(text);

  if (!response.ok) {
    const message = payload?.message || payload?.error || text || `Supabase error ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function getBearerToken(req) {
  const auth = String(req.get("authorization") || "");
  if (!auth.toLowerCase().startsWith("bearer ")) return "";
  return auth.slice(7).trim();
}

async function verifyAccessToken(config, token) {
  if (!token) return null;
  const response = await fetch(`${config.url}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) return null;
  return response.json();
}

async function requireAuth(req, res, config) {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Authentication required." });
    return null;
  }

  const user = await verifyAccessToken(config, token);
  if (!user) {
    res.status(401).json({ error: "Invalid or expired session. Please log in again." });
    return null;
  }

  return { token, user };
}

async function supabasePasswordAuth(config, { email, password, mode }) {
  const path =
    mode === "signup"
      ? `${config.url}/auth/v1/signup`
      : `${config.url}/auth/v1/token?grant_type=password`;
  const response = await fetch(path, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const text = await response.text();
  const payload = safeJson(text);
  if (!response.ok) {
    throw new Error(payload?.msg || payload?.error_description || payload?.message || "Authentication failed.");
  }
  return payload;
}

function normalizeInsertPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be a JSON object.");
  }

  const payload = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === "__recordId") continue;
    payload[key] = value;
  }

  // Accept common key variants from the UI or older cached frontend bundles.
  if (payload["fruit name"] !== undefined && payload["Fruit Name"] === undefined) {
    payload["Fruit Name"] = payload["fruit name"];
    delete payload["fruit name"];
  }
  if (payload.color !== undefined && payload.Color === undefined) {
    payload.Color = payload.color;
    delete payload.color;
  }
  if (payload.price !== undefined && payload.Price === undefined) {
    payload.Price = payload.price;
    delete payload.price;
  }
  if (payload["where to buy"] !== undefined && payload["Where To Buy"] === undefined) {
    payload["Where To Buy"] = payload["where to buy"];
    delete payload["where to buy"];
  }

  return payload;
}

function normalizeBuyerPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be a JSON object.");
  }

  const payload = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === "__recordId") continue;
    payload[key] = value;
  }

  if (payload["buyer name"] !== undefined && payload["Buyer Name"] === undefined) {
    payload["Buyer Name"] = payload["buyer name"];
    delete payload["buyer name"];
  }
  if (payload["fruit name"] !== undefined && payload["Fruit Name"] === undefined) {
    payload["Fruit Name"] = payload["fruit name"];
    delete payload["fruit name"];
  }
  if (payload.quantity !== undefined && payload["Quantity Bought"] === undefined) {
    payload["Quantity Bought"] = payload.quantity;
    delete payload.quantity;
  }

  return payload;
}

function safeJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

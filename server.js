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

app.get("/api/entries", async (req, res) => {
  try {
    const config = getSupabaseConfig();
    const limit = normalizeLimit(req.query.limit);

    const rows = await fetchRows(config, limit);
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
    const id = req.params.id;

    const row = await fetchRowById(config, id);
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
    const payload = normalizeInsertPayload(req.body);

    if (!Object.keys(payload).length) {
      return res.status(400).json({ error: "Request body must include at least one field." });
    }

    const created = await insertRow(config, payload);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/entries/:id/buyers", async (req, res) => {
  try {
    const config = getSupabaseConfig();
    const buyersConfig = getBuyersConfig();

    if (!buyersConfig.table) {
      return res.json([]);
    }

    const row = await fetchRowById(config, req.params.id);
    if (!row) {
      return res.status(404).json({ error: "not found" });
    }

    const fruitValue = row[buyersConfig.foodFruitColumn];
    if (fruitValue === undefined || fruitValue === null || String(fruitValue).trim() === "") {
      return res.json([]);
    }

    const buyers = await fetchRelatedRows(config, buyersConfig, fruitValue);
    res.json(buyers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/buyers", async (req, res) => {
  try {
    const config = getSupabaseConfig();
    const buyersConfig = getBuyersConfig();
    const fruitName = String(req.query.fruitName || "").trim();

    if (!buyersConfig.table) {
      return res.json([]);
    }

    let buyers;
    if (fruitName) {
      buyers = await fetchRelatedRows(config, buyersConfig, fruitName);
    } else {
      buyers = await fetchBuyersRows(config, buyersConfig);
    }
    res.json(buyers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/buyers", async (req, res) => {
  try {
    const config = getSupabaseConfig();
    const buyersConfig = getBuyersConfig();

    if (!buyersConfig.table) {
      return res.status(400).json({ error: "SUPABASE_BUYERS_TABLE is not configured." });
    }

    const payload = normalizeBuyerPayload(req.body);
    if (!Object.keys(payload).length) {
      return res.status(400).json({ error: "Request body must include at least one field." });
    }

    const created = await insertRowIntoTable(config, buyersConfig.table, payload);
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

async function fetchRows(config, limit) {
  const { table, orderColumn } = config;
  const params = new URLSearchParams({
    select: "*",
    order: `${orderColumn}.desc`,
    limit: String(limit),
  });

  return requestSupabase(config, {
    pathWithQuery: `/${encodeURIComponent(table)}?${params.toString()}`,
  });
}

async function fetchRowById(config, id) {
  const { table, idColumn } = config;
  const filterValue = encodeFilterValue(id);
  const params = new URLSearchParams({
    select: "*",
    [idColumn]: `eq.${filterValue}`,
    limit: "1",
  });

  const rows = await requestSupabase(config, {
    pathWithQuery: `/${encodeURIComponent(table)}?${params.toString()}`,
  });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function insertRow(config, payload) {
  return insertRowIntoTable(config, config.table, payload);
}

async function insertRowIntoTable(config, tableName, payload) {
  const rows = await requestSupabase(config, {
    method: "POST",
    pathWithQuery: `/${encodeURIComponent(tableName)}?select=*`,
    body: payload,
    extraHeaders: {
      Prefer: "return=representation",
    },
  });

  if (!Array.isArray(rows) || !rows.length) {
    throw new Error("Insert succeeded but no row was returned.");
  }

  return rows[0];
}

async function fetchRelatedRows(config, buyersConfig, fruitValue) {
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
  });
}

async function fetchBuyersRows(config, buyersConfig) {
  const { table, buyersOrderColumn } = buyersConfig;
  const params = new URLSearchParams({ select: "*" });
  if (buyersOrderColumn) {
    params.set("order", `${buyersOrderColumn}.desc`);
  }

  return requestSupabase(config, {
    pathWithQuery: `/${encodeURIComponent(table)}?${params.toString()}`,
  });
}

function encodeFilterValue(id) {
  if (id === null || id === undefined) return "";
  return String(id).trim();
}

async function requestSupabase(
  config,
  { method = "GET", pathWithQuery, body = null, extraHeaders = {} }
) {
  const url = `${config.url}/rest/v1${pathWithQuery}`;
  const headers = {
    apikey: config.anonKey,
    Authorization: `Bearer ${config.anonKey}`,
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

const recordsListEl = document.getElementById("recordsList");
const detailEl = document.getElementById("recordDetail");
const refreshBtn = document.getElementById("refreshBtn");
const tabNavEl = document.getElementById("tabNav");
const tabFoodEl = document.getElementById("tabFood");
const tabBuyerEl = document.getElementById("tabBuyer");
const landingViewEl = document.getElementById("landingView");
const foodViewEl = document.getElementById("foodView");
const buyerViewEl = document.getElementById("buyerView");
const authEmailEl = document.getElementById("authEmail");
const authPasswordEl = document.getElementById("authPassword");
const loginBtnEl = document.getElementById("loginBtn");
const signupBtnEl = document.getElementById("signupBtn");
const logoutBtnEl = document.getElementById("logoutBtn");
const authStatusEl = document.getElementById("authStatus");
const createFormEl = document.getElementById("createForm");
const createStatusEl = document.getElementById("createStatus");
const createBtnEl = document.getElementById("createBtn");
const buyersListEl = document.getElementById("buyersList");
const buyerDetailEl = document.getElementById("buyerDetail");
const createBuyerFormEl = document.getElementById("createBuyerForm");
const createBuyerStatusEl = document.getElementById("createBuyerStatus");
const createBuyerBtnEl = document.getElementById("createBuyerBtn");
const buyerFruitSelectEl = document.getElementById("buyerFruitNameInput");
const recordsById = new Map();
const buyersById = new Map();
let currentView = "food";
const AUTH_TOKEN_KEY = "supabase_access_token";

refreshBtn.addEventListener("click", () => {
  if (!isAuthenticated()) {
    renderAuthRequired();
    return;
  }
  if (currentView === "buyer") {
    loadBuyers();
  } else {
    loadRecords();
  }
});
createFormEl.addEventListener("submit", handleCreateRecord);
createBuyerFormEl.addEventListener("submit", handleCreateBuyer);
tabFoodEl.addEventListener("click", () => switchView("food"));
tabBuyerEl.addEventListener("click", () => switchView("buyer"));
loginBtnEl.addEventListener("click", () => handleAuth("login"));
signupBtnEl.addEventListener("click", () => handleAuth("signup"));
logoutBtnEl.addEventListener("click", handleLogout);

async function loadRecords() {
  if (!isAuthenticated()) {
    renderAuthRequired();
    return;
  }
  recordsListEl.textContent = "Loading...";
  detailEl.innerHTML = "<div class='muted'>Select a record.</div>";

  try {
    const response = await apiFetch("/api/entries?limit=100");
    const rows = await response.json();

    if (!response.ok) {
      recordsListEl.textContent = rows?.error || "Failed to load records.";
      return;
    }

    if (!Array.isArray(rows) || !rows.length) {
      recordsListEl.textContent = "No records found in this table.";
      populateBuyerFruitOptions([]);
      return;
    }

    recordsListEl.innerHTML = "";
    recordsById.clear();

    const sortedRows = [...rows].sort((a, b) => {
      const aName = String(getRecordTitle(a, getRecordId(a) ?? "")).toLowerCase();
      const bName = String(getRecordTitle(b, getRecordId(b) ?? "")).toLowerCase();
      return aName.localeCompare(bName);
    });

    sortedRows.forEach((row) => {
      const recordId = getRecordId(row);
      if (recordId === null || recordId === undefined) {
        return;
      }
      const recordKey = String(recordId);
      recordsById.set(recordKey, row);
      const fruitName = getFruitName(row, recordId);
      const pictureUrl = getPictureUrl(row);

      const item = document.createElement("button");
      item.className = "list-item";
      const metaText = getRecordMeta(row);
      if (pictureUrl) {
        item.innerHTML = `
          <div class="list-item-row">
            <img class="thumb thumb-sm" src="${escapeAttribute(pictureUrl)}" alt="${escapeAttribute(String(fruitName))}" loading="lazy" />
            <div class="list-item-content">
              <div class="list-title">${escapeHtml(getRecordTitle(row, recordId))}</div>
              ${metaText ? `<div class="list-meta">${escapeHtml(metaText)}</div>` : ""}
            </div>
          </div>
        `;
      } else {
        item.innerHTML = `
          <div class="list-title">${escapeHtml(getRecordTitle(row, recordId))}</div>
          ${metaText ? `<div class="list-meta">${escapeHtml(metaText)}</div>` : ""}
        `;
      }

      item.addEventListener("click", () => {
        renderRecordDetail(recordKey);
      });
      recordsListEl.appendChild(item);
    });
    populateBuyerFruitOptions(sortedRows);

    if (!recordsListEl.children.length) {
      recordsListEl.textContent = "No usable records found. Check SUPABASE_ID_COLUMN and your table data.";
    }
  } catch (err) {
    recordsListEl.textContent = err.message || "Failed to load records.";
  }
}

function switchView(view) {
  if (!isAuthenticated()) return;
  const isFood = view === "food";
  currentView = isFood ? "food" : "buyer";
  tabFoodEl.classList.toggle("active", isFood);
  tabBuyerEl.classList.toggle("active", !isFood);
  foodViewEl.classList.toggle("active", isFood);
  buyerViewEl.classList.toggle("active", !isFood);

  if (isFood) {
    loadRecords();
  } else {
    loadBuyers();
  }
}

async function renderRecordDetail(recordKey) {
  if (!isAuthenticated()) {
    renderAuthRequired();
    return;
  }
  const row = recordsById.get(recordKey);
  if (!row) {
    detailEl.textContent = "Record not found.";
    return;
  }

  const fruitName = getFruitName(row, recordKey);
  const color = row.Color || row.color || "N/A";
  const pictureUrl = getPictureUrl(row);

  const details = Object.entries(row)
    .filter(([key]) => {
      const normalized = String(key).toLowerCase();
      return (
        normalized !== "__recordid" &&
        normalized !== "fruit name" &&
        normalized !== "fruit_name" &&
        normalized !== "color" &&
        normalized !== "picture" &&
        normalized !== "thumbnail url" &&
        normalized !== "thumbnail_url" &&
        normalized !== "image" &&
        normalized !== "image_url"
      );
    })
    .map(([key, value]) => {
      const fieldMarkup = renderFieldMarkup(key, value);
      return `
        <div class="kv-row">
          <div class="label">${escapeHtml(key)}</div>
          ${fieldMarkup}
        </div>
      `;
    })
    .join("");

  detailEl.innerHTML = `
    <div class="kv-row">
      <div class="label">Fruit Name</div>
      <pre class="value pre">${escapeHtml(String(fruitName))}</pre>
    </div>
    <div class="kv-row">
      <div class="label">Color</div>
      <pre class="value pre">${escapeHtml(String(color))}</pre>
    </div>
    <div class="kv-row">
      <div class="label">Buyers</div>
      <div class="muted">Loading buyers...</div>
    </div>
    ${details}
  `;

  const buyersMarkup = await renderBuyersMarkup(fruitName);
  detailEl.innerHTML = `
    <div class="kv-row">
      <div class="label">Fruit Name</div>
      <pre class="value pre">${escapeHtml(String(fruitName))}</pre>
    </div>
    <div class="kv-row">
      <div class="label">Color</div>
      <pre class="value pre">${escapeHtml(String(color))}</pre>
    </div>
    <div class="kv-row">
      <div class="label">Buyers</div>
      ${buyersMarkup}
    </div>
    ${details}
  `;
}

function getRecordId(row) {
  if (row.__recordId !== undefined && row.__recordId !== null) return row.__recordId;
  if (row.id !== undefined && row.id !== null) return row.id;

  const idLikeKey = Object.keys(row).find((key) => key.toLowerCase() === "id" || key.toLowerCase().endsWith("_id"));
  return idLikeKey ? row[idLikeKey] : null;
}

function getRecordTitle(row, fallbackId) {
  const titleKey = ["Fruit Name", "fruit_name", "fruit", "title", "name", "summary", "email", "description"].find((key) => {
    return typeof row[key] === "string" && row[key].trim().length > 0;
  });

  if (titleKey) return row[titleKey];
  return String(fallbackId);
}

function getRecordMeta(row) {
  const timestampKey = ["updated_at", "created_at", "createdAt", "updatedAt"].find((key) => row[key]);
  if (!timestampKey) return "";
  return `${timestampKey}: ${formatDate(row[timestampKey])}`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function formatValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function formatFieldValue(key, value) {
  const normalizedKey = String(key || "").trim().toLowerCase();
  if (normalizedKey === "price") {
    if (value === null || value === undefined) {
      return "";
    }
    const raw = String(value).trim();
    if (!raw) {
      return "";
    }
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
      return `$${numeric.toFixed(2)}`;
    }
  }
  return formatValue(value);
}

function renderFieldMarkup(key, value) {
  const normalizedKey = String(key || "").trim().toLowerCase();

  if (normalizedKey === "where to buy" || normalizedKey === "where_to_buy") {
    const href = normalizeUrl(value);
    if (href) {
      return `<a class="value link-value" href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(String(value))}</a>`;
    }
  }

  return `<pre class="value pre">${escapeHtml(formatFieldValue(key, value))}</pre>`;
}

function normalizeUrl(value) {
  const text = String(value || "")
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .replace(/^'(.*)'$/, "$1");
  if (!text) return "";

  if (/^https?:\/\//i.test(text)) return text;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(text)) return `https://${text}`;
  return "";
}

function escapeAttribute(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function handleCreateRecord(event) {
  event.preventDefault();
  if (!isAuthenticated()) {
    renderAuthRequired();
    return;
  }
  createStatusEl.textContent = "";

  const payload = buildCreatePayload();
  if (!payload["Fruit Name"]) {
    createStatusEl.textContent = "Fruit Name is required.";
    return;
  }

  try {
    createBtnEl.disabled = true;
    createStatusEl.textContent = "Adding record...";

    const response = await apiFetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (!response.ok) {
      createStatusEl.textContent = data?.error || "Failed to add record.";
      return;
    }

    createFormEl.reset();
    createStatusEl.textContent = "Record added.";
    await loadRecords();
  } catch (err) {
    createStatusEl.textContent = err.message || "Failed to add record.";
  } finally {
    createBtnEl.disabled = false;
  }
}

function buildCreatePayload() {
  const fruitName = document.getElementById("fruitNameInput").value.trim();
  const color = document.getElementById("colorInput").value.trim();
  const priceRaw = document.getElementById("priceInput").value.trim();
  const whereToBuy = document.getElementById("whereToBuyInput").value.trim();

  const payload = {
    "Fruit Name": fruitName,
  };

  if (color) payload.Color = color;
  if (whereToBuy) payload["Where To Buy"] = whereToBuy;

  if (priceRaw) {
    const price = Number(priceRaw);
    payload.Price = Number.isFinite(price) ? price : priceRaw;
  }

  return payload;
}

function getFruitName(row, fallbackId) {
  return row["Fruit Name"] || row.fruit_name || row.name || row.title || fallbackId;
}

function getPictureUrl(row) {
  const picture =
    row.Picture ||
    row.picture ||
    row["Picture URL"] ||
    row["Thumbnail URL"] ||
    row.thumbnail_url ||
    row.image_url ||
    row.image;

  if (!picture || !String(picture).trim()) {
    return "";
  }

  return normalizeUrl(picture) || String(picture).trim();
}

async function loadBuyers() {
  if (!isAuthenticated()) {
    renderAuthRequired();
    return;
  }
  buyersListEl.textContent = "Loading...";
  buyerDetailEl.innerHTML = "<div class='muted'>Select a buyer.</div>";

  try {
    const response = await apiFetch("/api/buyers");
    const rows = await response.json();

    if (!response.ok) {
      buyersListEl.textContent = rows?.error || "Failed to load buyers.";
      return;
    }

    if (!Array.isArray(rows) || !rows.length) {
      buyersListEl.textContent = "No buyers found.";
      return;
    }

    buyersListEl.innerHTML = "";
    buyersById.clear();

    const sortedRows = [...rows].sort((a, b) => {
      const aName = String(a["Buyer Name"] || a.buyer_name || "").toLowerCase();
      const bName = String(b["Buyer Name"] || b.buyer_name || "").toLowerCase();
      return aName.localeCompare(bName);
    });

    sortedRows.forEach((row, index) => {
      const key = String(row.id ?? row["Buyer Name"] ?? `buyer-${index}`);
      buyersById.set(key, row);

      const buyerName = row["Buyer Name"] || row.buyer_name || "Buyer";
      const fruitName = row["Fruit Name"] || row.fruit_name || "";

      const item = document.createElement("button");
      item.className = "list-item";
      item.innerHTML = `
        <div class="list-title">${escapeHtml(String(buyerName))}</div>
      `;
      item.addEventListener("click", () => renderBuyerDetail(key));
      buyersListEl.appendChild(item);
    });
  } catch (err) {
    buyersListEl.textContent = err.message || "Failed to load buyers.";
  }
}

function renderBuyerDetail(key) {
  const row = buyersById.get(key);
  if (!row) {
    buyerDetailEl.textContent = "Buyer not found.";
    return;
  }

  const details = Object.entries(row)
    .map(([field, value]) => `
      <div class="kv-row">
        <div class="label">${escapeHtml(field)}</div>
        <pre class="value pre">${escapeHtml(formatValue(value))}</pre>
      </div>
    `)
    .join("");

  buyerDetailEl.innerHTML = details || "<div class='muted'>No details available.</div>";
}

async function handleCreateBuyer(event) {
  event.preventDefault();
  if (!isAuthenticated()) {
    renderAuthRequired();
    return;
  }
  createBuyerStatusEl.textContent = "";

  const payload = buildCreateBuyerPayload();
  if (!payload["Buyer Name"] || !payload["Fruit Name"]) {
    createBuyerStatusEl.textContent = "Buyer Name and Fruit Name are required.";
    return;
  }

  try {
    createBuyerBtnEl.disabled = true;
    createBuyerStatusEl.textContent = "Adding buyer...";

    const response = await apiFetch("/api/buyers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();

    if (!response.ok) {
      createBuyerStatusEl.textContent = data?.error || "Failed to add buyer.";
      return;
    }

    createBuyerFormEl.reset();
    createBuyerStatusEl.textContent = "Buyer added.";
    await loadBuyers();
  } catch (err) {
    createBuyerStatusEl.textContent = err.message || "Failed to add buyer.";
  } finally {
    createBuyerBtnEl.disabled = false;
  }
}

function buildCreateBuyerPayload() {
  const buyerName = document.getElementById("buyerNameInput").value.trim();
  const fruitName = buyerFruitSelectEl.value.trim();
  const quantityRaw = document.getElementById("buyerQuantityInput").value.trim();

  const payload = {
    "Buyer Name": buyerName,
    "Fruit Name": fruitName,
  };

  if (quantityRaw) {
    const quantity = Number(quantityRaw);
    payload["Quantity Bought"] = Number.isFinite(quantity) ? quantity : quantityRaw;
  }

  return payload;
}

function populateBuyerFruitOptions(rows) {
  const currentValue = buyerFruitSelectEl.value;
  const fruits = Array.from(
    new Set(
      (rows || [])
        .map((row) => getFruitName(row, ""))
        .map((name) => String(name || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  buyerFruitSelectEl.innerHTML = `<option value="">Select a fruit...</option>`;
  fruits.forEach((fruit) => {
    const option = document.createElement("option");
    option.value = fruit;
    option.textContent = fruit;
    buyerFruitSelectEl.appendChild(option);
  });

  if (currentValue && fruits.includes(currentValue)) {
    buyerFruitSelectEl.value = currentValue;
  }
}

async function renderBuyersMarkup(fruitName) {
  try {
    const response = await apiFetch(`/api/buyers?fruitName=${encodeURIComponent(String(fruitName || "").trim())}`);
    const buyers = await response.json();

    if (!response.ok) {
      return `<div class="muted">${escapeHtml(buyers?.error || "Failed to load buyers.")}</div>`;
    }

    if (!Array.isArray(buyers) || !buyers.length) {
      return `<div class="muted">No buyers linked to this fruit.</div>`;
    }

    const items = buyers
      .map((buyer) => {
        const name = getBuyerTitle(buyer);
        const meta = getBuyerMeta(buyer);
        return `<li><span class="buyer-name">${escapeHtml(name)}</span>${meta ? ` <span class="muted">(${escapeHtml(meta)})</span>` : ""}</li>`;
      })
      .join("");

    return `<ul class="buyers-list">${items}</ul>`;
  } catch (err) {
    return `<div class="muted">${escapeHtml(err.message || "Failed to load buyers.")}</div>`;
  }
}

function isAuthenticated() {
  return !!getAuthToken();
}

function getAuthToken() {
  const raw = localStorage.getItem(AUTH_TOKEN_KEY) || "";
  const token = String(raw).trim();
  // Basic JWT-like format check to avoid malformed Authorization header values.
  if (!token || !/^[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+\.[A-Za-z0-9._-]+$/.test(token)) {
    return "";
  }
  return token;
}

function setAuthToken(token) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

async function apiFetch(path, options = {}) {
  const token = getAuthToken();
  const headers = {
    ...(options.headers || {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  try {
    return await fetch(path, { ...options, headers });
  } catch (err) {
    const message = String(err?.message || "");
    if (message.toLowerCase().includes("expected pattern")) {
      clearAuthToken();
      updateAuthUi("");
      throw new Error("Session token became invalid. Please log in again.");
    }
    throw err;
  }
}

async function handleAuth(mode) {
  const email = authEmailEl.value.trim();
  const password = authPasswordEl.value;
  if (!email || !password) {
    authStatusEl.textContent = "Email and password are required.";
    return;
  }
  if (!looksLikeEmail(email)) {
    authStatusEl.textContent = "Please enter a valid email address.";
    return;
  }

  try {
    authStatusEl.textContent = mode === "signup" ? "Creating account..." : "Logging in...";
    const response = await fetch(mode === "signup" ? "/api/auth/signup" : "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    if (!response.ok) {
      authStatusEl.textContent = data?.error || "Authentication failed.";
      return;
    }

    const token = data?.access_token || "";
    if (!token) {
      authStatusEl.textContent = "No access token returned.";
      return;
    }

    setAuthToken(token);
    authPasswordEl.value = "";
    updateAuthUi(data?.user?.email || email);
    switchView("food");
    await loadRecords();
  } catch (err) {
    authStatusEl.textContent = err.message || "Authentication failed.";
  }
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

async function handleLogout() {
  clearAuthToken();
  updateAuthUi("");
}

function updateAuthUi(email) {
  const loggedIn = isAuthenticated();
  authEmailEl.classList.toggle("hidden", loggedIn);
  authPasswordEl.classList.toggle("hidden", loggedIn);
  loginBtnEl.classList.toggle("hidden", loggedIn);
  signupBtnEl.classList.toggle("hidden", loggedIn);
  logoutBtnEl.classList.toggle("hidden", !loggedIn);
  tabNavEl.classList.toggle("hidden", !loggedIn);
  refreshBtn.classList.toggle("hidden", !loggedIn);
  landingViewEl.classList.toggle("active", !loggedIn);
  foodViewEl.classList.toggle("active", false);
  buyerViewEl.classList.toggle("active", false);
  authEmailEl.disabled = loggedIn;
  authPasswordEl.disabled = loggedIn;
  authStatusEl.textContent = loggedIn ? `Logged in${email ? ` as ${email}` : ""}` : "Please log in.";
  if (loggedIn) {
    switchView(currentView);
  }
}

function renderAuthRequired() {
  recordsListEl.textContent = "Please log in to view fruits.";
  detailEl.innerHTML = "<div class='muted'>Log in to view details.</div>";
  buyersListEl.textContent = "Please log in to view buyers.";
  buyerDetailEl.innerHTML = "<div class='muted'>Log in to view details.</div>";
}

async function restoreSession() {
  const token = getAuthToken();
  if (!token) {
    updateAuthUi("");
    return;
  }

  try {
    const response = await apiFetch("/api/auth/session");
    if (!response.ok) {
      clearAuthToken();
      updateAuthUi("");
      return;
    }
    const data = await response.json();
    updateAuthUi(data?.user?.email || "");
    await loadRecords();
  } catch {
    clearAuthToken();
    updateAuthUi("");
  }
}

function getBuyerTitle(row) {
  const key = ["Buyer Name", "buyer_name", "name", "email", "id"].find((k) => {
    return row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "";
  });
  return key ? String(row[key]) : "Buyer";
}

function getBuyerMeta(row) {
  const metaKey = ["Where To Buy", "where_to_buy", "phone", "contact", "created_at"].find((k) => {
    return row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "";
  });
  return metaKey ? String(row[metaKey]) : "";
}

restoreSession();

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const PORT = Number(process.env.PORT) || 8787;
const ROOT = __dirname;
const DATA = path.join(ROOT, "data");
const BOOK = path.join(DATA, "book.json");
const PREV = path.join(DATA, "book.previous.json");
const CODE_FILE = path.join(DATA, "sync-code.txt");
const MAX_BODY = 25 * 1024 * 1024;

const FILES = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/manifest.webmanifest": ["manifest.webmanifest", "application/manifest+json"],
  "/sw.js": ["sw.js", "text/javascript; charset=utf-8"],
  "/icons/apple-touch-icon.png": ["icons/apple-touch-icon.png", "image/png"],
  "/icons/icon-192.png": ["icons/icon-192.png", "image/png"],
  "/icons/icon-512.png": ["icons/icon-512.png", "image/png"]
};

fs.mkdirSync(DATA, { recursive: true });
let code = fs.existsSync(CODE_FILE) ? fs.readFileSync(CODE_FILE, "utf8").trim() : "";
if (!/^\d{6}$/.test(code)) {
  code = String(crypto.randomInt(100000, 1000000));
  fs.writeFileSync(CODE_FILE, code);
}

const empty = () => ({ recipes: {}, deleted: {}, pantry: { items: [], updatedAt: 0 } });
const stamp = r => Number(r && (r.updatedAt || r.createdAt)) || 0;

function normalize(b) {
  const out = empty();
  if (!b || typeof b !== "object") return out;
  const list = Array.isArray(b.recipes) ? b.recipes : Object.values(b.recipes || {});
  for (const r of list) {
    if (r && typeof r.id === "string" && r.id && typeof r.title === "string") out.recipes[r.id] = r;
  }
  for (const [id, t] of Object.entries(b.deleted || {})) {
    if (typeof id === "string" && Number(t) > 0) out.deleted[id] = Number(t);
  }
  if (b.pantry && Array.isArray(b.pantry.items)) {
    out.pantry = { items: b.pantry.items.filter(x => typeof x === "string"), updatedAt: Number(b.pantry.updatedAt) || 0 };
  }
  return out;
}

function merge(a, b) {
  const out = empty();
  for (const src of [a, b]) {
    for (const [id, t] of Object.entries(src.deleted)) out.deleted[id] = Math.max(out.deleted[id] || 0, t);
    for (const [id, r] of Object.entries(src.recipes)) {
      if (!out.recipes[id] || stamp(r) > stamp(out.recipes[id])) out.recipes[id] = r;
    }
  }
  for (const [id, r] of Object.entries(out.recipes)) {
    if ((out.deleted[id] || 0) >= stamp(r)) delete out.recipes[id];
    else delete out.deleted[id];
  }
  out.pantry = b.pantry.updatedAt > a.pantry.updatedAt ? b.pantry : a.pantry;
  return out;
}

function load() {
  let raw;
  try { raw = fs.readFileSync(BOOK, "utf8"); }
  catch (e) {
    if (e.code !== "ENOENT") console.error("[KitchenBook] could not read book.json:", e.message);
    return empty();
  }
  try { return normalize(JSON.parse(raw)); }
  catch (e) {
    const broken = path.join(DATA, `book.broken-${Date.now()}.json`);
    fs.renameSync(BOOK, broken);
    console.error(`[KitchenBook] book.json was damaged, moved it to ${path.basename(broken)} and started fresh`);
    return empty();
  }
}

function save(book) {
  const tmp = BOOK + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(book, null, 1));
  if (fs.existsSync(BOOK)) fs.copyFileSync(BOOK, PREV);
  fs.renameSync(tmp, BOOK);
}

function addresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === "IPv4" && !a.internal && !a.address.startsWith("169.254.")) out.push(`http://${a.address}:${PORT}`);
    }
  }
  return out;
}

const isLocal = req => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);

function codeMatches(given) {
  const a = Buffer.from(String(given || "")), b = Buffer.from(code);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((ok, bad) => {
    const chunks = []; let size = 0;
    req.on("data", c => {
      size += c.length;
      if (size > MAX_BODY) { bad(Object.assign(new Error("too big"), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => ok(Buffer.concat(chunks).toString("utf8")));
    req.on("error", bad);
  });
}

const toWire = b => ({ recipes: Object.values(b.recipes), deleted: b.deleted, pantry: b.pantry });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname === "/api/ping" && req.method === "GET") {
      return send(res, 200, { app: "little-kitchen-book", addresses: addresses(), code: isLocal(req) ? code : undefined });
    }
    if (url.pathname === "/api/sync" && req.method === "POST") {
      if (!codeMatches(req.headers["x-sync-code"])) return send(res, 401, { error: "wrong code" });
      const incoming = normalize(JSON.parse(await readBody(req)));
      const current = load();
      const merged = merge(current, incoming);
      if (JSON.stringify(merged) !== JSON.stringify(current)) save(merged);
      return send(res, 200, toWire(merged));
    }
    const file = req.method === "GET" && FILES[url.pathname];
    if (file) return send(res, 200, fs.readFileSync(path.join(ROOT, file[0])), file[1]);
    send(res, 404, "Not found", "text/plain; charset=utf-8");
  } catch (e) {
    console.error("[KitchenBook]", req.method, url.pathname, e.message);
    send(res, e.status || (e instanceof SyntaxError ? 400 : 500), { error: "failed" });
  }
});

server.on("error", e => {
  if (e.code === "EADDRINUSE") console.error(`[KitchenBook] port ${PORT} is busy. Is Kitchen Book already running in another window?`);
  else console.error("[KitchenBook]", e.message);
  process.exitCode = 1;
});

server.listen(PORT, "0.0.0.0", () => {
  const phone = addresses();
  console.log("");
  console.log("  Little Kitchen Book is running. Keep this window open.");
  console.log("");
  console.log(`  On this PC:     http://localhost:${PORT}`);
  if (phone.length) phone.forEach((a, i) => console.log(`  ${i ? "            or" : "On your phone:"}  ${a}`));
  else console.log("  On your phone:  connect this PC to Wi-Fi first");
  console.log(`  Sync code:      ${code}`);
  console.log("");
  console.log("  Your phone needs to be on the same Wi-Fi as this PC.");
  console.log(`  Recipes are saved in: ${BOOK}`);
  console.log("");
});

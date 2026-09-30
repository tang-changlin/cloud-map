/* 全国云量预报地图 · 数据服务
 * - 托管静态文件（index.html / *.json）
 * - 启动时立即抓取一次，此后每 12 小时自动抓取
 * - 数据窗口滚动：当天起未来 11 天（Open-Meteo, Asia/Shanghai）
 * - 抓取期间继续提供旧数据，抓取失败保留旧数据
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8000;
const DIR = __dirname;
const REFRESH_MS = 12 * 3600 * 1000;
const DATA_FILE = path.join(DIR, "data.json");
const SPOTS_FILE = path.join(DIR, "spots.json");

let refreshing = false;
let lastFetch = 0;
try { lastFetch = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")).fetchedAtTs || 0; } catch (e) {}

/* ---------- 工具 ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
function bjDate(offsetDays = 0) {
  // 北京时间日期字符串 YYYY-MM-DD
  return new Date(Date.now() + 8 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);
}
async function fetchJSON(url, tries = 4) {
  for (let a = 0; a < tries; a++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 90000);
      const r = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) {
      console.log("  retry", a, String(e).slice(0, 80));
      await sleep(4000);
    }
  }
  throw new Error("fetch failed: " + url.slice(0, 100));
}
const round1 = v => Math.round(v * 10) / 10;
const round2 = v => Math.round(v * 100) / 100;

/* ---------- 数据抓取（滚动 11 天窗口） ---------- */
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  console.log("[" + new Date().toISOString() + "] refresh start");
  try {
    const start = bjDate(0), end = bjDate(10);
    const oldData = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    const oldSpots = JSON.parse(fs.readFileSync(SPOTS_FILE, "utf8"));

    // --- 城市：逐日云量 / 天气 / 降水 ---
    const cities = oldData.cities.map(c => ({ name: c.name, lon: c.lon, lat: c.lat, prov: c.prov }));
    const CB = 50;
    for (let i = 0; i < cities.length; i += CB) {
      const batch = cities.slice(i, i + CB);
      const url = "https://api.open-meteo.com/v1/forecast?latitude=" + batch.map(c => c.lat).join(",") +
        "&longitude=" + batch.map(c => c.lon).join(",") +
        "&daily=cloud_cover_mean,weather_code,precipitation_sum&timezone=Asia%2FShanghai" +
        "&start_date=" + start + "&end_date=" + end;
      let res = await fetchJSON(url);
      if (!Array.isArray(res)) res = [res];
      res.forEach((r, j) => {
        batch[j].cloud = r.daily.cloud_cover_mean.map(v => Math.round(v));
        batch[j].wcode = r.daily.weather_code;
        batch[j].precip = r.daily.precipitation_sum.map(round1);
      });
      console.log("  cities", Math.min(i + CB, cities.length) + "/" + cities.length);
      await sleep(600);
    }
    const dates = (await fetchJSON(
      "https://api.open-meteo.com/v1/forecast?latitude=39.9&longitude=116.4&daily=cloud_cover_mean&timezone=Asia%2FShanghai&start_date=" + start + "&end_date=" + end
    )).daily.time;

    const N = dates.length;
    const dailyMean = dates.map((_, i) => round1(cities.reduce((a, c) => a + c.cloud[i], 0) / cities.length));
    const provinces = [];
    const provNames = [...new Set(cities.map(c => c.prov))];
    provNames.forEach(p => {
      const ms = cities.filter(c => c.prov === p);
      provinces.push({ name: p, cloud: dates.map((_, i) => round1(ms.reduce((a, c) => a + c.cloud[i], 0) / ms.length)) });
    });
    const now = new Date(Date.now() + 8 * 3600e3);
    const fetchedAt = now.toISOString().slice(0, 16).replace("T", " ");
    const newData = { dates, cities, dailyMean, provinces, fetchedAt, fetchedAtTs: Date.now() };
    fs.writeFileSync(DATA_FILE + ".tmp", JSON.stringify(newData));
    fs.renameSync(DATA_FILE + ".tmp", DATA_FILE);

    // --- 景点：逐日 + 逐时云量 / 天气 / 降水 ---
    const spots = oldSpots.map(s => ({ name: s.name, lon: s.lon, lat: s.lat }));
    const SB = 15;
    for (let i = 0; i < spots.length; i += SB) {
      const batch = spots.slice(i, i + SB);
      const url = "https://api.open-meteo.com/v1/forecast?latitude=" + batch.map(s => s.lat).join(",") +
        "&longitude=" + batch.map(s => s.lon).join(",") +
        "&daily=cloud_cover_mean&hourly=cloud_cover,weather_code,precipitation&timezone=Asia%2FShanghai" +
        "&start_date=" + start + "&end_date=" + end;
      let res = await fetchJSON(url);
      if (!Array.isArray(res)) res = [res];
      res.forEach((r, j) => {
        batch[j].daily = r.daily.cloud_cover_mean.map(v => Math.round(v));
        batch[j].hourly = r.hourly.cloud_cover;
        batch[j].wcode = r.hourly.weather_code;
        batch[j].precip = r.hourly.precipitation.map(round2);
      });
      console.log("  spots", Math.min(i + SB, spots.length) + "/" + spots.length);
      await sleep(600);
    }
    fs.writeFileSync(SPOTS_FILE + ".tmp", JSON.stringify(spots));
    fs.renameSync(SPOTS_FILE + ".tmp", SPOTS_FILE);

    lastFetch = Date.now();
    console.log("[" + new Date().toISOString() + "] refresh done, window " + start + " ~ " + end + ", days " + N);
  } catch (e) {
    console.error("refresh failed, keep old data:", String(e).slice(0, 200));
  }
  refreshing = false;
}

/* ---------- 静态文件服务 ---------- */
const MIME = { ".html": "text/html; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon" };

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/health") { res.writeHead(200); res.end("ok"); return; }
  if (p === "/") p = "/index.html";
  const file = path.join(DIR, path.normalize(p).replace(/^([/\\])+/, ""));
  if (!file.startsWith(DIR)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    const ext = path.extname(file).toLowerCase();
    const headers = { "Content-Type": MIME[ext] || "application/octet-stream" };
    if (ext === ".json" || ext === ".html") headers["Cache-Control"] = "no-cache";
    res.writeHead(200, headers);
    res.end(buf);
  });
}).listen(PORT, () => console.log("serving on :" + PORT));

/* ---------- 定时刷新：立即一次 + 每12小时 ---------- */
if (Date.now() - lastFetch > REFRESH_MS) refresh();
setInterval(refresh, REFRESH_MS);

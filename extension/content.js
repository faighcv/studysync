// content.js — Brightspace scrapers for StudySync
// Unified source_uid format prevents duplicates across re-scrapes and different pages.

const API_BASE = "https://studysync-tyz6.onrender.com";

function clean(s) { return (s || "").replace(/\s+/g, " ").trim(); }

function monthToNum(m) {
  return { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 }[m.toLowerCase()];
}

function classify(title) {
  const t = title.toLowerCase();
  if (/(midterm|final|exam)/.test(t)) return "exam";
  if (/(quiz|test)/.test(t))          return "quiz";
  if (/\blab\b/.test(t))              return "lab";
  if (/(project)/.test(t))            return "project";
  if (/(discussion|forum)/.test(t))   return "discussion";
  return "assignment";
}

// Parse time string and build ISO date. If the resulting date is >1 day in the
// past, advance the year by 1 (handles Dec scrape → Jan deadlines).
function toISO(year, month, day, timeText, fallback) {
  const t = clean(timeText || fallback || "23:59");
  const pad = n => String(n).padStart(2, "0");
  let dt = new Date(`${year}-${pad(month)}-${pad(day)} ${t}`);
  if (isNaN(+dt)) return null;
  // Roll to next year if date is clearly in the past
  if (dt.getTime() < Date.now() - 86400000) {
    dt = new Date(`${year + 1}-${pad(month)}-${pad(day)} ${t}`);
  }
  return isNaN(+dt) ? null : dt.toISOString();
}

// Unified, stable UID regardless of which page was scraped.
// Format: ss-YYYY-MM-DD-<normalised title>
function makeUID(isoDate, title) {
  const dt = new Date(isoDate);
  const y  = dt.getFullYear();
  const m  = String(dt.getMonth() + 1).padStart(2, "0");
  const d  = String(dt.getDate()).padStart(2, "0");
  const norm = title.toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return `ss-${y}-${m}-${d}-${norm}`;
}

async function getPrefs() {
  const st = await chrome.storage.sync.get(["includeGeneral", "defaultTime"]);
  return { includeAll: !!st.includeGeneral, defaultTime: st.defaultTime || "23:59" };
}

/* ─── Calendar › List page ─────────────────────────────────────────────── */
function scrapeCalendarList(prefs) {
  if (!/\/d2l\/le\/calendar\//i.test(location.pathname)) return [];

  const dateTimeRe = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}\s?(AM|PM)\b/i;
  const yearNow = new Date().getFullYear();
  const rows = [...document.querySelectorAll('li,[role="listitem"],article,d2l-list-item')];
  const seen = new Set();
  const out  = [];

  for (const row of rows) {
    const text = clean(row.innerText);
    const m = text.match(dateTimeRe);
    if (!m) continue;

    const idx = text.indexOf(m[0]);
    let title = clean(text.slice(0, idx));
    if (!title) {
      const a = row.querySelector('a,[role="link"]');
      title = clean(a?.innerText || "");
    }
    if (!title) continue;

    const monStr = m[0].match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i)[0];
    const day    = parseInt(m[0].match(/\b([1-9]|[12]\d|3[01])\b/)[0], 10);
    const month  = monthToNum(monStr);
    const time   = m[0].match(/\d{1,2}:\d{2}\s?(AM|PM)/i)?.[0];

    const iso = toISO(yearNow, month, day, time, prefs.defaultTime);
    if (!iso) continue;

    if (!prefs.includeAll && /available/i.test(title) && !/due/i.test(title)) continue;

    const uid = makeUID(iso, title);
    if (seen.has(uid)) continue;
    seen.add(uid);

    let course = null;
    const line2 = clean(text.split("\n")[1] || "");
    if (line2 && !dateTimeRe.test(line2)) course = line2;

    out.push({ title, course, due_at: iso, kind: classify(title), source_uid: uid });
  }
  return out;
}

/* ─── Assignments list (fallback) ──────────────────────────────────────── */
function scrapeAssignmentsList(prefs) {
  if (!/\/d2l\/lms\/dropbox\//i.test(location.href)) return [];

  const tables = [...document.querySelectorAll("table")];
  const yearNow = new Date().getFullYear();
  const out = [];

  for (const table of tables) {
    const hdr    = [...table.querySelectorAll("thead th")].map(th => clean(th.innerText).toLowerCase());
    const iTitle = hdr.findIndex(h => /assignment|folder|name|title/.test(h));
    const iDue   = hdr.findIndex(h => /due/.test(h));
    if (iTitle < 0 || iDue < 0) continue;

    for (const tr of table.querySelectorAll("tbody tr")) {
      const tds  = [...tr.querySelectorAll("td")];
      const title = clean(tds[iTitle]?.innerText);
      const due   = clean(tds[iDue]?.innerText);
      if (!title || !due) continue;

      const monStr = due.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i)?.[0];
      const dayStr = due.match(/\b([1-9]|[12]\d|3[01])\b/)?.[0];
      const time   = due.match(/\b\d{1,2}:\d{2}\s?(AM|PM)\b/i)?.[0] || prefs.defaultTime;
      if (!monStr || !dayStr) continue;

      const iso = toISO(yearNow, monthToNum(monStr), parseInt(dayStr, 10), time, prefs.defaultTime);
      if (!iso) continue;

      out.push({ title, course: null, due_at: iso, kind: classify(title), source_uid: makeUID(iso, title) });
    }
  }
  return out;
}

/* ─── Quizzes list (fallback) ──────────────────────────────────────────── */
function scrapeQuizzesList(prefs) {
  if (!/\/d2l\/lms\/quizzing\//i.test(location.href)) return [];

  const tables = [...document.querySelectorAll("table")];
  const yearNow = new Date().getFullYear();
  const out = [];

  for (const table of tables) {
    const hdr    = [...table.querySelectorAll("thead th")].map(th => clean(th.innerText).toLowerCase());
    const iTitle = hdr.findIndex(h => /quiz|name|title/.test(h));
    const iDue   = hdr.findIndex(h => /due|end date|end time|availability/.test(h));
    if (iTitle < 0 || iDue < 0) continue;

    for (const tr of table.querySelectorAll("tbody tr")) {
      const tds  = [...tr.querySelectorAll("td")];
      const title = clean(tds[iTitle]?.innerText);
      const due   = clean(tds[iDue]?.innerText);
      if (!title || !due) continue;

      const monStr = due.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i)?.[0];
      const dayStr = due.match(/\b([1-9]|[12]\d|3[01])\b/)?.[0];
      const time   = due.match(/\b\d{1,2}:\d{2}\s?(AM|PM)\b/i)?.[0] || prefs.defaultTime;
      if (!monStr || !dayStr) continue;

      const iso = toISO(yearNow, monthToNum(monStr), parseInt(dayStr, 10), time, prefs.defaultTime);
      if (!iso) continue;

      out.push({ title, course: null, due_at: iso, kind: "quiz", source_uid: makeUID(iso, title) });
    }
  }
  return out;
}

/* ─── Home widget "Upcoming Events" (last fallback) ────────────────────── */
function scrapeHomeUpcoming(prefs) {
  const heading = [...document.querySelectorAll("h1,h2,h3,div,span,strong")]
    .find(el => /upcoming\s+events/i.test(el.textContent));
  if (!heading) return [];

  const container = heading.closest('section,[role="region"],d2l-card,div[class*="widget"],div[id]')
    || heading.parentElement;

  const timeRe = /\b(\d{1,2}:\d{2}\s?(AM|PM))\b/i;
  const monRe  = /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/i;
  const candidates = [...container.querySelectorAll('li,[role="listitem"],div,article')]
    .filter(n => timeRe.test(n.innerText) && monRe.test(n.innerText));

  const yearNow = new Date().getFullYear();
  const seen = new Set();
  const out  = [];

  for (const node of candidates) {
    const text = clean(node.innerText);
    const monMatch  = text.match(monRe);
    const timeMatch = text.match(timeRe);
    const dayMatch  = text.match(/\b([1-9]|[12]\d|3[01])\b/);
    if (!monMatch || !dayMatch) continue;

    const iso = toISO(yearNow, monthToNum(monMatch[0]), parseInt(dayMatch[0], 10), timeMatch?.[0], prefs.defaultTime);
    if (!iso) continue;

    let title = clean(text.split("\n")[0])
      .replace(monRe, "")
      .replace(/\b([1-9]|[12]\d|3[01])\b/, "")
      .replace(timeRe, "");
    title = clean(title.replace(/^[-–—•:]+/, ""));
    if (!title) continue;

    if (!prefs.includeAll && /available/i.test(title) && !/due/i.test(title)) continue;

    const uid = makeUID(iso, title);
    if (seen.has(uid)) continue;
    seen.add(uid);

    const course = clean(text.split("\n")[1] || "") || null;
    out.push({ title, course, due_at: iso, kind: classify(title), source_uid: uid });
  }
  return out;
}

/* ─── Dispatcher ────────────────────────────────────────────────────────── */
function scrapeAll(prefs) {
  const cal = scrapeCalendarList(prefs);
  if (cal.length) return cal;
  const ass = scrapeAssignmentsList(prefs);
  if (ass.length) return ass;
  const quiz = scrapeQuizzesList(prefs);
  if (quiz.length) return quiz;
  return scrapeHomeUpcoming(prefs);
}

/* ─── Message listener ──────────────────────────────────────────────────── */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "STUDYSYNC_SCRAPE" || msg?.type === "SCRAPE") {
    (async () => {
      try {
        const prefs = await getPrefs();
        sendResponse({ ok: true, items: scrapeAll(prefs) });
      } catch (e) {
        console.warn("[StudySync] scrape error", e);
        sendResponse({ ok: false, items: [] });
      }
    })();
    return true;
  }
});

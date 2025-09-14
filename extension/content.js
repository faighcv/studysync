// content.js — Brightspace (McGill) scrapers focused on Calendar › List, plus fallbacks

function clean(s) { return (s || "").replace(/\s+/g, " ").trim(); }
function monthToNum(m){return{jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12}[m.toLowerCase()];}
function classify(title){
  const t = title.toLowerCase();
  if (/(midterm|final|exam)/.test(t)) return "exam";
  if (/(quiz|test)/.test(t)) return "quiz";
  if (/(lab)/.test(t)) return "lab";
  if (/(project)/.test(t)) return "project";
  return "assignment";
}
function toISO(y,m,d,timeText,fallback){
  const t = clean(timeText || fallback || "23:59");
  const dt = new Date(`${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")} ${t}`);
  if (isNaN(+dt)) return null;
  return dt.toISOString();
}

/* --------- Calendar › List page (the one in your screenshot) --------- */
function scrapeCalendarList(prefs){
  if (!/\/d2l\/le\/calendar\//i.test(location.pathname)) return [];
  const dateTimeRe = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}\s?(AM|PM)\b/i;

  // rows are usually li / [role="listitem"] / article / d2l-list-item
  const rows = [...document.querySelectorAll('li,[role="listitem"],article,d2l-list-item')];
  const yearNow = new Date().getFullYear();
  const seen = new Set();
  const out = [];

  for (const row of rows){
    const text = clean(row.innerText);
    const m = text.match(dateTimeRe);
    if (!m) continue;

    const idx = text.indexOf(m[0]);
    let title = clean(text.slice(0, idx));                 // text before the date/time
    if (!title){ // fallback: try a link in the row
      const a = row.querySelector('a, [role="link"]');
      title = clean(a?.innerText || "");
    }
    if (!title) continue;

    // month/day
    const mon = m[0].match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i)[0];
    const day = parseInt(m[0].match(/\b([1-9]|[12]\d|3[01])\b/)[0], 10);
    const month = monthToNum(mon);
    const time  = m[0].match(/\d{1,2}:\d{2}\s?(AM|PM)/i)?.[0];

    const iso = toISO(yearNow, month, day, time, prefs?.defaultTime);
    if (!iso) continue;

    // optional course: often present on a second line or chip; best-effort
    let course = null;
    const line2 = clean(text.split("\n")[1] || "");
    if (line2 && !dateTimeRe.test(line2)) course = line2;

    // skip purely "Available" items unless includeAll checked
    if (!prefs?.includeAll && /available/i.test(title) && !/due/i.test(title)) continue;

    const uid = `cal-${yearNow}-${month}-${day}-${title.toLowerCase().slice(0,64)}`;
    if (seen.has(uid)) continue;
    seen.add(uid);

    out.push({ title, course, due_at: iso, kind: classify(title), source_uid: uid });
  }

  return out;
}

/* --------- Assignments list (fallback) --------- */
function scrapeAssignmentsList(prefs){
  if (!/\/d2l\/lms\/dropbox\//i.test(location.href)) return [];
  const tables = [...document.querySelectorAll("table")];
  const out = []; const y = new Date().getFullYear();
  for (const table of tables){
    const hdr = [...table.querySelectorAll("thead th")].map(th=>clean(th.innerText).toLowerCase());
    const iTitle = hdr.findIndex(h=>/assignment|folder|name|title/.test(h));
    const iDue   = hdr.findIndex(h=>/due/.test(h));
    if (iTitle<0||iDue<0) continue;
    for (const tr of table.querySelectorAll("tbody tr")){
      const tds = [...tr.querySelectorAll("td")];
      const title = clean(tds[iTitle]?.innerText);
      const due   = clean(tds[iDue]?.innerText); // "Sep 19, 11:59 PM"
      if (!title || !due) continue;
      const mon = due.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i)?.[0];
      const day = due.match(/\b([1-9]|[12]\d|3[01])\b/)?.[0];
      const time= due.match(/\b\d{1,2}:\d{2}\s?(AM|PM)\b/i)?.[0] || prefs?.defaultTime;
      if (!mon||!day) continue;
      const iso = toISO(y, monthToNum(mon), parseInt(day,10), time, prefs?.defaultTime);
      out.push({ title, course:null, due_at: iso, kind: classify(title), source_uid:`assign-${y}-${mon}-${day}-${title.toLowerCase().slice(0,64)}` });
    }
  }
  return out;
}

/* --------- Quizzes list (fallback) --------- */
function scrapeQuizzesList(prefs){
  if (!/\/d2l\/lms\/quizzing\//i.test(location.href)) return [];
  const tables = [...document.querySelectorAll("table")];
  const out = []; const y = new Date().getFullYear();
  for (const table of tables){
    const hdr = [...table.querySelectorAll("thead th")].map(th=>clean(th.innerText).toLowerCase());
    const iTitle = hdr.findIndex(h=>/quiz|name|title/.test(h));
    const iDue   = hdr.findIndex(h=>/due|end date|end time|availability/.test(h));
    if (iTitle<0||iDue<0) continue;
    for (const tr of table.querySelectorAll("tbody tr")){
      const tds = [...tr.querySelectorAll("td")];
      const title = clean(tds[iTitle]?.innerText);
      const due   = clean(tds[iDue]?.innerText);
      if (!title || !due) continue;
      const mon = due.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i)?.[0];
      const day = due.match(/\b([1-9]|[12]\d|3[01])\b/)?.[0];
      const time= due.match(/\b\d{1,2}:\d{2}\s?(AM|PM)\b/i)?.[0] || prefs?.defaultTime;
      if (!mon||!day) continue;
      const iso = toISO(y, monthToNum(mon), parseInt(day,10), time, prefs?.defaultTime);
      out.push({ title, course:null, due_at: iso, kind:"quiz", source_uid:`quiz-${y}-${mon}-${day}-${title.toLowerCase().slice(0,64)}` });
    }
  }
  return out;
}

/* --------- Home widget (last fallback) --------- */
function scrapeHomeUpcoming(prefs){
  const heading = [...document.querySelectorAll('h1,h2,h3,div,span,strong')].find(el=>/upcoming\s+events/i.test(el.textContent));
  if (!heading) return [];
  const container = heading.closest('section,[role="region"],d2l-card,div[class*="widget"],div[id]') || heading.parentElement;
  const timeRe = /\b(\d{1,2}:\d{2}\s?(AM|PM))\b/i;
  const monRe  = /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/i;
  const candidates = [...container.querySelectorAll('li,[role="listitem"],div,article')].filter(n=>timeRe.test(n.innerText)&&monRe.test(n.innerText));
  const y = new Date().getFullYear(); const out=[]; const seen=new Set();
  for (const node of candidates){
    const text = clean(node.innerText);
    const monMatch=text.match(monRe); const timeMatch=text.match(timeRe); const dayMatch=text.match(/\b([1-9]|[12]\d|3[01])\b/);
    if (!monMatch||!dayMatch) continue;
    const m=monthToNum(monMatch[0]); const d=parseInt(dayMatch[0],10);
    const iso=toISO(y,m,d,timeMatch?.[0],prefs?.defaultTime);
    let title = clean(text.split("\n")[0]).replace(monRe,"").replace(/\b([1-9]|[12]\d|3[01])\b/,"").replace(timeRe,"");
    title = clean(title.replace(/^[-–—•:]+/,""));
    if (!prefs?.includeAll && /available/i.test(title) && !/due/i.test(title)) continue;
    const uid=`home-${y}-${m}-${d}-${title.toLowerCase().slice(0,64)}`;
    if (!title||!iso||seen.has(uid)) continue; seen.add(uid);
    const course = clean((text.split("\n")[1]||""));
    out.push({ title, course: course||null, due_at: iso, kind: classify(title), source_uid: uid });
  }
  return out;
}

/* --------- dispatcher --------- */
function scrapeAll(prefs){
  // prefer the Calendar List page, then tables, then the home widget
  const cal = scrapeCalendarList(prefs);
  if (cal.length) return cal;
  const ass = scrapeAssignmentsList(prefs);
  if (ass.length) return ass;
  const quiz = scrapeQuizzesList(prefs);
  if (quiz.length) return quiz;
  return scrapeHomeUpcoming(prefs);
}

chrome.runtime.onMessage.addListener((msg,_sender,sendResponse)=>{
  if (msg?.type==="STUDYSYNC_SCRAPE"){
    try { sendResponse({ ok:true, items: scrapeAll(msg.prefs||{}) }); }
    catch(e){ console.warn("scrape error",e); sendResponse({ ok:false, items: [] }); }
    return true;
  }
});

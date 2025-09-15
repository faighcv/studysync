# StudySync — Brightspace → Calendar (ICS)

Export due dates from Brightspace (e.g., McGill MyCourses) to your calendar via a private ICS feed.

- **Extension**: one click on the Brightspace page collects due dates.
- **Backend (FastAPI)**: stores your items and exposes your personal ICS feed URL.
- **Calendar**: subscribe to your ICS once; it auto-refreshes.

**Live API**: `https://studysync-tyz6.onrender.com`  
**Chrome Web Store**: _link-coming-soon_  
**Privacy Policy**: https://faighcv.github.io/studysync/privacy

---

## How it works (high-level)

1. Install the Chrome extension (`extension/`).
2. Open the extension **Options**, **Sign up** (email/password), then you’ll see **Your subscribed ICS** URL.
3. Visit Brightspace (e.g., McGill MyCourses) → open **Calendar → List** (or Assignments/Quizzes pages).
4. Click the extension icon. You’ll see a notification like “Synced N items ✅”.
5. Add your ICS URL to Google Calendar / Apple Calendar / Outlook. Your due dates appear and auto-refresh.

> The ICS link is a secret token. Anyone with the link can read your due dates—don’t share it publicly.

---

## For Users (quick start)

- **Download the extension** (Web Store or Load Unpacked during development)
- Open **Options** → Sign up / Login
- Copy the **ICS** link shown on the Options page
- **Google Calendar** → Other calendars → “From URL” → paste ICS
- **Apple Calendar (Mac)** → File → New Calendar Subscription → paste ICS

---

## For Developers

### Local: Docker (recommended)
```bash
docker compose up --build
# API: http://localhost:8000/health  → {"ok": true}

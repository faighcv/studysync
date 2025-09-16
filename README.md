Chrome extension + FastAPI backend that scrapes due dates from Brightspace pages you open and creates a private ICS feed you can subscribe to (Google/Apple/Outlook).

- Website: https://github.com/faighcv/studysync
- API (Render): https://studysync-tyz6.onrender.com
- Privacy: https://faighcv.github.io/studysync/privacy.html
- Terms: https://faighcv.github.io/studysync/terms.html
- FAQ: https://faighcv.github.io/studysync/faq.html
- Support: https://github.com/faighcv/studysync/issues

## How to use
1) Install the Chrome extension (from the Web Store once published).  
2) Open Options → Sign up / Login.  
3) On Brightspace Calendar (List) / Assignments / Quizzes pages, click the toolbar icon.  
4) Copy your personal ICS URL from Options and add it to your calendar app.

## Permissions
Uses `storage`, `notifications`, and runs only on Brightspace domains listed in the manifest.

## Screenshots

**Options page (ICS link + test)**  
![Options](docs/screenshots/options-ics.png)

**Brightspace → Calendar → List**  
![Calendar List](docs/screenshots/calendar-list.png)

**Apple Calendar import dialog**  
![Apple Importing](docs/screenshots/apple-importing.png)

**Apple Calendar — event examples**  
![Apple Calendar 1](docs/screenshots/apple-event-1.png)
![Apple Calendar 2](docs/screenshots/apple-event-2.png)

## License
MIT — see [LICENSE](./LICENSE).


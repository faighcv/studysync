from typing import Optional
import httpx
from icalendar import Calendar
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models import CalendarLink, Assignment

def _to_dt(value) -> Optional[datetime]:
    if not value:
        return None
    dt = getattr(value, "dt", None) or value
    if isinstance(dt, datetime):
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    return None

def import_ics(db: Session, user_id: str) -> dict:
    link = db.get(CalendarLink, user_id)
    if not link or not link.ics_url:
        raise ValueError("No ICS URL saved for this user. POST /calendar/link first.")

    try:
        with httpx.Client(timeout=20) as client:
            r = client.get(link.ics_url, headers={"User-Agent": "studysync/import"})
            r.raise_for_status()
    except Exception as e:
        raise ValueError(f"Failed to fetch ICS: {e}")

    try:
        cal = Calendar.from_ical(r.content)
    except Exception as e:
        raise ValueError(f"Failed to parse ICS: {e}")

    imported, updated = 0, 0
    for comp in cal.walk():
        if getattr(comp, "name", "") != "VEVENT":
            continue

        uid    = str(comp.get("UID", "")) or None
        title  = str(comp.get("SUMMARY", "Untitled"))
        due    = _to_dt(comp.get("DTSTART"))
        course = None
        kind   = "event"  # generic ICS source

        row = (
            db.query(Assignment)
              .filter(Assignment.user_id == user_id, Assignment.source_uid == uid)
              .one_or_none()
        )

        if row:
            row.title = title
            row.course = course
            row.kind = kind
            row.due_at = due
            updated += 1
        else:
            db.add(Assignment(
                user_id=user_id,
                source_uid=uid,
                title=title,
                course=course,
                kind=kind,
                due_at=due,
                status="todo",
            ))
            imported += 1

    db.commit()
    return {"imported": imported, "updated": updated}

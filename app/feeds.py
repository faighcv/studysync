from typing import Iterable
from datetime import datetime, timezone, timedelta
from icalendar import Calendar, Event, Alarm


def build_ics(rows: Iterable, future_only: bool = True, add_alarms: bool = True) -> bytes:
    cal = Calendar()
    cal.add("prodid", "-//StudySync//myCourses//EN")
    cal.add("version", "2.0")
    cal.add("X-WR-CALNAME", "StudySync – myCourses Deadlines")
    cal.add("X-WR-CALDESC", "Due dates synced from McGill myCourses via StudySync")
    cal.add("CALSCALE", "GREGORIAN")
    cal.add("METHOD", "PUBLISH")

    now = datetime.now(timezone.utc)

    for r in rows:
        if future_only and r.due_at and r.due_at < now:
            continue

        ev = Event()

        # Stable UID — never changes for the same assignment row
        ev.add("uid", f"studysync-{r.id}@studysync")

        ev.add("summary", r.title or "Untitled")

        # DTSTAMP should reflect when the event record was last modified,
        # not the current wall-clock time. This prevents calendar apps from
        # treating every feed fetch as "all events modified".
        dtstamp = getattr(r, "updated_at", None) or getattr(r, "created_at", None) or now
        if dtstamp.tzinfo is None:
            dtstamp = dtstamp.replace(tzinfo=timezone.utc)
        ev.add("dtstamp", dtstamp)

        # SEQUENCE increments logically with updates; use 0 as a safe default
        ev.add("sequence", 0)

        if r.due_at:
            due = r.due_at if r.due_at.tzinfo else r.due_at.replace(tzinfo=timezone.utc)
            ev.add("dtstart", due)
            ev.add("dtend",   due)  # point-in-time event; required by some clients

        # Description: kind + course
        parts = [r.kind or "assignment"]
        if getattr(r, "course", None):
            parts.append(r.course)
        ev.add("description", " — ".join(parts))

        if add_alarms and r.due_at:
            for delta in (timedelta(days=1), timedelta(hours=1)):
                alarm = Alarm()
                alarm.add("action", "DISPLAY")
                alarm.add("description", f"Due: {r.title}")
                alarm.add("trigger", -delta)
                ev.add_component(alarm)

        cal.add_component(ev)

    return cal.to_ical()

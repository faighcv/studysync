from typing import Iterable
from datetime import datetime, timezone, timedelta
from icalendar import Calendar, Event, Alarm

def build_ics(rows: Iterable, future_only: bool = True, add_alarms: bool = True) -> bytes:
    cal = Calendar()
    cal.add("prodid", "-//StudySync//EN")
    cal.add("version", "2.0")
    cal.add("X-WR-CALNAME", "StudySync")

    now = datetime.now(timezone.utc)

    for r in rows:
        if future_only and r.due_at and r.due_at < now:
            continue

        ev = Event()
        ev.add("uid", f"studysync-{r.id}")
        ev.add("summary", r.title or "Untitled")
        ev.add("dtstamp", now)
        if r.due_at:
            ev.add("dtstart", r.due_at)

        desc = (r.kind or "assignment")
        if getattr(r, "course", None):
            desc += f" — {r.course}"
        ev.add("description", desc)

        if add_alarms and r.due_at:
            alarm = Alarm()
            alarm.add("action", "DISPLAY")
            alarm.add("description", "Reminder")
            alarm.add("trigger", timedelta(minutes=-30))
            ev.add_component(alarm)

        cal.add_component(ev)

    return cal.to_ical()

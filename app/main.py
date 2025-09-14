import secrets
import logging
from typing import Optional, List
from datetime import datetime, timezone

from fastapi import FastAPI, Depends, Request, Query, HTTPException
from fastapi.responses import Response, PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import engine, SessionLocal, Base
from app.models import CalendarLink, Assignment, User
from app.feeds import build_ics
from app.ingest import import_ics  # optional; keep for future
from app.auth import router as auth_router, get_current_user

log = logging.getLogger("studysync")

app = FastAPI(title="StudySync (email login)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/health")
def health():
    return {"ok": True}

# ---------- Auth ----------
app.include_router(auth_router)

# ---------- bulk ingest from extension ----------
class AssignmentIn(BaseModel):
    title: str
    due_at: Optional[datetime] = None
    course: Optional[str] = None
    kind: str = "assignment"
    source_uid: Optional[str] = None

@app.post("/assignments/bulk")
def upsert_bulk(
    items: List[AssignmentIn],
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    imported, updated = 0, 0
    for it in items:
        row = None
        if it.source_uid:
            row = (
                db.query(Assignment)
                .filter_by(user_id=user.id, source_uid=it.source_uid)
                .one_or_none()
            )
        if row:
            row.title = it.title
            row.course = it.course
            row.kind = it.kind
            row.due_at = it.due_at
            updated += 1
        else:
            db.add(Assignment(
                user_id=user.id,
                source_uid=it.source_uid,
                title=it.title,
                course=it.course,
                kind=it.kind,
                due_at=it.due_at,
                status="todo",
            ))
            imported += 1
    db.commit()
    return {"ok": True, "stats": {"imported": imported, "updated": updated}}

# ---------- list items ----------
class AssignmentOut(BaseModel):
    id: int
    course: Optional[str]
    title: str
    kind: str
    due_at: Optional[datetime]
    status: str
    class Config:
        from_attributes = True

@app.get("/assignments", response_model=List[AssignmentOut])
def list_assignments(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    from_: Optional[str] = Query(None, alias="from"),
    to: Optional[str] = None,
):
    q = db.query(Assignment).filter(Assignment.user_id == user.id)

    def parse_iso(s: Optional[str]) -> Optional[datetime]:
        if not s: return None
        if s.endswith("Z"):
            s = s[:-1]
            dt = datetime.fromisoformat(s)
            return dt.replace(tzinfo=timezone.utc)
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)

    dt_from = parse_iso(from_)
    dt_to = parse_iso(to)
    if dt_from: q = q.filter(Assignment.due_at >= dt_from)
    if dt_to:   q = q.filter(Assignment.due_at <= dt_to)

    return q.order_by(Assignment.due_at.asc().nulls_last()).all()

# ---------- personal ICS feed ----------
@app.get("/calendar/share-url")
def get_share_url(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    link = db.get(CalendarLink, user.id)
    if not link:
        link = CalendarLink(user_id=user.id)
        db.add(link); db.commit(); db.refresh(link)
    if not getattr(link, "share_token", None):
        link.share_token = secrets.token_urlsafe(16)
        db.commit()
    base = str(request.base_url).rstrip("/")
    url = f"{base}/calendar/{link.share_token}.ics"
    return {"ok": True, "url": url}

@app.get("/calendar/{token}.ics")
def token_feed(
    token: str,
    db: Session = Depends(get_db),
):
    link = db.query(CalendarLink).filter(CalendarLink.share_token == token).first()
    if not link:
        return Response(status_code=404)

    rows = (
        db.query(Assignment)
        .filter(Assignment.user_id == link.user_id)
        .order_by(Assignment.due_at.asc().nulls_last())
        .all()
    )
    try:
        ics_bytes = build_ics(rows, future_only=True, add_alarms=True)
    except Exception as e:
        return PlainTextResponse(f"ICS build failed: {e}", status_code=500)

    return Response(
        content=ics_bytes,
        media_type="text/calendar",
        headers={"Content-Disposition": 'attachment; filename="studysync.ics"'},
    )

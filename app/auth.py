import os, secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from jose import jwt, JWTError

from app.db import SessionLocal
from app.models import User, CalendarLink

router = APIRouter(prefix="/auth", tags=["auth"])

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")
JWT_ALG = "HS256"
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ---------- Schemas ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class TokenOut(BaseModel):
    access_token: str

# ---------- Helpers ----------
def _make_user_id() -> str:
    return secrets.token_urlsafe(10)

def create_access_token(sub: str, minutes: int = 60*24*30) -> str:
    now = datetime.utcnow()
    exp = now + timedelta(minutes=minutes)
    return jwt.encode({"sub": sub, "iat": int(now.timestamp()), "exp": int(exp.timestamp())}, JWT_SECRET, algorithm=JWT_ALG)

def get_current_user(
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(None, alias="Authorization"),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing or invalid Authorization header")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(401, "Invalid token")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(401, "User not found")
    return user

# ---------- Routes ----------
@router.post("/register", response_model=TokenOut)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    exists = db.query(User).filter(User.email == payload.email.lower()).first()
    if exists:
        raise HTTPException(400, "Email already registered")
    u = User(id=_make_user_id(), email=payload.email.lower(), password_hash=pwd.hash(payload.password))
    db.add(u)
    # ensure a CalendarLink row exists for this user (used for share URL)
    cl = CalendarLink(user_id=u.id)
    db.add(cl)
    db.commit()
    token = create_access_token(u.id)
    return {"access_token": token}

@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    u = db.query(User).filter(User.email == payload.email.lower()).first()
    if not u or not pwd.verify(payload.password, u.password_hash):
        raise HTTPException(401, "Invalid email or password")
    token = create_access_token(u.id)
    return {"access_token": token}

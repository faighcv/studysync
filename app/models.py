from __future__ import annotations
from typing import Optional
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, DateTime, Text, func, UniqueConstraint, ForeignKey
from app.db import Base

class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String, primary_key=True)  # uuid/urlsafe
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    link: Mapped["CalendarLink"] = relationship(back_populates="user", uselist=False)

class CalendarLink(Base):
    __tablename__ = "calendar_links"
    user_id:     Mapped[str] = mapped_column(String, ForeignKey("users.id"), primary_key=True)
    ics_url:     Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    share_token: Mapped[Optional[str]] = mapped_column(String(255), index=True, unique=True)
    created_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user: Mapped[User] = relationship(back_populates="link")

class Assignment(Base):
    __tablename__ = "assignments"
    id:        Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id:   Mapped[str] = mapped_column(String, index=True)
    source_uid:Mapped[Optional[str]] = mapped_column(String, nullable=True)
    title:     Mapped[str] = mapped_column(String, default="Untitled")
    course:    Mapped[Optional[str]] = mapped_column(String, nullable=True)
    kind:      Mapped[str] = mapped_column(String, default="assignment")  # assignment/quiz/exam/lab/project/discussion/event
    due_at:    Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    status:    Mapped[str] = mapped_column(String, default="todo")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (UniqueConstraint("user_id", "source_uid", name="uq_assignment_source"),)

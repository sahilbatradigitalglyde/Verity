"""Append-only audit trail. Every state change, edit, result, AI run and approval goes through here."""
from sqlalchemy.orm import Session

from app.models import AuditEvent, User


def log(db: Session, *, cycle_id: str | None, app_id: str | None, actor: User | None, action: str,
        detail: str = "", tag: str = "", tag_class: str = "p-ac", category: str = "Workflow", actor_kind: str = "user") -> AuditEvent:
    ev = AuditEvent(cycle_id=cycle_id, app_id=app_id, actor_id=actor.id if actor else None, actor_kind=actor_kind,
                    action=action, detail=detail, tag=tag, tag_class=tag_class, category=category)
    db.add(ev)
    return ev

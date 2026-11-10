from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import CurrentUser, current_user
from app.models import Role, User
from app.serializers import user_out

router = APIRouter(tags=["me"])


@router.get("/me")
def me(cu: CurrentUser = Depends(current_user)):
    return user_out(cu.user)


@router.get("/users/testers")
def testers(cu: CurrentUser = Depends(current_user), db: Session = Depends(get_db)):
    """People picker for Assign to Tester."""
    return [user_out(u) for u in db.scalars(select(User).where(User.role.in_([Role.tester, Role.tester_lead])).order_by(User.name)).all()]

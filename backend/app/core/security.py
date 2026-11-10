"""Authentication (Microsoft Entra ID bearer tokens) and role checks.

Entra issues the token; we validate signature, audience and issuer against the tenant's JWKS,
then map the user to a Verity role from group membership (ENTRA_GROUP_ROLE_MAP) or the users table.
In development, AUTH_DEV_BYPASS lets the frontend send `X-Demo-User: dev|tester|admin|...`.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

import jwt
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.models import Role, User

DEMO_USERS = {
    "dev": "daniel.okafor@contoso.com",
    "tester": "priya.shah@contoso.com",
    "admin": "sam.patel@contoso.com",
    "developer": "marcus.lee@contoso.com",
    "tester_lead": "tomas.rivera@contoso.com",
}


@dataclass
class CurrentUser:
    user: User
    token: str | None  # raw Entra token, used for the on-behalf-of call to Azure DevOps

    @property
    def role(self) -> Role:
        return self.user.role


@lru_cache
def _jwks_client(tenant: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys")


def _decode(token: str) -> dict:
    s = get_settings()
    key = _jwks_client(s.entra_tenant_id).get_signing_key_from_jwt(token).key
    return jwt.decode(
        token, key, algorithms=["RS256"],
        audience=[s.entra_api_client_id, f"api://{s.entra_api_client_id}"],
        issuer=f"https://login.microsoftonline.com/{s.entra_tenant_id}/v2.0",
    )


def _role_from_claims(claims: dict) -> Role | None:
    m = get_settings().group_role_map
    order = [Role.admin, Role.senior_developer, Role.tester_lead, Role.tester, Role.developer]
    found = {Role(m[g]) for g in claims.get("groups", []) if g in m}
    return next((r for r in order if r in found), None)


def current_user(
    authorization: str | None = Header(default=None),
    x_demo_user: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> CurrentUser:
    s = get_settings()
    if s.auth_dev_bypass and x_demo_user:
        email = DEMO_USERS.get(x_demo_user)
        user = db.scalar(select(User).where(User.email == email)) if email else None
        if not user:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown demo user")
        return CurrentUser(user, None)
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in with Microsoft")
    token = authorization.split(" ", 1)[1]
    try:
        claims = _decode(token)
    except jwt.PyJWTError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {e}") from e
    oid = claims.get("oid")
    user = db.scalar(select(User).where(User.entra_oid == oid))
    role = _role_from_claims(claims)
    if not user:
        if not role:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have a Verity role. Ask your admin.")
        name = claims.get("name", claims.get("preferred_username", "User"))
        user = User(entra_oid=oid, email=claims.get("preferred_username", oid), name=name,
                    initials="".join(w[0] for w in name.split()[:2]).upper(), role=role)
        db.add(user)
        db.commit()
    elif role and user.role != role:
        user.role = role
        db.commit()
    return CurrentUser(user, token)


def require(*roles: Role):
    """Dependency: allow only the given roles (admins are always allowed)."""
    def dep(cu: CurrentUser = Depends(current_user)) -> CurrentUser:
        if cu.role != Role.admin and cu.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Your role cannot do this")
        return cu
    return dep

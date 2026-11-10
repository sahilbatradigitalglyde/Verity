"""Azure DevOps browsing for the Add App modal: organizations → projects → repositories (as the signed-in user)."""
from fastapi import APIRouter, Depends

from app.core.security import CurrentUser, require
from app.integrations import get_scm
from app.models import Role

router = APIRouter(prefix="/ado", tags=["azure-devops"])


@router.get("/orgs")
def orgs(cu: CurrentUser = Depends(require(Role.admin))):
    return get_scm(cu).list_orgs()


@router.get("/orgs/{org}/projects")
def projects(org: str, cu: CurrentUser = Depends(require(Role.admin))):
    return get_scm(cu).list_projects(org)


@router.get("/orgs/{org}/projects/{project}/repos")
def repos(org: str, project: str, cu: CurrentUser = Depends(require(Role.admin))):
    return [{"name": r.name, "updated": r.updated, "branch": r.default_branch} for r in get_scm(cu).list_repos(org, project)]

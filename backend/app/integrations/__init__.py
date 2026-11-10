from app.core.config import get_settings
from app.core.security import CurrentUser
from app.integrations.scm import SourceControl


def get_scm(cu: CurrentUser, provider: str = "azure_devops") -> SourceControl:
    if get_settings().scm_mode == "demo" or not cu.token:
        from app.integrations.demo import DemoSourceControl
        return DemoSourceControl()
    if provider == "github":
        raise NotImplementedError("GitHub sync is planned for phase 3 (docs/12_INTEGRATIONS.md)")
    from app.integrations.azure_devops import AzureDevOps
    return AzureDevOps(cu.token)

"""Settings loaded from environment / .env (see .env.example)."""
import json
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "development"
    database_url: str = "sqlite:///./verity.db"
    cors_origins: str = "http://localhost:5173"
    auth_dev_bypass: bool = False

    entra_tenant_id: str = ""
    entra_api_client_id: str = ""
    entra_api_client_secret: str = ""
    entra_group_role_map: str = ""

    scm_mode: str = "demo"
    ado_organizations: str = ""

    ai_mode: str = "live"
    azure_openai_endpoint: str = ""
    azure_openai_api_key: str = ""
    azure_openai_deployment: str = "verity-gpt-4.1"
    azure_openai_api_version: str = "2024-10-21"
    claude_hosting: str = "anthropic"
    anthropic_api_key: str = ""
    claude_foundry_resource: str = ""
    claude_foundry_api_key: str = ""
    claude_model: str = ""
    ai_max_tokens: int = 8000

    evidence_storage_connection_string: str = ""
    evidence_container: str = "evidence"

    @property
    def group_role_map(self) -> dict[str, str]:
        return json.loads(self.entra_group_role_map) if self.entra_group_role_map else {}


@lru_cache
def get_settings() -> Settings:
    return Settings()

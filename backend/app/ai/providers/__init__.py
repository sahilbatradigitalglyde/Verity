from app.ai.providers.base import AIProvider, ProviderNotConfigured
from app.core.config import get_settings


def get_provider(key: str) -> AIProvider:
    """azure | claude. In AI_MODE=demo both return deterministic sample replies."""
    if get_settings().ai_mode == "demo":
        from app.ai.providers.demo import DemoProvider
        return DemoProvider(key)
    if key == "azure":
        from app.ai.providers.azure_openai import AzureOpenAIProvider
        return AzureOpenAIProvider()
    if key == "claude":
        from app.ai.providers.claude import ClaudeProvider
        return ClaudeProvider()
    raise ValueError(f"Unknown provider {key}")


__all__ = ["AIProvider", "ProviderNotConfigured", "get_provider"]

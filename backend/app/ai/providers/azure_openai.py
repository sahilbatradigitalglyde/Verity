"""Azure OpenAI provider. Uses structured outputs (json_schema) so the reply is a single JSON object."""
from __future__ import annotations

import json

from app.ai.providers.base import Message, ProviderNotConfigured, ProviderResult
from app.core.config import get_settings


class AzureOpenAIProvider:
    key = "azure"

    def __init__(self):
        s = get_settings()
        if not (s.azure_openai_endpoint and s.azure_openai_api_key):
            raise ProviderNotConfigured("Azure OpenAI is not configured (AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_KEY)")
        from openai import AzureOpenAI
        self.client = AzureOpenAI(api_key=s.azure_openai_api_key, azure_endpoint=s.azure_openai_endpoint,
                                  api_version=s.azure_openai_api_version)
        self.deployment = s.azure_openai_deployment
        self.max_tokens = s.ai_max_tokens

    def complete_json(self, *, system: str, messages: list[Message], schema: dict, schema_name: str) -> ProviderResult:
        r = self.client.chat.completions.create(
            model=self.deployment,
            messages=[{"role": "system", "content": system}] + [{"role": m.role, "content": m.content} for m in messages],
            response_format={"type": "json_schema", "json_schema": {"name": schema_name, "schema": schema, "strict": False}},
            max_tokens=self.max_tokens,
            temperature=0.2,
        )
        raw = r.choices[0].message.content or ""
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            data = None
        u = r.usage
        return ProviderResult(data=data, raw=raw, model=self.deployment,
                              input_tokens=getattr(u, "prompt_tokens", None), output_tokens=getattr(u, "completion_tokens", None))

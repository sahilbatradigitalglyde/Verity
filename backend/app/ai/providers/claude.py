"""Claude provider. Forces a single tool call whose input_schema is the reply format,
so the reply is always one JSON object. Works with the Anthropic API or Claude on Microsoft Foundry."""
from __future__ import annotations

import json

from app.ai.providers.base import Message, ProviderNotConfigured, ProviderResult
from app.core.config import get_settings

TOOL = "submit_result"


class ClaudeProvider:
    key = "claude"

    def __init__(self):
        s = get_settings()
        if not s.claude_model:
            raise ProviderNotConfigured("CLAUDE_MODEL is not set")
        if s.claude_hosting == "foundry":
            if not (s.claude_foundry_resource and s.claude_foundry_api_key):
                raise ProviderNotConfigured("Claude on Foundry is not configured (CLAUDE_FOUNDRY_RESOURCE / CLAUDE_FOUNDRY_API_KEY)")
            from anthropic import AnthropicFoundry
            self.client = AnthropicFoundry(resource=s.claude_foundry_resource, api_key=s.claude_foundry_api_key)
        else:
            if not s.anthropic_api_key:
                raise ProviderNotConfigured("ANTHROPIC_API_KEY is not set")
            from anthropic import Anthropic
            self.client = Anthropic(api_key=s.anthropic_api_key)
        self.model = s.claude_model
        self.max_tokens = s.ai_max_tokens

    def complete_json(self, *, system: str, messages: list[Message], schema: dict, schema_name: str) -> ProviderResult:
        r = self.client.messages.create(
            model=self.model,
            max_tokens=self.max_tokens,
            system=system,
            messages=[{"role": m.role, "content": m.content} for m in messages],
            tools=[{"name": TOOL, "description": f"Submit the {schema_name} result.", "input_schema": schema}],
            tool_choice={"type": "tool", "name": TOOL},
        )
        block = next((b for b in r.content if getattr(b, "type", "") == "tool_use"), None)
        data = dict(block.input) if block is not None else None
        raw = json.dumps(data) if data is not None else "".join(getattr(b, "text", "") for b in r.content)
        return ProviderResult(data=data, raw=raw, model=self.model,
                              input_tokens=r.usage.input_tokens, output_tokens=r.usage.output_tokens)

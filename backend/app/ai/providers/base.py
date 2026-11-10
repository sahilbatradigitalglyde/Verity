"""Provider interface. Nothing outside app/ai/providers knows which model answered."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass
class Message:
    role: str  # "user" | "assistant"
    content: str


@dataclass
class ProviderResult:
    data: dict | None          # parsed JSON object, or None when the reply was not JSON
    raw: str                   # raw text / tool input as text, stored on the AiRun
    model: str
    input_tokens: int | None = None
    output_tokens: int | None = None


class AIProvider(Protocol):
    key: str  # "azure" | "claude"

    def complete_json(self, *, system: str, messages: list[Message], schema: dict, schema_name: str) -> ProviderResult:
        """Send the conversation and return one JSON object that should match `schema`."""
        ...


class ProviderNotConfigured(RuntimeError):
    pass

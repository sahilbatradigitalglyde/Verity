# 11 · MCP

Not used in v1. Verity calls Azure OpenAI and Claude directly through its own provider interface.

Possible later use: expose Verity as an MCP server (tools: `list_cycles`, `get_report`, `record_result`) so teams can query test status from Claude or Copilot. Would sit on top of the same REST endpoints and the same Entra auth.

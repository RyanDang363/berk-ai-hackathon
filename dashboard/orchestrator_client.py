"""Seam for future command input (read-only baseline — NOT wired yet).

@spec DASH-IN-001 (deferred)

When command input is enabled later, implement `send_command` as a uAgents client that sends a
`ChatMessage` to the Orchestrator's address (pattern: fetch-ai-documentation/uagents-chat-protocol.md,
client-agent example). The HTTP route and frontend slot already exist behind `dashboard_allow_input`.
"""


def send_command(phrase: str) -> bool:
    """Forward a trigger phrase to the OrchestratorAgent. Not implemented in the read-only baseline."""
    raise NotImplementedError(
        "Command input is deferred (DASH-IN-001). Enable dashboard_allow_input and implement "
        "the uAgents ChatMessage client to activate."
    )

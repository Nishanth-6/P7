"""
Workshop — Step 1 of 3: System prompt only

This is a chatbot, not an agent. It can ONLY respond from the system prompt.
No tools means no way to look anything up — the model will hedge or guess.

Run it. Ask: what can it do? What CAN'T it do?
That gap is what step 2 fixes.

  pip install -r requirements.txt
  claude login                        # one-time, uses your Pro/Max subscription
  python 01_chat_only.py
"""

import asyncio
import tempfile
from claude_agent_sdk import (
    query,
    ClaudeAgentOptions,
    AssistantMessage,
    TextBlock,
)


# ── PART 1 of 3: SYSTEM PROMPT ───────────────────────────────────────
# The agent's job description. Change this string → change behavior.
# This is the only thing telling the model what to do.

SYSTEM = """You are a care coordinator analyst at a value-based primary care practice.
You help coordinators find patients at risk of avoidable ED visits.
There are 117 synthetic patients in our database."""


async def main():
    # Run in an empty temp dir so the agent can't read CLAUDE.md or other
    # project context — we want a clean "no tools, no context" baseline.
    with tempfile.TemporaryDirectory() as cwd:
        options = ClaudeAgentOptions(
            system_prompt=SYSTEM,
            cwd=cwd,
            allowed_tools=[],
            # Explicitly disable Claude Code's built-in tools so this is
            # truly a chatbot — no way to look anything up.
            disallowed_tools=[
                "Bash", "BashOutput", "Read", "Write", "Edit", "Glob", "Grep",
                "WebFetch", "WebSearch", "Task", "TodoWrite", "NotebookEdit",
                "KillShell", "SlashCommand",
            ],
        )

        async for message in query(
            prompt="Who are the 5 highest-cost patients? Show their names and costs.",
            options=options,
        ):
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        print(block.text)


asyncio.run(main())

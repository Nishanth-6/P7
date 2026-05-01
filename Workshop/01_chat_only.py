"""
Workshop — Step 1 of 3: System prompt only

This is a chatbot, not an agent. It can ONLY respond from the system prompt.
No tools means no way to look anything up — the model will hedge or guess.

Try asking it:
  - Who are the 5 highest-cost patients?
  - What conditions does Lindsay Brekke have?
  - Tell me what you know about value-based care.

The first two should fail (no data access).
The third works because it's general knowledge from the system prompt.
That gap is what step 2 fixes.

Type 'exit' or Ctrl+C to quit.

  pip install -r requirements.txt
  claude login
  python 01_chat_only.py
"""

import asyncio
import tempfile
from claude_agent_sdk import (
    ClaudeSDKClient,
    ClaudeAgentOptions,
    AssistantMessage,
    TextBlock,
)


# ── PART 1 of 3: SYSTEM PROMPT ───────────────────────────────────────
# The agent's job description. Change this string → change behavior.

SYSTEM = """You are a care coordinator analyst at a value-based primary care practice.
You help coordinators find patients at risk of avoidable ED visits.
There are 117 synthetic patients in our database."""


async def main():
    # Run in an empty temp dir so the agent can't read CLAUDE.md / project context.
    with tempfile.TemporaryDirectory() as cwd:
        options = ClaudeAgentOptions(
            system_prompt=SYSTEM,
            cwd=cwd,
            allowed_tools=[],
            disallowed_tools=[
                "Bash", "BashOutput", "Read", "Write", "Edit", "Glob", "Grep",
                "WebFetch", "WebSearch", "Task", "TodoWrite", "NotebookEdit",
                "KillShell", "SlashCommand",
            ],
        )

        async with ClaudeSDKClient(options=options) as client:
            print("─" * 60)
            print("STEP 1: System prompt only. No tools. No data access.")
            print("─" * 60)
            print("Try asking:")
            print("  • Who are the 5 highest-cost patients?     (it can't — no tool)")
            print("  • Tell me about value-based care.          (works — general knowledge)")
            print("Type 'exit' to quit.\n")

            while True:
                try:
                    user_input = input("\n💬 Your question › ").strip()
                except (EOFError, KeyboardInterrupt):
                    print()
                    break
                if not user_input or user_input.lower() in ("exit", "quit"):
                    break

                await client.query(user_input)
                print("\n🤖 Agent ›\n")
                async for message in client.receive_response():
                    if isinstance(message, AssistantMessage):
                        for block in message.content:
                            if isinstance(block, TextBlock):
                                print(block.text, end="", flush=True)
                print()


asyncio.run(main())

"""
Workshop — Step 2 of 3: Add a tool

Now the agent has a tool. Watch it decide to call query_database, write SQL,
get rows back, and synthesize an answer.

Try asking:
  - Who are the 5 highest-cost patients?
  - How many patients have no active care plan?
  - Find patients with chronic migraine.

Watch the agent adapt mid-conversation when SQL fails (e.g., it'll try
'first_name' first, get 0 rows, inspect the schema, retry with 'first').

Type 'exit' or Ctrl+C to quit.

  pip install -r requirements.txt
  claude login
  python 02_with_tool.py
"""

import asyncio
import tempfile
import requests
from typing import Any

from claude_agent_sdk import (
    ClaudeSDKClient,
    ClaudeAgentOptions,
    tool,
    create_sdk_mcp_server,
    AssistantMessage,
    UserMessage,
    TextBlock,
    ToolUseBlock,
)


# ANSI colors for harness-vs-content visual distinction
DIM = "\033[2m"
CYAN = "\033[36m"
RESET = "\033[0m"


D1 = "https://uic-hackathon-data.christian-7f4.workers.dev/query"


# ── PART 1 of 3: SYSTEM PROMPT ───────────────────────────────────────

SYSTEM = """You are a care coordinator analyst at a value-based primary care practice.
You help coordinators find patients at risk of avoidable ED visits.

You have a database of 117 synthetic patients. Use the query_database tool
to look things up. Always start with the patient_summary table — it has
one row per patient with pre-computed costs and visit counts.

Names in this dataset have numeric suffixes (Lindsay928 Brekke496) — use
LIKE with LOWER() for fuzzy matching."""


# ── PART 2 of 3: TOOLS ───────────────────────────────────────────────
# A tool has two parts: WHAT runs (the Python function) and a SCHEMA the
# model reads to know it exists. The model never runs code — it asks us
# to run the function with specific arguments.

@tool(
    "query_database",
    "Run a SQL SELECT against the patient dataset. Returns JSON.",
    {"sql": str},
)
async def query_database(args: dict[str, Any]) -> dict[str, Any]:
    result = requests.post(D1, json={"sql": args["sql"]}, timeout=10).json()
    return {"content": [{"type": "text", "text": str(result)}]}


async def main():
    db = create_sdk_mcp_server(
        name="db", version="1.0.0", tools=[query_database]
    )

    with tempfile.TemporaryDirectory() as cwd:
        options = ClaudeAgentOptions(
            system_prompt=SYSTEM,
            cwd=cwd,
            mcp_servers={"db": db},
            allowed_tools=["mcp__db__query_database"],
            disallowed_tools=[
                "Bash", "BashOutput", "Read", "Write", "Edit", "Glob", "Grep",
                "WebFetch", "WebSearch", "Task", "TodoWrite", "NotebookEdit",
                "KillShell", "SlashCommand",
            ],
        )

        async with ClaudeSDKClient(options=options) as client:
            print("─" * 60)
            print("STEP 2: System prompt + 1 tool (query_database).")
            print("─" * 60)
            print("Try asking:")
            print("  • Who are the 5 highest-cost patients?")
            print("  • How many patients have no active care plan?")
            print("  • Find patients with chronic migraine.")
            print("Watch the SQL the agent writes (printed below '→').")
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
                            if isinstance(block, ToolUseBlock):
                                if block.name.startswith("mcp__"):
                                    short = block.name.split("__")[-1]
                                    sql = block.input.get("sql", "") if isinstance(block.input, dict) else ""
                                    print(f"{CYAN}🔧 {short}: {sql}{RESET}", flush=True)
                            elif isinstance(block, TextBlock):
                                print(block.text, end="", flush=True)
                    elif isinstance(message, UserMessage):
                        for block in message.content:
                            content = getattr(block, "content", None)
                            if isinstance(content, list):
                                for item in content:
                                    text = item.get("text", "") if isinstance(item, dict) else ""
                                    if "'count':" in text:
                                        try:
                                            count = text.split("'count':")[1].split(",")[0].strip()
                                            print(f"{DIM}   ← {count} rows{RESET}", flush=True)
                                        except (IndexError, ValueError):
                                            pass
                print()


asyncio.run(main())

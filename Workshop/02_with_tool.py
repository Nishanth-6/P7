"""
Workshop — Step 2 of 3: Add a tool

Now the model can DO something — query the live patient database.
Watch the agent decide to call the tool, run it, see the result, then answer.

The agent is making decisions about WHAT to query and WHEN. You didn't
hardcode the SQL — the model wrote it based on the question.

  pip install -r requirements.txt
  claude login
  python 02_with_tool.py
"""

import asyncio
import tempfile
import requests
from typing import Any

from claude_agent_sdk import (
    query,
    ClaudeAgentOptions,
    tool,
    create_sdk_mcp_server,
    AssistantMessage,
    TextBlock,
    ToolUseBlock,
)


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
# A tool has two parts: WHAT runs (the Python function) and a SCHEMA
# the model reads to know it exists. The model never runs code — it
# asks us to run the function with specific arguments.

@tool(
    "query_database",
    "Run a SQL SELECT against the patient dataset. Returns JSON.",
    {"sql": str},
)
async def query_database(args: dict[str, Any]) -> dict[str, Any]:
    sql = args["sql"]
    print(f"\n  → SQL: {sql}")
    result = requests.post(D1, json={"sql": sql}, timeout=10).json()
    print(f"  ← {result.get('count', 0)} rows returned\n")
    return {"content": [{"type": "text", "text": str(result)}]}


async def main():
    db = create_sdk_mcp_server(
        name="db", version="1.0.0", tools=[query_database]
    )

    # Empty cwd + disabled built-ins so the ONLY tool available is ours.
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

        async for message in query(
            prompt="Who are the 5 highest-cost patients? Show their name, cost, and visit counts.",
            options=options,
        ):
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        print(block.text)


asyncio.run(main())

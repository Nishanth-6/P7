"""
Workshop — Step 3 of 3: Multiple tools, chained decisions

Now the agent has a CHOICE — it has multiple tools and has to pick the right
one for each step. Watch it decompose the question, call tool A to find a
patient, then call tool B to look up their conditions, then synthesize.

This is the agent loop in action. Same `query()` call as step 2, but the
agent makes 3+ decisions before answering. You can see every one.

  pip install -r requirements.txt
  claude login
  python 03_full_loop.py
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
)


D1 = "https://uic-hackathon-data.christian-7f4.workers.dev/query"


# ── PART 1 of 3: SYSTEM PROMPT ───────────────────────────────────────

SYSTEM = """You are a care coordinator analyst at a value-based primary care practice.
You have 117 synthetic patients in a database.

Names have numeric suffixes (Lindsay928 Brekke496) — use LIKE with LOWER() for matching.
The patient_summary view has one row per patient with pre-computed costs and visit counts.
The conditions table has STOP IS NULL = active.
Active SDOH conditions are in the conditions table — search DESCRIPTION for things like
'transport', 'housing', 'employ', 'stress', 'food', 'partner abuse'.

When investigating a patient, use the tools in sequence:
1. list_high_cost_patients to identify candidates
2. get_patient_conditions to understand WHY they're high-cost
3. Then synthesize for the coordinator."""


# ── PART 2 of 3: MULTIPLE TOOLS ──────────────────────────────────────
# Now the agent has to PICK the right tool for each step.

@tool(
    "list_high_cost_patients",
    "Return the top N highest-cost patients ranked by ED + inpatient cost. "
    "Use this to identify who needs investigation.",
    {"limit": int},
)
async def list_high_cost_patients(args: dict[str, Any]) -> dict[str, Any]:
    limit = args["limit"]
    sql = (
        "SELECT id, first, last, ed_inpatient_total_cost, ed_visits, "
        "inpatient_visits, chronic_condition_count, has_active_careplan "
        f"FROM patient_summary ORDER BY ed_inpatient_total_cost DESC LIMIT {limit}"
    )
    print(f"\n  → list_high_cost_patients(limit={limit})")
    result = requests.post(D1, json={"sql": sql}, timeout=10).json()
    print(f"  ← {result.get('count', 0)} patients\n")
    return {"content": [{"type": "text", "text": str(result)}]}


@tool(
    "get_patient_conditions",
    "Return all active conditions (clinical AND social/SDOH) for a specific patient ID. "
    "Call this AFTER you've identified a patient via list_high_cost_patients.",
    {"patient_id": str},
)
async def get_patient_conditions(args: dict[str, Any]) -> dict[str, Any]:
    pid = args["patient_id"].replace("'", "''")
    sql = (
        "SELECT DESCRIPTION FROM conditions "
        f"WHERE PATIENT = '{pid}' AND STOP IS NULL LIMIT 100"
    )
    print(f"\n  → get_patient_conditions(patient_id={args['patient_id'][:8]}...)")
    result = requests.post(D1, json={"sql": sql}, timeout=10).json()
    print(f"  ← {result.get('count', 0)} active conditions\n")
    return {"content": [{"type": "text", "text": str(result)}]}


# ── PART 3 of 3: THE LOOP (handled by the SDK) ───────────────────────
# `query()` runs the agent loop for us: send → tool? → run → loop.
# We just iterate over the messages it produces.

async def main():
    server = create_sdk_mcp_server(
        name="hc",
        version="1.0.0",
        tools=[list_high_cost_patients, get_patient_conditions],
    )

    with tempfile.TemporaryDirectory() as cwd:
        options = ClaudeAgentOptions(
            system_prompt=SYSTEM,
            cwd=cwd,
            mcp_servers={"hc": server},
            allowed_tools=[
                "mcp__hc__list_high_cost_patients",
                "mcp__hc__get_patient_conditions",
            ],
            disallowed_tools=[
                "Bash", "BashOutput", "Read", "Write", "Edit", "Glob", "Grep",
                "WebFetch", "WebSearch", "Task", "TodoWrite", "NotebookEdit",
                "KillShell", "SlashCommand",
            ],
        )

        async for message in query(
            prompt=(
                "Find the single highest-cost patient. "
                "Then explain WHY they're so expensive — what conditions are driving it, "
                "and whether any of them are social/SDOH-related. "
                "Recommend one specific intervention."
            ),
            options=options,
        ):
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        print(block.text)


asyncio.run(main())

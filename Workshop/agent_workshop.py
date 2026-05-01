"""
Build with Claude: Agents for Healthcare
Workshop live-coding example — UIC College of Business, May 1 2026

Three parts. Type each one, run it, see what changes.

  pip install anthropic requests
  export ANTHROPIC_API_KEY=your_key_here
  python agent_workshop.py
"""

import os, json, requests, anthropic

D1 = "https://uic-hackathon-data.christian-7f4.workers.dev/query"
client = anthropic.Anthropic()

# ── PART 1: SYSTEM PROMPT ─────────────────────────────────────────────
# The agent's job description. This alone makes it a chatbot.
# Change this string → change everything the agent does.

SYSTEM = """You are a care coordinator analyst at a value-based primary care practice.
You help coordinators find patients at risk of avoidable ED visits.
117 synthetic patients are in the database. Start with patient_summary.
Before recommending any action, ask the coordinator to confirm."""


# ── PART 2: TOOLS ────────────────────────────────────────────────────
# Two things per tool: what runs (Python) + what the LLM sees (schema).
# The LLM never runs code — it reads the schema and asks you to run it.

def query_database(sql):
    return requests.post(D1, json={"sql": sql}, timeout=10).json()

TOOLS = [{
    "name": "query_database",
    "description": "Run a SQL SELECT on the patient dataset. Start with patient_summary.",
    "input_schema": {
        "type": "object",
        "properties": {"sql": {"type": "string"}},
        "required": ["sql"]
    }
}]


# ── PART 3: THE LOOP ─────────────────────────────────────────────────
# This is the "agent" part. Send → tool_use → run → loop → end_turn.
# Everything in agents-starter wraps exactly this pattern.

def run(question):
    messages = [{"role": "user", "content": question}]
    while True:
        r = client.messages.create(
            model="claude-opus-4-5", max_tokens=2048,
            system=SYSTEM, tools=TOOLS, messages=messages
        )
        messages.append({"role": "assistant", "content": r.content})

        if r.stop_reason == "end_turn":
            print(next(b.text for b in r.content if hasattr(b, "text")))
            break

        results = []
        for b in r.content:
            if b.type == "tool_use":
                print(f"\n→ {b.name}({b.input})")
                out = query_database(b.input["sql"])
                print(f"  {out.get('count', 0)} rows")
                results.append({"type": "tool_result", "tool_use_id": b.id, "content": json.dumps(out)})
        messages.append({"role": "user", "content": results})


# ── RUN IT ───────────────────────────────────────────────────────────

run("Who are the 5 highest-cost patients? Show their name, cost, and visit counts.")

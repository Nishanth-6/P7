"""
Workshop — Step 3 of 3: The agentic loop

Now the model can iterate: call a tool, see the results, decide what's next,
call another tool, eventually answer.

This is the agent. Everything in agents-starter, the Cloudflare path,
LangChain, OpenAI Assistants — they all wrap this exact pattern.

  pip install anthropic requests
  export ANTHROPIC_API_KEY=your_key_here
  python 03_full_loop.py
"""

import json
import requests
import anthropic

D1 = "https://uic-hackathon-data.christian-7f4.workers.dev/query"
client = anthropic.Anthropic()

# ── PART 1 of 3: SYSTEM PROMPT ───────────────────────────────────────

SYSTEM = """You are a care coordinator analyst at a value-based primary care practice.
You help coordinators find patients at risk of avoidable ED visits.
There are 117 synthetic patients in our database. Start with patient_summary.

Before recommending any action, summarize what you found and ask the coordinator
to confirm before proceeding."""


# ── PART 2 of 3: TOOLS ───────────────────────────────────────────────

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


# ── PART 3 of 3: THE LOOP ────────────────────────────────────────────
# Send → if tool_use, run tool, append result, loop again.
# If end_turn, we're done.

def run(question):
    messages = [{"role": "user", "content": question}]

    while True:
        r = client.messages.create(
            model="claude-opus-4-5",
            max_tokens=2048,
            system=SYSTEM,
            tools=TOOLS,
            messages=messages
        )
        messages.append({"role": "assistant", "content": r.content})

        if r.stop_reason == "end_turn":
            for block in r.content:
                if hasattr(block, "text"):
                    print(block.text)
            break

        # The model wants to use a tool. Run each one, send results back.
        results = []
        for block in r.content:
            if block.type == "tool_use":
                print(f"\n→ {block.name}({block.input})")
                out = query_database(block.input["sql"])
                print(f"  {out.get('count', 0)} rows returned\n")
                results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(out)
                })
        messages.append({"role": "user", "content": results})


run("Who are the 5 highest-cost patients? Show their name, cost, and visit counts.")

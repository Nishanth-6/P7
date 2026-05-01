"""
Workshop — Step 2 of 3: Add a tool (no loop yet)

Now the model can ASK to call a tool. We execute it. We get results.
But there's no loop, so the model never sees the results.

Watch what happens: the model says "I'd like to query the DB."
We run the query. We have data. The model... never gets it.
That gap is what step 3 fixes.

  pip install anthropic requests
  export ANTHROPIC_API_KEY=your_key_here
  python 02_with_tool.py
"""

import requests
import anthropic

D1 = "https://uic-hackathon-data.christian-7f4.workers.dev/query"
client = anthropic.Anthropic()

# ── PART 1 of 3: SYSTEM PROMPT ───────────────────────────────────────

SYSTEM = """You are a care coordinator analyst at a value-based primary care practice.
You help coordinators find patients at risk of avoidable ED visits.
There are 117 synthetic patients in our database. Start with patient_summary."""


# ── PART 2 of 3: TOOLS ───────────────────────────────────────────────
# Two parts per tool: what runs (Python) + what the LLM sees (schema).
# The LLM never runs code — it reads the schema and asks us to run it.

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


def ask(question):
    response = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=2048,
        system=SYSTEM,
        tools=TOOLS,
        messages=[{"role": "user", "content": question}]
    )

    if response.stop_reason == "tool_use":
        for block in response.content:
            if block.type == "tool_use":
                print(f"\n[Model wants to run: {block.name}]")
                print(f"  SQL: {block.input['sql']}")
                result = query_database(block.input["sql"])
                print(f"  Got back: {result.get('count', 0)} rows\n")
                print("⚠️  ...but the model never sees this result.")
                print("⚠️  We have no loop, so it can't formulate a final answer.")
    else:
        for block in response.content:
            if hasattr(block, "text"):
                print(block.text)


ask("Who are the 5 highest-cost patients? Show their name, cost, and visit counts.")

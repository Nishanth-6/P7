"""
Workshop — Step 1 of 3: System prompt only

This is a chatbot, not an agent. It can ONLY respond from the system prompt.
No tools, no loop. The model has no way to look anything up.

Run it. Ask: what can it do? What can't it do?
That gap is what step 2 fixes.

  pip install anthropic
  export ANTHROPIC_API_KEY=your_key_here
  python 01_chat_only.py
"""

import anthropic

client = anthropic.Anthropic()

# ── PART 1 of 3: SYSTEM PROMPT ───────────────────────────────────────
# The agent's job description. Change this string → change behavior.

SYSTEM = """You are a care coordinator analyst at a value-based primary care practice.
You help coordinators find patients at risk of avoidable ED visits.
There are 117 synthetic patients in our database."""


def ask(question):
    response = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=1024,
        system=SYSTEM,
        messages=[{"role": "user", "content": question}]
    )
    for block in response.content:
        if hasattr(block, "text"):
            print(block.text)


ask("Who are the 5 highest-cost patients? Show their names and costs.")

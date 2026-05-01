# Workshop — Build an Agent in 3 Steps

Three Python files, designed to be run in order. Each adds one component:

| File | What it adds | What you can do with it |
|---|---|---|
| `01_chat_only.py` | System prompt only | Chat — but it can't look anything up |
| `02_with_tool.py` | + a custom tool | Agent calls the tool, gets real data, answers |
| `03_full_loop.py` | + a second tool | Agent picks among tools, chains them, synthesizes |

That progression — **prompt → tools → loop** — is the entire pattern.
The Claude Agent SDK runs the loop for you; you watch it happen.

## Auth: uses your Claude.ai subscription, no API key

The Claude Agent SDK runs on top of the Claude Code CLI — which authenticates
via your **Claude Pro / Max / Team subscription**. No separate API key, no
credit card.

## Setup (one time, ~2 minutes)

```bash
# Install the Claude Code CLI if you don't have it
# (macOS) brew install anthropics/tap/claude-code
# (other) https://docs.claude.com/en/docs/claude-code

# Log in with your Claude.ai subscription
claude login

# From the repo root, install the Python deps
python3 -m venv .venv && source .venv/bin/activate
pip install -r Workshop/requirements.txt
```

If you'd rather skip the venv: `pip3 install --break-system-packages -r Workshop/requirements.txt` works on Homebrew Python.

## Run them in order

```bash
python Workshop/01_chat_only.py    # admits it has no data access
python Workshop/02_with_tool.py    # queries the DB, answers
python Workshop/03_full_loop.py    # chains 2 tools, synthesizes a recommendation
```

## What to notice at each step

**Step 1 — System prompt only.** The model has knowledge from the system
prompt but no live data. It will say "I don't have access to your database
— I'd need a tool or for you to paste the data." That gap is the whole
point. Without tools, an LLM is just a chatbot.

**Step 2 — Add the tool.** Watch the agent decide to call `query_database`,
write SQL, get rows back, and synthesize an answer. **Bonus:** when you run
it, you'll likely see it try `first_name` first (gets 0 rows because
Synthea uses `FIRST`), inspect the schema, and retry with the right
column. That's the agent adapting to dirty data — a real-world skill.

**Step 3 — Multiple tools, chained.** Now there are TWO tools and the
agent has to pick. Watch it call `list_high_cost_patients` first to find
a candidate, then `get_patient_conditions` to understand WHY they're
expensive, then synthesize a clinical + SDOH narrative with a specific
recommendation. The agent decomposed the problem and chained tool calls
without you writing a single line of orchestration code.

## Try modifying

Once step 3 works, try these:

1. **Change the question** — "Find patients with no active care plan and substance use issues."
2. **Add a third tool** — one that drafts an outreach message. Watch the agent call it as the last step.
3. **Change the system prompt** — tell it to refuse to recommend anything without explicit coordinator approval. See how the output changes.
4. **Remove the SDOH instructions** from the system prompt and run step 3 again. Notice what's missing from the answer.

## Where this goes next

The Cloudflare path (`docs/cloudflare_deploy.md`) wraps this same pattern in:
- A web UI instead of a terminal
- Persistent state (conversation survives across browser refreshes)
- Streaming responses (you see the answer build word by word)
- Tool approval dialogs (the human-in-the-loop pattern)
- Free hosting via **Workers AI** (no key needed)

Same loop. Different harness.

The hackathon-guide chatbot at <https://uic-hackathon-guide.christian-7f4.workers.dev>
is a deployed example you can poke at right now.

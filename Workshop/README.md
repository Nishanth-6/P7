# Workshop — Build an Agent in 3 Steps

Three Python files, designed to be run in order. Each adds one component:

| File | What it adds | What you can do with it |
|---|---|---|
| `01_chat_only.py` | System prompt | Chat — but it can't look anything up |
| `02_with_tool.py` | + a tool definition | Model asks to run a query — but never sees the result |
| `03_full_loop.py` | + the agentic loop | Full agent — calls tools, sees results, iterates, answers |

That progression — **prompt → tools → loop** — is the entire pattern.
Everything in agents-starter, LangChain, OpenAI Assistants, etc. is just
this same loop with more wiring.

## Setup

```bash
pip install anthropic requests
export ANTHROPIC_API_KEY=your_key_here
```

> **No API key?** Use the Cloudflare Workers path instead — Workers AI is
> free, no key needed. See `docs/cloudflare_deploy.md`. The Python files
> here are for learning the pattern.

## Run them in order

```bash
python Workshop/01_chat_only.py    # chats but can't look anything up
python Workshop/02_with_tool.py    # tool fires but result is dropped
python Workshop/03_full_loop.py    # full agent — works end to end
```

## What to notice

**After step 1:** The model has knowledge from the system prompt but no live
data. It will hedge — "I'd need access to the database to tell you..."

**After step 2:** Watch the output. The model wants to run SQL. We execute
the SQL. We get rows back. The model never sees them — we have no loop.
This is the "missing piece" that makes step 3 click.

**After step 3:** The model queries, sees results, formulates an answer.
That's it. That's the agent.

## Try modifying

Once step 3 works, try these:

1. **Change the question** — "Find patients with no active care plan"
2. **Add a second tool** — one that drafts an outreach message
3. **Add a confirmation step** — print the draft, wait for `input("Approve? ")` before continuing
4. **Break the loop deliberately** — what happens if you remove the `end_turn` check?

## Where this goes next

The Cloudflare path (`docs/cloudflare_deploy.md`) wraps this same pattern in:
- A web UI instead of a terminal
- Persistent state (conversation survives across browser refreshes)
- Streaming responses (you see the answer build word by word)
- Tool approval dialogs (the "human-in-the-loop" pattern)
- Free hosting (no API key needed — Workers AI)

Same loop. Different harness.

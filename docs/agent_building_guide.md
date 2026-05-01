# Agent Building Guide

## What is an agent?

An agent has three parts:

```
System Prompt  →  what the agent's job is and how it should behave
Tools          →  what the agent can actually DO (query a database, call an API, send an alert)
Loop           →  keeps running until the task is done or it needs human input
```

A chatbot responds once. An **agent** takes multiple steps, uses tools, and keeps going until it achieves a goal.

---

## The pattern in pseudocode

```
messages = [user's initial request]

loop:
    response = llm(system_prompt, tools, messages)
    
    if response.stop == "done":
        print(response.text)
        break
    
    if response.stop == "tool_use":
        for each tool_call in response:
            result = run_tool(tool_call.name, tool_call.inputs)
            messages.append(tool_result)
        # loop again with results
```

That's it. Both example files implement exactly this.

---

## The system prompt is your most important decision

Bad system prompt:
> "You are a helpful healthcare assistant."

Better:
> "You are a care coordinator assistant. Your job is to identify patients at risk of avoidable ED visits. Use the query_database tool to investigate. Consider both clinical factors (chronic conditions, gaps in care) and social factors (housing, food insecurity, employment). Before recommending any outreach, summarize your reasoning and ask me to confirm."

A good system prompt specifies:
- The agent's role and context
- The goal it's trying to achieve
- How to use each tool
- When to stop and ask the human
- What the output should look like

---

## Designing your tools

Each tool is two things: **what the LLM sees** (the schema) and **what actually runs** (the function).

```python
# What the LLM sees — write this carefully, it's read by the model
{
    "name": "query_database",
    "description": "Run a SQL SELECT against patient data. Returns JSON.",
    "input_schema": { "type": "object", "properties": { "sql": {...} } }
}

# What actually runs
def query_database(sql):
    return requests.post(D1_API_URL, json={"sql": sql}).json()
```

**Tool design tips for the hackathon:**
- Start with one tool: `query_database`. Get it working end-to-end before adding more.
- Describe tables and columns in the tool description — the LLM uses this to write good SQL.
- Add a second tool when you have a specific action that isn't just querying data (e.g., `generate_care_plan`, `calculate_risk_score`).
- 3 well-defined tools beat 7 vague ones.

---

## Human-in-the-loop

This is worth 20% of your score — and judges will evaluate whether human involvement *meaningfully changes the outcome*, not just whether a confirmation box exists.

**Weak HITL:** Agent runs, prints results, asks "Does this look good? [y/n]"

**Strong HITL:** Agent surfaces a care recommendation, explains its reasoning, shows confidence level, and asks the coordinator a *specific question* that only a human with local knowledge could answer — like "I see Lindsay has transportation barriers flagged. Does she have family who can drive her, or should we contact the medical transport program?"

The coordinator's answer should change what the agent does next.

---

## Scope management

The biggest failure mode in a 2-hour hackathon is over-engineering.

**Scope that works:**
- 1 clear input (a patient or a question)
- 2-3 tools (query data, maybe compute something, maybe generate a plan)
- 1 human decision point
- Clear output (ranked list, care plan, cost breakdown)

**Scope that crashes:**
- Dynamic tool generation
- Multi-agent coordination
- Real-time data streaming
- Custom vector search
- Anything requiring a database migration mid-hack

Build the smallest thing that *works as a real agent*. A narrow agent that runs end-to-end beats an ambitious one that errors out during the demo.

---

## Adding a UI (optional)

You don't need a UI to demo. A terminal running your agent script is a valid demo.

If you want a UI:
- **Simplest:** Streamlit (Python) — `pip install streamlit`, wrap the agent in `st.chat_input`
- **With a web server:** FastAPI + basic HTML frontend
- **Cloudflare Workers + Chat UI:** Fork the `cloudflare/agents-starter` template — it has a prebuilt React chat UI, streaming, and tool confirmation dialogs

---

## Checklist before you demo

- [ ] Agent runs end-to-end without errors on your demo patient
- [ ] Tools actually query the D1 database and return results
- [ ] Human-in-the-loop point exists AND the human's input affects the outcome
- [ ] You can explain: "Here's the problem → here's what the agent does → here's the impact"
- [ ] Demo patient is one of the protagonists (Giovanni, Lindsay, Chad, Chantelle, Soledad)
- [ ] You've rehearsed the 5-minute flow at least once

---

## Common errors

**SQL join error:** `claims_transactions` uses `PATIENTID` (not `PATIENT`) as the patient key. Every other table uses `PATIENT`.

**Empty results:** Try `SELECT * FROM patient_summary LIMIT 5` first to confirm the connection works.

**Tool not being called:** Check the tool description. If it's vague or the parameter names don't match, the LLM may not call it correctly. Be explicit: "Call this tool whenever you need to look up patient data."

**Agent loops forever:** Add a `max_iterations` counter as a safeguard. Alternatively, check that tool results are being appended to `messages` correctly — if they're not, the agent keeps calling the same tool.

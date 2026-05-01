# Examples

Two minimal working agents — same pattern, different languages. Pick one and build from there.

## What they show

Both examples demonstrate the same three-part pattern:

1. **System prompt** — the agent's job description and behavioral rules
2. **Tool definition** — what the agent can call (`query_database` hits the D1 API)
3. **Agentic loop** — send message → get response → if tool use, run tool → loop until done

## Python

```bash
cd python
pip install -r requirements.txt
export ANTHROPIC_API_KEY=your_key_here
python agent_example.py
```

Requires Python 3.9+. Uses `anthropic` + `requests`.

## TypeScript

```bash
cd typescript
npm install
export ANTHROPIC_API_KEY=your_key_here
npx ts-node agent_example.ts
```

Requires Node 18+. Uses `@anthropic-ai/sdk`.

## Swapping providers

The examples use Anthropic, but the pattern works with any provider. The main differences:
- Tool schema format (Anthropic uses `input_schema`, OpenAI uses `parameters`)
- Tool call detection in the response (`stop_reason === "tool_use"` vs `finish_reason === "tool_calls"`)
- How tool results are returned in the messages array

If you're using Cursor, Gemini, Copilot, or another assistant to help you build, just show it one of these examples and say "adapt this for [provider X]" — it'll know what to do.

## Building on top of these

From here, teams typically:
1. **Add more tools** — a second SQL query (different table), a scoring function, a "format care plan" tool
2. **Improve the system prompt** — add more context about your specific prompt, define what the output should look like
3. **Add human-in-the-loop** — pause before taking action, print a confirmation prompt, wait for user input
4. **Build a UI** — pipe the agent into a web server, a Streamlit app, a simple HTML page

See `docs/agent_building_guide.md` for guidance on each of these steps.

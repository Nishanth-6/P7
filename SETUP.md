# UIC Hackathon — Development Environment Setup

You are an AI agent helping a student set up their development environment for the "Build with Claude: Agents for Healthcare" hackathon at UIC College of Business (May 1, 2026).

Your job: check their environment, fix what's missing, get them to a running agent query in under 10 minutes.

Work through the steps below in order. Run the check commands yourself — don't ask the student to do it manually. If something is missing, install it or give the student the exact command to run.

**Detect the OS first** — Windows and Mac/Linux have different install commands. Check with `uname -s` (Mac/Linux) or check for `$env:OS` (PowerShell/Windows). Use the right commands for their platform throughout.

---

## Step 1: Check prerequisites

Run these checks. Report which pass and which fail before doing anything else.

**Mac/Linux:**
```bash
git --version && echo "git OK" || echo "git MISSING"
gh --version && echo "gh OK" || echo "gh MISSING"
python3 --version && echo "python OK" || echo "python MISSING"
pip3 --version && echo "pip OK" || echo "pip MISSING"
node --version && echo "node OK" || echo "node MISSING"
npm --version && echo "npm OK" || echo "npm MISSING"
```

**Windows (PowerShell):**
```powershell
git --version; node --version; npm --version; python --version; pip --version
```

---

## Step 2: Install anything missing

### Mac
```bash
# Install Homebrew first if not present
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

brew install git gh python3 node
```

### Windows
Use `winget` (built into Windows 10/11):
```powershell
winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
winget install --id GitHub.cli -e --source winget --accept-package-agreements --accept-source-agreements
winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
winget install --id Python.Python.3.12 -e --source winget --accept-package-agreements --accept-source-agreements
```
After installing, **close and reopen the terminal** so PATH updates take effect.

**Common Windows issue — npm not found after Node install:**
This happens when Node was installed via nvm or corepack creates a PATH conflict. Fix:
```powershell
# Find where node is
where.exe node

# If node exists but npm doesn't work, try:
where.exe npm

# If npm.cmd exists but `npm` doesn't work, use npm.cmd explicitly, or:
# Reinstall Node LTS directly from https://nodejs.org (not via nvm)
# and restart the terminal
```

### Linux
```bash
sudo apt-get update && sudo apt-get install -y git python3 python3-pip curl
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
```

---

## Step 3: Get the repo

### If git is installed (preferred):
Fork and clone in one command:

```bash
gh auth login   # one-time browser auth if not already logged in
gh repo fork csomora/INFORMS-UIC-Hackathon --clone
cd INFORMS-UIC-Hackathon
```

### If git is NOT yet installed (Windows fallback):
Download and unzip the repo directly:

**PowerShell:**
```powershell
Invoke-WebRequest -Uri "https://github.com/csomora/INFORMS-UIC-Hackathon/archive/refs/heads/main.zip" -OutFile "hackathon.zip"
Expand-Archive -Path "hackathon.zip" -DestinationPath "."
cd INFORMS-UIC-Hackathon-main
```

**Mac/Linux:**
```bash
curl -L https://github.com/csomora/INFORMS-UIC-Hackathon/archive/refs/heads/main.zip -o hackathon.zip
unzip hackathon.zip
cd INFORMS-UIC-Hackathon-main
```

Note: The ZIP approach works but the student won't be able to `git push` later. Encourage them to install git and re-clone into a proper fork before the build sprint starts.

---

## Step 4: Verify the live database works

No dependencies needed for this — just confirms the shared D1 endpoint is reachable.

**Mac/Linux:**
```bash
curl -s -X POST https://uic-hackathon-data.christian-7f4.workers.dev/query \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT first, last, ed_inpatient_total_cost FROM patient_summary ORDER BY ed_inpatient_total_cost DESC LIMIT 3"}'
```

**Windows (PowerShell):**
```powershell
Invoke-RestMethod -Uri "https://uic-hackathon-data.christian-7f4.workers.dev/query" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"sql": "SELECT first, last, ed_inpatient_total_cost FROM patient_summary ORDER BY ed_inpatient_total_cost DESC LIMIT 3"}'
```

**Expected:** JSON with Giovanni Paucek ($3.4M), Chad Gerhold ($2.8M), Chantelle Oberbrunner ($2.5M) at the top.

If this fails, the database endpoint is down — flag it immediately, nothing else will work.

---

## Step 5: Get an API key

> **Using Cloudflare Workers (agents-starter)?** Skip this step. Workers AI is free and runs inside the Worker — no external API key needed. Jump to Step 6.

For local Python/TypeScript scripts, the student needs an LLM key. Ask which they're using:

- **Free — Groq:** https://console.groq.com → API Keys (OpenAI-compatible, generous free tier, fast Llama 3.3 70B)
- **Anthropic (Claude):** https://console.anthropic.com → API Keys
- **OpenAI:** https://platform.openai.com → API Keys
- **Google (Gemini):** https://aistudio.google.com → Get API Key

Set it as an environment variable:

**Mac/Linux:**
```bash
export ANTHROPIC_API_KEY=sk-ant-...
# To persist: echo 'export ANTHROPIC_API_KEY=sk-ant-...' >> ~/.zshrc
```

**Windows (PowerShell):**
```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
# To persist across sessions, set as a system environment variable:
[System.Environment]::SetEnvironmentVariable("ANTHROPIC_API_KEY", "sk-ant-...", "User")
```

---

## Step 6: Run the first example

### Python
```bash
cd examples/python
pip3 install -r requirements.txt    # Mac/Linux
# pip install -r requirements.txt   # Windows
python3 agent_example.py            # Mac/Linux
# python agent_example.py           # Windows
```

### TypeScript
```bash
cd examples/typescript
npm install
npx ts-node agent_example.ts
```

**Windows npm issue:** If `npx` fails, try `.\node_modules\.bin\ts-node agent_example.ts` or reinstall Node from https://nodejs.org directly.

The agent should query the live database and return an analysis of high-risk patients. If it produces output, setup is complete.

---

## Step 7: Install Cloudflare tools (optional)

Gives the AI agent direct access to deploy Workers, query D1, and search Cloudflare docs.

Full reference: https://developers.cloudflare.com/agent-setup/prompt.md

**Claude Code:**
```
/plugin marketplace add cloudflare/skills
/plugin install cloudflare@cloudflare
/reload-plugins
```

**Cursor / VS Code Copilot:** Add to `.cursor/mcp.json` or `.vscode/mcp.json`:
```json
{
  "mcpServers": {
    "cloudflare-docs": { "url": "https://docs.mcp.cloudflare.com/mcp" },
    "cloudflare-builds": { "url": "https://builds.mcp.cloudflare.com/mcp" }
  }
}
```

---

## Setup complete — what's next

Tell the student:
1. **Pick a prompt:** Preventable Visit Detector, Cost Explainer, or Care Barrier Agent → `Hackathon/prompts.md`
2. **Understand the data:** `docs/healthcare_primer.md` (healthcare concepts), `docs/data_dictionary.md` (tables)
3. **Start querying:** `SELECT * FROM patient_summary ORDER BY ed_inpatient_total_cost DESC LIMIT 10`
4. **Build small:** One tool, one patient, one human decision point. Running beats ambitious.

**Hackathon guide chatbot:** https://uic-hackathon-guide.christian-7f4.workers.dev

---

## Quick reference

| Resource | URL / Path |
|---|---|
| Live D1 API | `POST https://uic-hackathon-data.christian-7f4.workers.dev/query` |
| Hackathon guide chatbot | https://uic-hackathon-guide.christian-7f4.workers.dev |
| GitHub repo | https://github.com/csomora/INFORMS-UIC-Hackathon |
| 3 prompts | `Hackathon/prompts.md` |
| Healthcare concepts | `docs/healthcare_primer.md` |
| Table reference | `docs/data_dictionary.md` |
| Cloudflare deploy guide | `docs/cloudflare_deploy.md` |
| No-code fallback | `docs/shepherd_system_prompt.md` → Claude Projects |

# Windows Quickstart (PowerShell)

For hackathon students setting up on a fresh Windows machine. If you hit issues with `git`, `npm`, or TypeScript startup, follow the troubleshooting section exactly.

---

## 1) Install prerequisites

```powershell
winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
```

After install, open a **new PowerShell window** so PATH updates are picked up.

---

## 2) Fork and clone the repo

**Fork first** — go to https://github.com/csomora/INFORMS-UIC-Hackathon, click **Fork** (top right), fork to your personal account. Then clone your fork:

```powershell
git clone https://github.com/YOUR_USERNAME/INFORMS-UIC-Hackathon.git
cd INFORMS-UIC-Hackathon
```

If `git` is still not recognized after reopening the terminal, use the ZIP fallback (then install git and re-clone before the build sprint):

```powershell
Invoke-WebRequest -Uri "https://github.com/csomora/INFORMS-UIC-Hackathon/archive/refs/heads/main.zip" -OutFile "hackathon.zip"
Expand-Archive -Path "hackathon.zip" -DestinationPath . -Force
Remove-Item "hackathon.zip" -Force
cd INFORMS-UIC-Hackathon-main
```

---

## 3) Verify the data API works

Run this before touching any agent code:

```powershell
Invoke-RestMethod -Method Post `
  -Uri "https://uic-hackathon-data.christian-7f4.workers.dev/query" `
  -ContentType "application/json" `
  -Body '{"sql":"SELECT first, last, ed_inpatient_total_cost FROM patient_summary ORDER BY ed_inpatient_total_cost DESC LIMIT 3"}'
```

Expected: JSON with Giovanni Paucek ($3.4M), Chad Gerhold ($2.8M), Chantelle Oberbrunner ($2.5M). If this fails, stop — the database is down.

---

## 4) Install TypeScript example dependencies

```powershell
cd examples\typescript
npm install
```

If `npm` is not recognized:

```powershell
& "C:\Program Files\nodejs\npm.cmd" install
```

---

## 5) Set your API key and run

```powershell
$env:ANTHROPIC_API_KEY = "your_key_here"
npm run start
```

If `npm` isn't in PATH:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run start
```

Expected: agent starts, calls the SQL tool, returns ranked patient findings.

---

## Common issues

| Problem | Fix |
|---|---|
| `git` not recognized after install | Close and reopen PowerShell; PATH needs to refresh |
| `npm` / `npx` not recognized | Use full path: `& "C:\Program Files\nodejs\npm.cmd"` |
| `&&` not supported | Use `;` instead in PowerShell |
| `ANTHROPIC_API_KEY` auth error | Set the key in the same terminal session where you run the script |
| TypeScript `unknown` type error | Already fixed in the repo — make sure you pulled the latest main |

---

## Cloudflare Workers on Windows ARM64

If you're building with the Cloudflare agents-starter path, `npm run dev` will fail on Windows ARM64:

```
Error: Unsupported platform: win32 arm64 LE
```

This is a known upstream issue with `workerd` (Cloudflare's local runtime). Track it at [cloudflare/workerd#6486](https://github.com/cloudflare/workerd/issues/6486).

**Workaround — deploy-to-test loop:**

Skip `npm run dev` entirely. Use `npx wrangler deploy` after every change instead:

```powershell
# One-time login
npx wrangler login

# After every change to src/server.ts:
npx wrangler deploy
# Live URL updates in ~30 seconds — test there
```

It's slower than hot reload but works fine for a 2-hour hackathon. You still get a real live URL to demo.

---

## What's next

Pick a prompt and start building: `Hackathon/prompts.md`

Start with `patient_summary`, keep all queries as `SELECT`, always include `LIMIT`.

Hackathon guide chatbot: https://uic-hackathon-guide.christian-7f4.workers.dev

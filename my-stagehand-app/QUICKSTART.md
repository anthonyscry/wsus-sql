# Stagehand Automation - Quick Start

## Setup (One-time)

```bash
cd my-stagehand-app
npm install
```

## Environment

Create `.env` file with your Browserbase credentials:
```
BROWSERBASE_API_KEY=your_api_key
BROWSERBASE_PROJECT_ID=your_project_id
```

Get credentials at: https://browserbase.com

## Run Commands

| Command | What it does |
|---------|--------------|
| `npm run auto` | Autonomous 30-min exploration loop |
| `npm run test` | Quick test on example.com |
| `npm run maps` | Google Maps search workflow |
| `npm run stagehand` | Test stagehand.dev |
| `npm run custom "Search for X"` | Custom instruction |
| `npm run hook` | Run notification watcher |
| `npm run notify-test` | Test notification system |

## Typical Workflow

```bash
# Terminal 1: Run automation
npm run auto

# Terminal 2: (Optional) Run hook watcher for notifications
npm run hook
```

## When You Get Notified

The system will SHOUT (visual + audio) when:
- User input is required (CAPTCHA, login, etc.)
- An error needs attention
- The automation is stuck

## Files

- `run.ts` - Main entry point
- `automation-workflow.ts` - Workflow engine
- `hooks/input-hook.ts` - Notification system
- `workflow-log.json` - Activity log (auto-created)

## Quick Commands

```bash
# 15-minute custom task
npx tsx run.ts --custom "Find best coffee shops in Seattle" --time 15

# High-step limit exploration
npx tsx run.ts --steps 200 --time 60
```

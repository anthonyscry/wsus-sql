#!/bin/bash
#
# QUICK START AUTOMATION SCRIPT
# Run from the wsus-sql directory
#
# Usage:
#   ./start-automation.sh           # Auto mode (30 min)
#   ./start-automation.sh test      # Quick test
#   ./start-automation.sh maps      # Google Maps
#   ./start-automation.sh "task"    # Custom task
#

set -e

cd "$(dirname "$0")/my-stagehand-app"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check for .env
if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found!"
    echo ""
    echo "Create my-stagehand-app/.env with:"
    echo "  BROWSERBASE_API_KEY=your_key"
    echo "  BROWSERBASE_PROJECT_ID=your_project"
    echo ""
    echo "Get credentials at: https://browserbase.com"
    exit 1
fi

# Parse argument
MODE="${1:-auto}"

case "$MODE" in
    test)
        echo "🧪 Running test workflow..."
        npx tsx run.ts --test
        ;;
    maps)
        echo "🗺️  Running Google Maps workflow..."
        npx tsx run.ts --maps
        ;;
    stagehand)
        echo "🎭 Running Stagehand.dev workflow..."
        npx tsx run.ts --stagehand
        ;;
    hook)
        echo "🔔 Running notification hook watcher..."
        npx tsx run.ts --hook
        ;;
    notify-test)
        echo "🔊 Testing notifications..."
        npx tsx run.ts --notify-test
        ;;
    auto)
        echo "🤖 Running autonomous loop (30 min)..."
        npx tsx run.ts
        ;;
    *)
        echo "🎯 Running custom task: $MODE"
        npx tsx run.ts --custom "$MODE"
        ;;
esac

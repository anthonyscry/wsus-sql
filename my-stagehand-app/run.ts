#!/usr/bin/env npx tsx

/**
 * UNIFIED AUTOMATION RUNNER
 *
 * Single entry point for all automation workflows.
 *
 * Usage:
 *   npx tsx run.ts                    # Run autonomous loop (30 min)
 *   npx tsx run.ts --test             # Quick test workflow
 *   npx tsx run.ts --maps             # Google Maps workflow
 *   npx tsx run.ts --custom "task"    # Custom instruction
 *   npx tsx run.ts --hook             # Run input hook watcher only
 *   npx tsx run.ts --notify-test      # Test notification system
 *   npx tsx run.ts --help             # Show help
 */

import "dotenv/config";
import { AutonomousWorkflow, exampleWorkflows, NotificationSystem } from "./automation-workflow.js";
import { InputHookWatcher, printBanner } from "./hooks/input-hook.js";
import * as readline from "readline";

// ============================================================================
// CLI INTERFACE
// ============================================================================

function showHelp(): void {
  console.log(`
╔════════════════════════════════════════════════════════════════════╗
║              STAGEHAND AUTOMATION RUNNER                          ║
╠════════════════════════════════════════════════════════════════════╣
║                                                                    ║
║  USAGE:                                                            ║
║    npx tsx run.ts [options]                                        ║
║                                                                    ║
║  OPTIONS:                                                          ║
║    (no args)      Run autonomous loop for 30 minutes               ║
║    --test         Run basic test workflow (example.com)            ║
║    --maps         Run Google Maps search workflow                  ║
║    --stagehand    Test stagehand.dev website                       ║
║    --custom "X"   Run with custom instruction X                    ║
║    --time N       Set max runtime to N minutes (default: 30)       ║
║    --steps N      Set max steps to N (default: 100)                ║
║    --hook         Run input hook watcher standalone                ║
║    --notify-test  Test the notification system                     ║
║    --help         Show this help                                   ║
║                                                                    ║
║  EXAMPLES:                                                         ║
║    npx tsx run.ts --test                                           ║
║    npx tsx run.ts --custom "Search for AI news" --time 15          ║
║    npx tsx run.ts --hook &                                         ║
║                                                                    ║
║  ENVIRONMENT:                                                      ║
║    BROWSERBASE_API_KEY     Your Browserbase API key                ║
║    BROWSERBASE_PROJECT_ID  Your Browserbase project ID             ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝
`);
}

function parseArgs(): {
  mode: "auto" | "test" | "maps" | "stagehand" | "custom" | "hook" | "notify-test" | "help";
  instruction?: string;
  maxMinutes: number;
  maxSteps: number;
} {
  const args = process.argv.slice(2);
  let mode: any = "auto";
  let instruction: string | undefined;
  let maxMinutes = 30;
  let maxSteps = 100;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--test":
        mode = "test";
        break;
      case "--maps":
        mode = "maps";
        break;
      case "--stagehand":
        mode = "stagehand";
        break;
      case "--custom":
        mode = "custom";
        instruction = args[++i];
        break;
      case "--time":
        maxMinutes = parseInt(args[++i], 10) || 30;
        break;
      case "--steps":
        maxSteps = parseInt(args[++i], 10) || 100;
        break;
      case "--hook":
        mode = "hook";
        break;
      case "--notify-test":
        mode = "notify-test";
        break;
      case "--help":
      case "-h":
        mode = "help";
        break;
    }
  }

  return { mode, instruction, maxMinutes, maxSteps };
}

// ============================================================================
// MAIN RUNNER
// ============================================================================

async function main(): Promise<void> {
  const { mode, instruction, maxMinutes, maxSteps } = parseArgs();

  console.log("\n🤖 Stagehand Automation Runner\n");

  if (mode === "help") {
    showHelp();
    return;
  }

  if (mode === "notify-test") {
    const watcher = new InputHookWatcher();
    await watcher.triggerTest();
    return;
  }

  if (mode === "hook") {
    const watcher = new InputHookWatcher({ checkInterval: 2000 });

    process.on("SIGINT", () => {
      watcher.stop();
      process.exit(0);
    });

    watcher.start();
    // Keep alive
    await new Promise(() => {});
    return;
  }

  // Start the input hook watcher in parallel
  const hookWatcher = new InputHookWatcher({ checkInterval: 3000 });
  hookWatcher.start();

  const workflow = new AutonomousWorkflow();

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n\n⚠️ Shutting down...");
    workflow.stop();
    hookWatcher.stop();
    await workflow.close();
    process.exit(0);
  });

  try {
    await workflow.initialize();

    switch (mode) {
      case "test":
        console.log("📋 Running: Basic Test Workflow\n");
        await workflow.runWorkflowSequence(exampleWorkflows.basicTest);
        break;

      case "maps":
        console.log("📋 Running: Google Maps Workflow\n");
        await workflow.runWorkflowSequence(exampleWorkflows.googleMaps);
        break;

      case "stagehand":
        console.log("📋 Running: Stagehand.dev Workflow\n");
        await workflow.runWorkflowSequence(exampleWorkflows.stagehandTest);
        break;

      case "custom":
        console.log(`📋 Running: Custom Instruction\n`);
        console.log(`🎯 "${instruction}"\n`);
        await workflow.runAutonomousLoop(instruction!, { maxMinutes, maxSteps });
        break;

      case "auto":
      default:
        console.log("📋 Running: Autonomous Exploration\n");
        await workflow.runAutonomousLoop(
          "Explore interesting websites, test functionality, and report findings",
          { maxMinutes, maxSteps }
        );
        break;
    }

  } catch (error: any) {
    console.error("❌ Fatal error:", error.message);
    printBanner(`Fatal error: ${error.message}`);
  } finally {
    hookWatcher.stop();
    await workflow.close();
  }
}

main().catch(console.error);

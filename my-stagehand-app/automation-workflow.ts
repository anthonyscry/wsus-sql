import "dotenv/config";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import * as readline from "readline";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";

const execAsync = promisify(exec);

// ============================================================================
// CONFIGURATION
// ============================================================================

interface WorkflowConfig {
  maxSteps: number;
  autoRetry: boolean;
  retryAttempts: number;
  notifyOnInput: boolean;
  verbose: boolean;
  logFile: string;
}

const config: WorkflowConfig = {
  maxSteps: 100,
  autoRetry: true,
  retryAttempts: 3,
  notifyOnInput: true,
  verbose: true,
  logFile: "./workflow-log.json",
};

// ============================================================================
// NOTIFICATION SYSTEM - Shouts when keyboard input needed
// ============================================================================

class NotificationSystem {
  private static instance: NotificationSystem;
  private inputRequired = false;

  static getInstance(): NotificationSystem {
    if (!NotificationSystem.instance) {
      NotificationSystem.instance = new NotificationSystem();
    }
    return NotificationSystem.instance;
  }

  async shout(message: string): Promise<void> {
    const timestamp = new Date().toISOString();
    const notification = `\n${"=".repeat(60)}\n🔔 KEYBOARD INPUT REQUIRED - ${timestamp}\n${message}\n${"=".repeat(60)}\n`;

    console.log("\x1b[33m%s\x1b[0m", notification);

    // Try system notification
    try {
      await execAsync(`notify-send "Stagehand Automation" "${message}" 2>/dev/null || true`);
    } catch (e) {
      // Ignore notification errors
    }

    // Try audio beep
    try {
      await execAsync(`echo -e '\a' 2>/dev/null || true`);
    } catch (e) {
      // Ignore beep errors
    }

    // Log to file
    await this.logEvent("input_required", message);
    this.inputRequired = true;
  }

  async logEvent(type: string, message: string): Promise<void> {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type,
      message,
    };

    try {
      let logs: any[] = [];
      if (fs.existsSync(config.logFile)) {
        logs = JSON.parse(fs.readFileSync(config.logFile, "utf-8"));
      }
      logs.push(logEntry);
      fs.writeFileSync(config.logFile, JSON.stringify(logs, null, 2));
    } catch (e) {
      console.error("Failed to write log:", e);
    }
  }

  isInputRequired(): boolean {
    return this.inputRequired;
  }

  clearInputRequired(): void {
    this.inputRequired = false;
  }
}

// ============================================================================
// WORKFLOW TASKS
// ============================================================================

interface TaskResult {
  success: boolean;
  data?: any;
  error?: string;
  needsInput?: boolean;
  inputPrompt?: string;
}

interface WorkflowTask {
  name: string;
  description: string;
  execute: (stagehand: Stagehand, context: any) => Promise<TaskResult>;
}

// Pre-defined workflow tasks
const workflowTasks: Record<string, WorkflowTask> = {
  // Navigation task
  navigate: {
    name: "Navigate",
    description: "Navigate to a URL",
    execute: async (stagehand, context) => {
      const page = stagehand.context.pages()[0];
      await page.goto(context.url);
      return { success: true, data: { navigatedTo: context.url } };
    },
  },

  // Extract content task
  extract: {
    name: "Extract",
    description: "Extract data from page",
    execute: async (stagehand, context) => {
      const result = await stagehand.extract(context.instruction);
      return { success: true, data: result };
    },
  },

  // Action task
  act: {
    name: "Act",
    description: "Perform an action on the page",
    execute: async (stagehand, context) => {
      const result = await stagehand.act(context.instruction);
      return { success: result.success, data: result };
    },
  },

  // Observe task
  observe: {
    name: "Observe",
    description: "Observe what actions are possible",
    execute: async (stagehand, context) => {
      const actions = await stagehand.observe(context.instruction);
      return { success: true, data: actions };
    },
  },

  // Agent autonomous task
  agent: {
    name: "Agent",
    description: "Run autonomous agent for complex tasks",
    execute: async (stagehand, context) => {
      const agent = stagehand.agent({
        systemPrompt: context.systemPrompt || "You are a helpful browser automation assistant.",
      });
      const result = await agent.execute({
        instruction: context.instruction,
        maxSteps: context.maxSteps || 20,
      });
      return { success: true, data: result };
    },
  },

  // Screenshot task
  screenshot: {
    name: "Screenshot",
    description: "Take a screenshot",
    execute: async (stagehand, context) => {
      const page = stagehand.context.pages()[0];
      const screenshot = await page.screenshot({
        path: context.path || `screenshot-${Date.now()}.png`,
      });
      return { success: true, data: { path: context.path } };
    },
  },

  // Wait task
  wait: {
    name: "Wait",
    description: "Wait for selector or timeout",
    execute: async (stagehand, context) => {
      const page = stagehand.context.pages()[0];
      if (context.selector) {
        await (page as any).waitForSelector(context.selector, { timeout: context.timeout || 30000 });
      } else {
        await new Promise(resolve => setTimeout(resolve, context.timeout || 1000));
      }
      return { success: true };
    },
  },
};

// ============================================================================
// AUTONOMOUS WORKFLOW RUNNER
// ============================================================================

class AutonomousWorkflow {
  private stagehand: Stagehand | null = null;
  private notifier = NotificationSystem.getInstance();
  private isRunning = false;
  private stepCount = 0;
  private startTime: Date | null = null;

  async initialize(): Promise<void> {
    console.log("🚀 Initializing Stagehand with Browserbase...");

    this.stagehand = new Stagehand({
      env: "BROWSERBASE",
    });

    await this.stagehand.init();

    console.log("✅ Stagehand initialized");
    console.log(`🔗 Watch live: https://browserbase.com/sessions/${this.stagehand.browserbaseSessionId}`);

    await this.notifier.logEvent("init", "Stagehand initialized successfully");
  }

  async runTask(taskName: string, context: any): Promise<TaskResult> {
    if (!this.stagehand) {
      throw new Error("Stagehand not initialized");
    }

    const task = workflowTasks[taskName];
    if (!task) {
      throw new Error(`Unknown task: ${taskName}`);
    }

    console.log(`\n📋 Running task: ${task.name} - ${task.description}`);
    this.stepCount++;

    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < config.retryAttempts) {
      try {
        const result = await task.execute(this.stagehand, context);

        if (result.needsInput && config.notifyOnInput) {
          await this.notifier.shout(result.inputPrompt || "User input required");
        }

        console.log(`✅ Task completed: ${task.name}`);
        await this.notifier.logEvent("task_complete", `${task.name}: ${JSON.stringify(result.data)}`);
        return result;
      } catch (error: any) {
        lastError = error;
        attempts++;
        console.log(`❌ Task failed (attempt ${attempts}/${config.retryAttempts}): ${error.message}`);

        if (attempts < config.retryAttempts && config.autoRetry) {
          console.log(`⏳ Retrying in ${attempts * 2} seconds...`);
          await new Promise(resolve => setTimeout(resolve, attempts * 2000));
        }
      }
    }

    return { success: false, error: lastError?.message || "Unknown error" };
  }

  async runWorkflowSequence(tasks: Array<{ task: string; context: any }>): Promise<void> {
    this.isRunning = true;
    this.startTime = new Date();

    console.log(`\n${"=".repeat(60)}`);
    console.log(`🏃 Starting workflow sequence with ${tasks.length} tasks`);
    console.log(`${"=".repeat(60)}\n`);

    for (let i = 0; i < tasks.length; i++) {
      if (!this.isRunning) {
        console.log("⛔ Workflow stopped by user");
        break;
      }

      const { task, context } = tasks[i];
      console.log(`\n[${i + 1}/${tasks.length}] Task: ${task}`);

      const result = await this.runTask(task, context);

      if (!result.success) {
        console.log(`\n❌ Workflow failed at step ${i + 1}`);
        await this.notifier.shout(`Workflow failed at step ${i + 1}: ${result.error}`);
        break;
      }

      // Check if we've exceeded max steps
      if (this.stepCount >= config.maxSteps) {
        console.log(`\n⚠️ Max steps (${config.maxSteps}) reached`);
        await this.notifier.shout("Max steps reached - workflow paused");
        break;
      }
    }

    const elapsed = this.startTime ? (Date.now() - this.startTime.getTime()) / 1000 : 0;
    console.log(`\n${"=".repeat(60)}`);
    console.log(`✅ Workflow completed in ${elapsed.toFixed(1)}s with ${this.stepCount} steps`);
    console.log(`${"=".repeat(60)}\n`);
  }

  async runAutonomousLoop(instruction: string, options: { maxMinutes?: number; maxSteps?: number } = {}): Promise<void> {
    const maxMinutes = options.maxMinutes || 30;
    const maxSteps = options.maxSteps || 100;
    const endTime = Date.now() + (maxMinutes * 60 * 1000);

    console.log(`\n${"=".repeat(60)}`);
    console.log(`🤖 AUTONOMOUS LOOP STARTED`);
    console.log(`⏱️  Max runtime: ${maxMinutes} minutes`);
    console.log(`📊 Max steps: ${maxSteps}`);
    console.log(`🎯 Instruction: ${instruction}`);
    console.log(`${"=".repeat(60)}\n`);

    this.isRunning = true;
    this.startTime = new Date();
    this.stepCount = 0;

    if (!this.stagehand) {
      throw new Error("Stagehand not initialized");
    }

    // Create an agent for autonomous operation
    const agent = this.stagehand.agent({
      systemPrompt: `You are an autonomous browser automation agent.
Your goal: ${instruction}

Rules:
1. Work autonomously until the goal is achieved
2. If you encounter something that requires human input (like CAPTCHA, login, confirmation), stop and report
3. Be methodical and thorough
4. Take screenshots of important states
5. If stuck, try alternative approaches before giving up`,
    });

    try {
      while (this.isRunning && Date.now() < endTime && this.stepCount < maxSteps) {
        this.stepCount++;
        const remainingTime = Math.round((endTime - Date.now()) / 1000 / 60);

        console.log(`\n[Step ${this.stepCount}/${maxSteps}] [${remainingTime} min remaining]`);

        try {
          const result = await agent.execute({
            instruction: `Continue working on: ${instruction}. Report if human input is needed.`,
            maxSteps: 5, // Small batch of steps
          });

          console.log(`Agent result: ${result.message}`);

          // Check if human input is needed
          if (result.message?.toLowerCase().includes("human") ||
              result.message?.toLowerCase().includes("captcha") ||
              result.message?.toLowerCase().includes("login") ||
              result.message?.toLowerCase().includes("input required")) {
            await this.notifier.shout(`Agent needs human input: ${result.message}`);
            break;
          }

          // Check if goal is achieved
          if (result.message?.toLowerCase().includes("complete") ||
              result.message?.toLowerCase().includes("finished") ||
              result.message?.toLowerCase().includes("done")) {
            console.log("🎉 Goal appears to be achieved!");
            break;
          }

        } catch (error: any) {
          console.log(`❌ Error: ${error.message}`);

          if (error.message?.includes("authentication") ||
              error.message?.includes("captcha") ||
              error.message?.includes("rate limit")) {
            await this.notifier.shout(`Automation blocked: ${error.message}`);
            break;
          }

          // Continue with next step for recoverable errors
          console.log("⏳ Continuing after error...");
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    } finally {
      const elapsed = ((Date.now() - this.startTime!.getTime()) / 1000 / 60).toFixed(1);
      console.log(`\n${"=".repeat(60)}`);
      console.log(`🏁 AUTONOMOUS LOOP FINISHED`);
      console.log(`⏱️  Total runtime: ${elapsed} minutes`);
      console.log(`📊 Total steps: ${this.stepCount}`);
      console.log(`${"=".repeat(60)}\n`);

      await this.notifier.logEvent("loop_complete", `Runtime: ${elapsed}min, Steps: ${this.stepCount}`);
    }
  }

  stop(): void {
    this.isRunning = false;
    console.log("🛑 Stop requested...");
  }

  async close(): Promise<void> {
    if (this.stagehand) {
      await this.stagehand.close();
      console.log("👋 Stagehand closed");
    }
  }
}

// ============================================================================
// EXAMPLE WORKFLOWS
// ============================================================================

const exampleWorkflows = {
  // Test basic navigation and extraction
  basicTest: [
    { task: "navigate", context: { url: "https://example.com" } },
    { task: "extract", context: { instruction: "Extract the main heading and any links on the page" } },
    { task: "screenshot", context: { path: "example-screenshot.png" } },
  ],

  // Test Google Maps (referenced in your git history)
  googleMaps: [
    { task: "navigate", context: { url: "https://www.google.com/maps" } },
    { task: "wait", context: { timeout: 2000 } },
    { task: "act", context: { instruction: "Search for 'coffee shops near me'" } },
    { task: "wait", context: { timeout: 3000 } },
    { task: "extract", context: { instruction: "Extract the names and ratings of visible coffee shops" } },
    { task: "screenshot", context: { path: "maps-results.png" } },
  ],

  // Test Stagehand's own site
  stagehandTest: [
    { task: "navigate", context: { url: "https://stagehand.dev" } },
    { task: "extract", context: { instruction: "Extract all navigation links and main features" } },
    { task: "act", context: { instruction: "Click on the documentation or docs link" } },
    { task: "wait", context: { timeout: 2000 } },
    { task: "screenshot", context: { path: "stagehand-docs.png" } },
  ],
};

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

async function main() {
  const workflow = new AutonomousWorkflow();

  // Handle shutdown gracefully
  process.on("SIGINT", async () => {
    console.log("\n\n⚠️ Received SIGINT - shutting down...");
    workflow.stop();
    await workflow.close();
    process.exit(0);
  });

  try {
    await workflow.initialize();

    // Get command from environment or args
    const command = process.argv[2] || "auto";
    const arg = process.argv[3];

    switch (command) {
      case "test":
        // Run basic test workflow
        await workflow.runWorkflowSequence(exampleWorkflows.basicTest);
        break;

      case "maps":
        // Run Google Maps workflow
        await workflow.runWorkflowSequence(exampleWorkflows.googleMaps);
        break;

      case "stagehand":
        // Test stagehand.dev
        await workflow.runWorkflowSequence(exampleWorkflows.stagehandTest);
        break;

      case "auto":
      default:
        // Run autonomous loop with default instruction
        const instruction = arg || "Explore the web and test various websites for functionality";
        await workflow.runAutonomousLoop(instruction, { maxMinutes: 30, maxSteps: 100 });
        break;
    }

  } catch (error) {
    console.error("Fatal error:", error);
  } finally {
    await workflow.close();
  }
}

// Export for use as a module
export { AutonomousWorkflow, NotificationSystem, workflowTasks, exampleWorkflows, config };

// Run if executed directly
main().catch((err) => {
  console.error(err);
  process.exit(1);
});

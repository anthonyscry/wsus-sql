/**
 * INPUT HOOK SYSTEM
 *
 * This hook system monitors automation and SHOUTS when keyboard input is needed.
 * Can be run standalone or integrated with the automation workflow.
 */

import * as fs from "fs";
import * as path from "path";
import { exec, spawn } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// ============================================================================
// CONFIGURATION
// ============================================================================

interface HookConfig {
  logFile: string;
  checkInterval: number; // ms
  soundEnabled: boolean;
  desktopNotification: boolean;
  terminalFlash: boolean;
  webhookUrl?: string;
}

const defaultConfig: HookConfig = {
  logFile: path.join(process.cwd(), "workflow-log.json"),
  checkInterval: 5000, // Check every 5 seconds
  soundEnabled: true,
  desktopNotification: true,
  terminalFlash: true,
};

// ============================================================================
// NOTIFICATION METHODS
// ============================================================================

async function playSound(): Promise<void> {
  try {
    // Try different audio methods
    await execAsync(`paplay /usr/share/sounds/freedesktop/stereo/bell.oga 2>/dev/null || ` +
                   `aplay /usr/share/sounds/alsa/Front_Center.wav 2>/dev/null || ` +
                   `echo -e '\a'`);
  } catch (e) {
    // Fallback to terminal bell
    process.stdout.write("\x07");
  }
}

async function showDesktopNotification(title: string, message: string): Promise<void> {
  try {
    await execAsync(`notify-send -u critical "${title}" "${message}" 2>/dev/null`);
  } catch (e) {
    // Ignore if notify-send not available
  }
}

function flashTerminal(): void {
  // ANSI escape codes for visual flash
  const flash = () => {
    process.stdout.write("\x1b[?5h"); // Reverse video on
    setTimeout(() => {
      process.stdout.write("\x1b[?5l"); // Reverse video off
    }, 200);
  };

  // Flash 3 times
  flash();
  setTimeout(flash, 400);
  setTimeout(flash, 800);
}

function printBanner(message: string): void {
  const lines = [
    "",
    "\x1b[41m\x1b[37m" + "═".repeat(70) + "\x1b[0m",
    "\x1b[41m\x1b[37m" + "║" + " ".repeat(68) + "║" + "\x1b[0m",
    "\x1b[41m\x1b[37m" + "║" + "  🔔 KEYBOARD INPUT REQUIRED".padEnd(68) + "║" + "\x1b[0m",
    "\x1b[41m\x1b[37m" + "║" + " ".repeat(68) + "║" + "\x1b[0m",
    "\x1b[41m\x1b[37m" + "║" + ("  " + message).substring(0, 66).padEnd(68) + "║" + "\x1b[0m",
    "\x1b[41m\x1b[37m" + "║" + " ".repeat(68) + "║" + "\x1b[0m",
    "\x1b[41m\x1b[37m" + "║" + `  Time: ${new Date().toLocaleTimeString()}`.padEnd(68) + "║" + "\x1b[0m",
    "\x1b[41m\x1b[37m" + "║" + " ".repeat(68) + "║" + "\x1b[0m",
    "\x1b[41m\x1b[37m" + "═".repeat(70) + "\x1b[0m",
    "",
  ];

  console.log(lines.join("\n"));
}

// ============================================================================
// HOOK SYSTEM
// ============================================================================

class InputHookWatcher {
  private config: HookConfig;
  private lastProcessedIndex = 0;
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(config: Partial<HookConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  async shout(message: string): Promise<void> {
    // Print visible banner
    printBanner(message);

    // Parallel notifications
    const tasks: Promise<void>[] = [];

    if (this.config.soundEnabled) {
      tasks.push(playSound());
    }

    if (this.config.desktopNotification) {
      tasks.push(showDesktopNotification("🔔 Input Required", message));
    }

    if (this.config.terminalFlash) {
      flashTerminal();
    }

    await Promise.all(tasks);
  }

  private async checkLogFile(): Promise<void> {
    try {
      if (!fs.existsSync(this.config.logFile)) {
        return;
      }

      const content = fs.readFileSync(this.config.logFile, "utf-8");
      const logs = JSON.parse(content) as Array<{ type: string; message: string; timestamp: string }>;

      // Process new entries
      for (let i = this.lastProcessedIndex; i < logs.length; i++) {
        const entry = logs[i];

        if (entry.type === "input_required") {
          await this.shout(entry.message);
        }
      }

      this.lastProcessedIndex = logs.length;
    } catch (e) {
      // Ignore parse errors
    }
  }

  start(): void {
    if (this.isRunning) return;

    console.log("🔍 Input Hook Watcher started");
    console.log(`📁 Monitoring: ${this.config.logFile}`);
    console.log(`⏱️  Check interval: ${this.config.checkInterval}ms`);
    console.log("");

    this.isRunning = true;
    this.intervalId = setInterval(() => this.checkLogFile(), this.config.checkInterval);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log("🛑 Input Hook Watcher stopped");
  }

  async triggerTest(): Promise<void> {
    console.log("🧪 Testing notification system...");
    await this.shout("This is a test notification - your attention is needed!");
  }
}

// ============================================================================
// STANDALONE HOOK RUNNER
// ============================================================================

async function runStandaloneHook(): Promise<void> {
  const watcher = new InputHookWatcher({
    checkInterval: 2000, // More frequent checking
  });

  // Handle shutdown
  process.on("SIGINT", () => {
    console.log("\n👋 Shutting down hook watcher...");
    watcher.stop();
    process.exit(0);
  });

  // Parse args
  const args = process.argv.slice(2);

  if (args.includes("--test")) {
    await watcher.triggerTest();
    return;
  }

  // Start watching
  watcher.start();

  // Keep process alive
  console.log("Press Ctrl+C to stop\n");
}

// Export for module use
export { InputHookWatcher, HookConfig, playSound, showDesktopNotification, printBanner };

// Run if executed directly
if (require.main === module) {
  runStandaloneHook().catch(console.error);
}

import { FastMCP } from "fastmcp";
import { z } from "zod";
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import { terminalManager } from './terminal-manager';
import { analyzeProcessState, cleanProcessOutput, formatProcessStateMessage } from './process-detection';

const execAsync = promisify(exec);

// OS-specific guidance
const OS_GUIDANCE = (() => {
  const platform = os.platform();
  if (platform === 'win32') {
    return 'Windows detected. Use Windows-style commands (dir, type, etc.) or PowerShell.';
  } else if (platform === 'darwin') {
    return 'macOS detected. Use Unix-style commands (ls, cat, etc.).';
  } else {
    return 'Linux detected. Use Unix-style commands (ls, cat, etc.).';
  }
})();

const PATH_GUIDANCE = 'IMPORTANT: Always use absolute paths (e.g., /home/user/project/file.txt). Relative paths may fail.';

function formatTimingInfo(timing: any): string {
  let msg = '\n\n📊 Timing Information:\n';
  msg += `  Exit Reason: ${timing.exitReason}\n`;
  msg += `  Total Duration: ${timing.totalDurationMs}ms\n`;

  if (timing.timeToFirstOutputMs !== undefined) {
    msg += `  Time to First Output: ${timing.timeToFirstOutputMs}ms\n`;
  }

  return msg;
}

// 创建并配置 MCP 服务器
function createMcpServer(): FastMCP {
  const server = new FastMCP({
    name: "terminal-mcp-server",
    version: "1.0.0",
  });

  // Tool 1: start_process
  server.addTool({
    name: "start_process",
    description: `
Start a new terminal process with intelligent state detection.

PRIMARY TOOL FOR FILE ANALYSIS AND DATA PROCESSING
This is the ONLY correct tool for analyzing local files (CSV, JSON, logs, etc.).

CRITICAL RULE: For ANY local file work, ALWAYS use this tool + interact_with_process.

${OS_GUIDANCE}

REQUIRED WORKFLOW FOR LOCAL FILES:
1. start_process("python3 -i") - Start Python REPL for data analysis
2. interact_with_process(pid, "import pandas as pd, numpy as np")
3. interact_with_process(pid, "df = pd.read_csv('/absolute/path/file.csv')")
4. interact_with_process(pid, "print(df.describe())")

COMMON FILE ANALYSIS PATTERNS:
• start_process("python3 -i") → Python REPL for data analysis (RECOMMENDED)
• start_process("node -i") → Node.js REPL for JSON processing

${PATH_GUIDANCE}`,
    parameters: z.object({
      command: z.string(),
      timeout_ms: z.number().default(30000),
      shell: z.string().optional(),
      verbose_timing: z.boolean().optional(),
    }),
    annotations: {
      title: "Start Terminal Process",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
    execute: async (args) => {
      const result = await terminalManager.executeCommand(
        args.command,
        args.timeout_ms,
        args.shell,
        args.verbose_timing || false
      );

      if (result.pid === -1) {
        return `Error: ${result.output}`;
      }

      const processState = analyzeProcessState(result.output, result.pid);

      let statusMessage = '';
      if (processState.isWaitingForInput) {
        statusMessage = `\n🔄 ${formatProcessStateMessage(processState, result.pid)}`;
      } else if (processState.isFinished) {
        statusMessage = `\n✅ ${formatProcessStateMessage(processState, result.pid)}`;
      } else if (result.isBlocked) {
        statusMessage = '\n⏳ Process is running. Use read_process_output to get more output.';
      }

      let timingMessage = '';
      if (result.timingInfo) {
        timingMessage = formatTimingInfo(result.timingInfo);
      }

      return `Process started with PID ${result.pid}\nInitial output:\n${result.output}${statusMessage}${timingMessage}`;
    },
  });

  // Tool 2: read_process_output
  server.addTool({
    name: "read_process_output",
    description: `
Read output from a running process with file-like pagination support.

Supports partial output reading with offset and length parameters (like read_file):
- 'offset' (start line, default: 0)
  * offset=0: Read NEW output since last read (default)
  * Positive: Read from absolute line position
  * Negative: Read last N lines from end (tail behavior)
- 'length' (max lines to read, default: 1000)

Examples:
- offset: 0, length: 100     → First 100 NEW lines since last read
- offset: 500, length: 50    → Lines 500-549 (absolute position)
- offset: -20                → Last 20 lines (tail)`,
    parameters: z.object({
      pid: z.number(),
      timeout_ms: z.number().optional().default(5000),
      offset: z.number().optional().default(0),
      length: z.number().optional().default(1000),
      verbose_timing: z.boolean().optional(),
    }),
    annotations: {
      title: "Read Process Output",
      readOnlyHint: true,
    },
    execute: async (args) => {
      const { pid, timeout_ms = 5000, offset = 0, length = 1000 } = args;

      const session = terminalManager.getSession(pid);
      if (session && offset === 0) {
        const waitForOutput = (): Promise<void> => {
          return new Promise((resolve) => {
            const currentLines = terminalManager.getOutputLineCount(pid) || 0;
            if (currentLines > session.lastReadIndex) {
              resolve();
              return;
            }

            let resolved = false;
            let interval: NodeJS.Timeout | null = null;
            let timeout: NodeJS.Timeout | null = null;

            const cleanup = () => {
              if (interval) clearInterval(interval);
              if (timeout) clearTimeout(timeout);
            };

            const resolveOnce = () => {
              if (resolved) return;
              resolved = true;
              cleanup();
              resolve();
            };

            interval = setInterval(() => {
              const newLineCount = terminalManager.getOutputLineCount(pid) || 0;
              if (newLineCount > session.lastReadIndex) {
                resolveOnce();
              }
            }, 50);

            timeout = setTimeout(() => {
              resolveOnce();
            }, timeout_ms);
          });
        };

        await waitForOutput();
      }

      const result = terminalManager.readOutputPaginated(pid, offset, length);

      if (!result) {
        return `No session found for PID ${pid}`;
      }

      const output = result.lines.join('\n');

      let statusMessage = '';
      if (offset < 0) {
        statusMessage = `[Reading last ${result.readCount} lines (total: ${result.totalLines} lines)]`;
      } else if (offset === 0) {
        if (result.remaining > 0) {
          statusMessage = `[Reading ${result.readCount} new lines from line ${result.readFrom} (total: ${result.totalLines} lines, ${result.remaining} remaining)]`;
        } else {
          statusMessage = `[Reading ${result.readCount} new lines (total: ${result.totalLines} lines)]`;
        }
      } else {
        statusMessage = `[Reading ${result.readCount} lines from line ${result.readFrom} (total: ${result.totalLines} lines, ${result.remaining} remaining)]`;
      }

      let processStateMessage = '';
      if (result.isComplete) {
        const runtimeStr = result.runtimeMs !== undefined
          ? ` (runtime: ${(result.runtimeMs / 1000).toFixed(2)}s)`
          : '';
        processStateMessage = `\n✅ Process completed with exit code ${result.exitCode}${runtimeStr}`;
      } else if (session) {
        const fullOutput = session.outputLines.join('\n');
        const processState = analyzeProcessState(fullOutput, pid);
        if (processState.isWaitingForInput) {
          processStateMessage = `\n🔄 ${formatProcessStateMessage(processState, pid)}`;
        }
      }

      const responseText = output || '(No output in requested range)';
      return `${statusMessage}\n\n${responseText}${processStateMessage}`;
    },
  });

  // Tool 3: interact_with_process
  server.addTool({
    name: "interact_with_process",
    description: `
Send input to a running process and automatically receive the response.

CRITICAL: THIS IS THE PRIMARY TOOL FOR ALL LOCAL FILE ANALYSIS
For ANY local file analysis (CSV, JSON, data processing), ALWAYS use this.

REQUIRED INTERACTIVE WORKFLOW FOR FILE ANALYSIS:
1. Start REPL: start_process("python3 -i")
2. Load libraries: interact_with_process(pid, "import pandas as pd")
3. Read file: interact_with_process(pid, "df = pd.read_csv('/absolute/path/file.csv')")
4. Analyze: interact_with_process(pid, "print(df.describe())")

SMART DETECTION:
- Automatically waits for REPL prompt (>>>, >, etc.)
- Detects errors and completion states`,
    parameters: z.object({
      pid: z.number(),
      input: z.string(),
      timeout_ms: z.number().optional().default(8000),
      wait_for_prompt: z.boolean().optional().default(true),
      verbose_timing: z.boolean().optional(),
    }),
    annotations: {
      title: "Send Input to Process",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    },
    execute: async (args) => {
      const { pid, input, timeout_ms = 8000, wait_for_prompt = true, verbose_timing = false } = args;

      const startTime = Date.now();
      let exitReason: 'early_exit_quick_pattern' | 'early_exit_periodic_check' | 'process_finished' | 'timeout' | 'no_wait' = 'timeout';

      const outputSnapshot = terminalManager.captureOutputSnapshot(pid);
      const success = terminalManager.sendInputToProcess(pid, input);

      if (!success) {
        return `Error: Failed to send input to process ${pid}. The process may have exited or doesn't accept input.`;
      }

      if (!wait_for_prompt) {
        exitReason = 'no_wait';
        let timingMessage = '';
        if (verbose_timing) {
          const endTime = Date.now();
          timingMessage = `\n\n📊 Timing: ${endTime - startTime}ms`;
        }
        return `✅ Input sent to process ${pid}. Use read_process_output to get the response.${timingMessage}`;
      }

      let output = "";
      let earlyExit = false;

      const waitForResponse = (): Promise<void> => {
        return new Promise((resolve) => {
          let resolved = false;
          let attempts = 0;
          const pollIntervalMs = 50;
          const maxAttempts = Math.ceil(timeout_ms / pollIntervalMs);
          let lastOutputLength = 0;
          let interval: NodeJS.Timeout | null = null;

          const resolveOnce = () => {
            if (resolved) return;
            resolved = true;
            if (interval) clearInterval(interval);
            resolve();
          };

          interval = setInterval(() => {
            if (resolved) return;

            const newOutput = outputSnapshot
              ? terminalManager.getOutputSinceSnapshot(pid, outputSnapshot)
              : terminalManager.getNewOutput(pid);

            if (newOutput && newOutput.length > lastOutputLength) {
              output = newOutput;
              lastOutputLength = newOutput.length;

              const processState = analyzeProcessState(output, pid);

              if (processState.isWaitingForInput) {
                earlyExit = true;
                exitReason = 'early_exit_periodic_check';
                resolveOnce();
                return;
              }

              if (processState.isFinished) {
                exitReason = 'process_finished';
                resolveOnce();
                return;
              }
            }

            attempts++;
            if (attempts >= maxAttempts) {
              exitReason = 'timeout';
              resolveOnce();
            }
          }, pollIntervalMs);
        });
      };

      await waitForResponse();

      let cleanOutput = cleanProcessOutput(output, input);
      const processState = analyzeProcessState(output, pid);
      const timeoutReached = !earlyExit && !processState?.isFinished && !processState?.isWaitingForInput;

      const maxOutputLines = 1000;
      let truncationMessage = '';
      const outputLines = cleanOutput.split('\n');
      if (outputLines.length > maxOutputLines) {
        const truncatedLines = outputLines.slice(0, maxOutputLines);
        cleanOutput = truncatedLines.join('\n');
        truncationMessage = `\n\n⚠️ Output truncated: showing ${maxOutputLines} of ${outputLines.length} lines.`;
      }

      let statusMessage = '';
      if (processState.isWaitingForInput) {
        statusMessage = `\n🔄 ${formatProcessStateMessage(processState, pid)}`;
      } else if (processState.isFinished) {
        statusMessage = `\n✅ ${formatProcessStateMessage(processState, pid)}`;
      } else if (timeoutReached) {
        statusMessage = '\n⏱️ Response may be incomplete (timeout reached)';
      }

      let timingMessage = '';
      if (verbose_timing) {
        const endTime = Date.now();
        timingMessage = `\n\n📊 Timing: ${endTime - startTime}ms (${exitReason})`;
      }

      if (cleanOutput.trim().length === 0 && !timeoutReached) {
        return `✅ Input executed in process ${pid}.\n📭 (No output produced)${statusMessage}${timingMessage}`;
      }

      let responseText = `✅ Input executed in process ${pid}`;
      if (cleanOutput && cleanOutput.trim().length > 0) {
        responseText += `:\n\n📤 Output:\n${cleanOutput}`;
      } else {
        responseText += `.\n📭 (No output produced)`;
      }

      if (statusMessage) responseText += `\n\n${statusMessage}`;
      if (truncationMessage) responseText += truncationMessage;
      if (timingMessage) responseText += timingMessage;

      return responseText;
    },
  });

  // Tool 4: force_terminate
  server.addTool({
    name: "force_terminate",
    description: `Force terminate a running terminal session. Use this to stop a process that is no longer needed or stuck.`,
    parameters: z.object({ pid: z.number() }),
    annotations: {
      title: "Force Terminate Process",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
    execute: async (args) => {
      const success = terminalManager.forceTerminate(args.pid);
      return success
        ? `Successfully initiated termination of session ${args.pid}`
        : `No active session found for PID ${args.pid}`;
    },
  });

  // Tool 5: list_sessions
  server.addTool({
    name: "list_sessions",
    description: `List all active terminal sessions. Shows session status including PID, Blocked, Runtime.`,
    parameters: z.object({}),
    annotations: { title: "List Terminal Sessions", readOnlyHint: true },
    execute: async () => {
      const sessions = terminalManager.listActiveSessions();
      if (sessions.length === 0) return 'No active sessions';
      return sessions.map(s => `PID: ${s.pid}, Blocked: ${s.isBlocked}, Runtime: ${Math.round(s.runtime / 1000)}s`).join('\n');
    },
  });

  // Tool 6: list_processes
  server.addTool({
    name: "list_processes",
    description: `List all running processes on the system. Returns PID, command, CPU, and memory usage.`,
    parameters: z.object({}),
    annotations: { title: "List Running Processes", readOnlyHint: true },
    execute: async () => {
      const command = os.platform() === 'win32' ? 'tasklist' : 'ps aux';
      try {
        const { stdout } = await execAsync(command);
        const processes = stdout.split('\n').slice(1).filter(Boolean).map(line => {
          const parts = line.split(/\s+/);
          return { pid: parseInt(parts[1]), command: parts[parts.length - 1], cpu: parts[2], memory: parts[3] };
        });
        return processes.map(p => `PID: ${p.pid}, Command: ${p.command}, CPU: ${p.cpu}, Memory: ${p.memory}`).join('\n');
      } catch (error) {
        return `Error: Failed to list processes: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

  // Tool 7: kill_process
  server.addTool({
    name: "kill_process",
    description: `Terminate a running process by PID. Use with caution.`,
    parameters: z.object({ pid: z.number() }),
    annotations: { title: "Kill Process", readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    execute: async (args) => {
      try {
        process.kill(args.pid);
        return `Successfully terminated process ${args.pid}`;
      } catch (error) {
        return `Error: Failed to kill process: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });

  return server;
}

// 导出函数：启动 MCP 服务器
export async function startMcpServer(port: number, workspace: string): Promise<{ server: FastMCP; address: string }> {
  const server = createMcpServer();

  await server.start({
    transportType: "httpStream",
    httpStream: {
      endpoint: "/mcp" as `/${string}`,
      port: port,
    },
  });

  const address = `http://localhost:${port}/mcp`;
  console.log(`Terminal MCP Server started on ${address}`);
  console.log(`SSE endpoint available at http://localhost:${port}/sse`);
  console.log(`Workspace: ${workspace}`);

  return { server, address };
}

export { terminalManager };
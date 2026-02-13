import { spawn, exec } from 'child_process';
import path from 'path';
import type { TerminalSession, ActiveSession, PaginatedOutputResult, OutputEvent, TimingInfo } from './types';

const DEFAULT_COMMAND_TIMEOUT = 30000;

interface CompletedSession {
  pid: number;
  outputLines: string[];
  exitCode: number | null;
  startTime: Date;
  endTime: Date;
}

interface ShellSpawnConfig {
  executable: string;
  args: string[];
  useShellOption: string | boolean;
}

function getShellSpawnArgs(shellPath: string, command: string): ShellSpawnConfig {
  const shellName = path.basename(shellPath).toLowerCase();

  if (shellName.includes('bash') || shellName.includes('zsh')) {
    return {
      executable: shellPath,
      args: ['-l', '-c', command],
      useShellOption: false
    };
  }

  if (shellName === 'pwsh' || shellName === 'pwsh.exe') {
    return {
      executable: shellPath,
      args: ['-Login', '-Command', command],
      useShellOption: false
    };
  }

  if (shellName === 'powershell' || shellName === 'powershell.exe') {
    return {
      executable: shellPath,
      args: ['-Command', command],
      useShellOption: false
    };
  }

  if (shellName === 'cmd' || shellName === 'cmd.exe') {
    // Windows: 先设置 UTF-8 编码再执行命令，避免中文乱码
    const utf8Command = `chcp 65001 >nul && ${command}`;
    return {
      executable: shellPath,
      args: ['/c', utf8Command],
      useShellOption: false
    };
  }

  if (shellName.includes('fish')) {
    return {
      executable: shellPath,
      args: ['-l', '-c', command],
      useShellOption: false
    };
  }

  return {
    executable: command,
    args: [],
    useShellOption: shellPath
  };
}

export class TerminalManager {
  private sessions: Map<number, TerminalSession> = new Map();
  private completedSessions: Map<number, CompletedSession> = new Map();

  sendInputToProcess(pid: number, input: string): boolean {
    const session = this.sessions.get(pid);
    if (!session) {
      return false;
    }

    try {
      if (session.process.stdin && !session.process.stdin.destroyed) {
        const inputWithNewline = input.endsWith('\n') ? input : input + '\n';
        session.process.stdin.write(inputWithNewline);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`Error sending input to process ${pid}:`, error);
      return false;
    }
  }

  async executeCommand(
    command: string,
    timeoutMs: number = DEFAULT_COMMAND_TIMEOUT,
    shell?: string,
    collectTiming: boolean = false
  ): Promise<{ pid: number; output: string; isBlocked: boolean; timingInfo?: TimingInfo }> {
    let shellToUse: string | boolean | undefined = shell;
    if (!shellToUse) {
      const isWindows = process.platform === 'win32';
      if (isWindows && process.env.COMSPEC) {
        shellToUse = process.env.COMSPEC;
      } else if (!isWindows && process.env.SHELL) {
        shellToUse = process.env.SHELL;
      } else {
        shellToUse = isWindows ? 'cmd.exe' : '/bin/sh';
      }
    }

    let spawnConfig: ShellSpawnConfig;
    let spawnOptions: any;

    // 获取工作目录（从环境变量 MCP_WORKSPACE 读取）
    const workspaceDir = process.env.MCP_WORKSPACE;

    if (typeof shellToUse === 'string') {
      spawnConfig = getShellSpawnArgs(shellToUse, command);
      spawnOptions = {
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          PYTHONIOENCODING: 'utf-8'
        },
        ...(workspaceDir ? { cwd: workspaceDir } : {})
      };

      if (spawnConfig.useShellOption) {
        spawnOptions.shell = spawnConfig.useShellOption;
      }
    } else {
      spawnConfig = {
        executable: command,
        args: [],
        useShellOption: shellToUse
      };
      spawnOptions = {
        shell: shellToUse,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          PYTHONIOENCODING: 'utf-8'
        },
        ...(workspaceDir ? { cwd: workspaceDir } : {})
      };
    }

    const childProcess = spawn(spawnConfig.executable, spawnConfig.args, spawnOptions);
    let output = '';

    if (!childProcess.pid) {
      return {
        pid: -1,
        output: 'Error: Failed to get process ID. The command could not be executed.',
        isBlocked: false
      };
    }

    const session: TerminalSession = {
      pid: childProcess.pid,
      process: childProcess,
      outputLines: [],
      lastReadIndex: 0,
      isBlocked: false,
      startTime: new Date()
    };

    this.sessions.set(childProcess.pid, session);

    const startTime = Date.now();
    let firstOutputTime: number | undefined;
    let lastOutputTime: number | undefined;
    const outputEvents: OutputEvent[] = [];
    let exitReason: TimingInfo['exitReason'] = 'timeout';

    return new Promise((resolve) => {
      let resolved = false;
      let periodicCheck: NodeJS.Timeout | null = null;

      const quickPromptPatterns = />>>\s*$|>\s*$|\$\s*$|#\s*$/;

      const resolveOnce = (result: { pid: number; output: string; isBlocked: boolean; timingInfo?: TimingInfo }) => {
        if (resolved) return;
        resolved = true;
        if (periodicCheck) clearInterval(periodicCheck);

        if (collectTiming) {
          const endTime = Date.now();
          result.timingInfo = {
            startTime,
            endTime,
            totalDurationMs: endTime - startTime,
            exitReason,
            firstOutputTime,
            lastOutputTime,
            timeToFirstOutputMs: firstOutputTime ? firstOutputTime - startTime : undefined,
            outputEvents: outputEvents.length > 0 ? outputEvents : undefined
          };
        }

        resolve(result);
      };

      childProcess.stdout.on('data', (data: any) => {
        const text = data.toString();
        const now = Date.now();

        if (!firstOutputTime) firstOutputTime = now;
        lastOutputTime = now;

        output += text;
        this.appendToLineBuffer(session, text);

        if (collectTiming) {
          outputEvents.push({
            timestamp: now,
            deltaMs: now - startTime,
            source: 'stdout',
            length: text.length,
            snippet: text.slice(0, 50).replace(/\n/g, '\\n')
          });
        }

        if (quickPromptPatterns.test(text)) {
          session.isBlocked = true;
          exitReason = 'early_exit_quick_pattern';

          if (collectTiming && outputEvents.length > 0) {
            outputEvents[outputEvents.length - 1].matchedPattern = 'quick_pattern';
          }

          resolveOnce({
            pid: childProcess.pid!,
            output,
            isBlocked: true
          });
        }
      });

      childProcess.stderr.on('data', (data: any) => {
        const text = data.toString();
        const now = Date.now();

        if (!firstOutputTime) firstOutputTime = now;
        lastOutputTime = now;

        output += text;
        this.appendToLineBuffer(session, text);

        if (collectTiming) {
          outputEvents.push({
            timestamp: now,
            deltaMs: now - startTime,
            source: 'stderr',
            length: text.length,
            snippet: text.slice(0, 50).replace(/\n/g, '\\n')
          });
        }
      });

      // 处理 spawn 错误（命令不存在、权限不足等）
      childProcess.on('error', (error: Error) => {
        exitReason = 'process_exit';
        resolveOnce({
          pid: childProcess.pid || -1,
          output: `Error: Failed to execute command: ${error.message}`,
          isBlocked: false
        });
      });

      periodicCheck = setInterval(() => {
        if (output.trim()) {
          // Simple periodic check - could be enhanced
        }
      }, 100);

      setTimeout(() => {
        session.isBlocked = true;
        exitReason = 'timeout';
        resolveOnce({
          pid: childProcess.pid!,
          output,
          isBlocked: true
        });
      }, timeoutMs);

      childProcess.on('exit', (code: any) => {
        // 清理 periodicCheck 定时器
        if (periodicCheck) {
          clearInterval(periodicCheck);
          periodicCheck = null;
        }

        if (childProcess.pid) {
          this.completedSessions.set(childProcess.pid, {
            pid: childProcess.pid,
            outputLines: [...session.outputLines],
            exitCode: code,
            startTime: session.startTime,
            endTime: new Date()
          });

          if (this.completedSessions.size > 100) {
            const oldestKey = Array.from(this.completedSessions.keys())[0];
            this.completedSessions.delete(oldestKey);
          }

          this.sessions.delete(childProcess.pid);
        }
        exitReason = 'process_exit';
        resolveOnce({
          pid: childProcess.pid!,
          output,
          isBlocked: false
        });
      });
    });
  }

  private appendToLineBuffer(session: TerminalSession, text: string): void {
    if (!text) return;

    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (session.outputLines.length === 0) {
        session.outputLines.push(line);
      } else if (i === 0) {
        session.outputLines[session.outputLines.length - 1] += line;
      } else {
        session.outputLines.push(line);
      }
    }
  }

  readOutputPaginated(pid: number, offset: number = 0, length: number = 1000): PaginatedOutputResult | null {
    const session = this.sessions.get(pid);
    if (session) {
      return this.readFromLineBuffer(
        session.outputLines,
        offset,
        length,
        session.lastReadIndex,
        (newIndex) => { session.lastReadIndex = newIndex; },
        false,
        undefined
      );
    }

    const completedSession = this.completedSessions.get(pid);
    if (completedSession) {
      const runtimeMs = completedSession.endTime.getTime() - completedSession.startTime.getTime();
      return this.readFromLineBuffer(
        completedSession.outputLines,
        offset,
        length,
        0,
        () => {},
        true,
        completedSession.exitCode,
        runtimeMs
      );
    }

    return null;
  }

  private readFromLineBuffer(
    lines: string[],
    offset: number,
    length: number,
    lastReadIndex: number,
    updateLastRead: (index: number) => void,
    isComplete: boolean,
    exitCode?: number | null,
    runtimeMs?: number
  ): PaginatedOutputResult {
    const totalLines = lines.length;
    let startIndex: number;
    let linesToRead: string[];

    if (offset < 0) {
      const fromEnd = Math.abs(offset);
      startIndex = Math.max(0, totalLines - fromEnd);
      linesToRead = lines.slice(startIndex, startIndex + length);
    } else if (offset === 0) {
      startIndex = lastReadIndex;
      linesToRead = lines.slice(startIndex, startIndex + length);
      updateLastRead(Math.min(startIndex + linesToRead.length, totalLines));
    } else {
      startIndex = offset;
      linesToRead = lines.slice(startIndex, startIndex + length);
    }

    const readCount = linesToRead.length;
    const endIndex = startIndex + readCount;
    const remaining = Math.max(0, totalLines - endIndex);

    return {
      lines: linesToRead,
      totalLines,
      readFrom: startIndex,
      readCount,
      remaining,
      isComplete,
      exitCode,
      runtimeMs
    };
  }

  getOutputLineCount(pid: number): number | null {
    const session = this.sessions.get(pid);
    if (session) {
      return session.outputLines.length;
    }

    const completedSession = this.completedSessions.get(pid);
    if (completedSession) {
      return completedSession.outputLines.length;
    }

    return null;
  }

  getNewOutput(pid: number, maxLines: number = 1000): string | null {
    const result = this.readOutputPaginated(pid, 0, maxLines);
    if (!result) return null;

    const output = result.lines.join('\n').trim();

    if (result.isComplete) {
      const runtimeStr = result.runtimeMs !== undefined
        ? `\nRuntime: ${(result.runtimeMs / 1000).toFixed(2)}s`
        : '';
      if (output) {
        return `${output}\n\nProcess completed with exit code ${result.exitCode}${runtimeStr}`;
      } else {
        return `Process completed with exit code ${result.exitCode}${runtimeStr}\n(No output produced)`;
      }
    }

    if (result.remaining > 0) {
      return `${output}\n\n[Output truncated: ${result.remaining} more lines available. Use read_process_output with offset/length for full output.]`;
    }

    return output || null;
  }

  captureOutputSnapshot(pid: number): { totalChars: number; lineCount: number } | null {
    const session = this.sessions.get(pid);
    if (session) {
      const fullOutput = session.outputLines.join('\n');
      return {
        totalChars: fullOutput.length,
        lineCount: session.outputLines.length
      };
    }
    return null;
  }

  getOutputSinceSnapshot(pid: number, snapshot: { totalChars: number; lineCount: number }): string | null {
    const session = this.sessions.get(pid);
    if (session) {
      const fullOutput = session.outputLines.join('\n');
      if (fullOutput.length <= snapshot.totalChars) {
        return '';
      }
      return fullOutput.substring(snapshot.totalChars);
    }

    const completedSession = this.completedSessions.get(pid);
    if (completedSession) {
      const fullOutput = completedSession.outputLines.join('\n');
      if (fullOutput.length <= snapshot.totalChars) {
        return '';
      }
      return fullOutput.substring(snapshot.totalChars);
    }

    return null;
  }

  getSession(pid: number): TerminalSession | undefined {
    return this.sessions.get(pid);
  }

  forceTerminate(pid: number): boolean {
    const session = this.sessions.get(pid);
    if (!session) {
      return false;
    }

    try {
      const isWindows = process.platform === 'win32';
      
      if (isWindows) {
        // Windows: 使用 taskkill 命令
        exec(`taskkill /PID ${pid} /T`, (error) => {
          if (error) {
            console.error(`Failed to terminate process ${pid} on Windows:`, error);
          }
        });
        
        // 1秒后强制终止
        setTimeout(() => {
          if (this.sessions.has(pid)) {
            exec(`taskkill /F /PID ${pid} /T`, (error) => {
              if (error) {
                console.error(`Failed to force terminate process ${pid} on Windows:`, error);
              }
            });
          }
        }, 1000);
      } else {
        // Unix/Linux/macOS: 使用 POSIX 信号
        session.process.kill('SIGINT');
        setTimeout(() => {
          if (this.sessions.has(pid)) {
            session.process.kill('SIGKILL');
          }
        }, 1000);
      }
      return true;
    } catch (error) {
      console.error(`Failed to terminate process ${pid}:`, error);
      return false;
    }
  }

  listActiveSessions(): ActiveSession[] {
    const now = new Date();
    return Array.from(this.sessions.values()).map(session => ({
      pid: session.pid,
      isBlocked: session.isBlocked,
      runtime: now.getTime() - session.startTime.getTime()
    }));
  }
}

export const terminalManager = new TerminalManager();

import { ChildProcess } from 'child_process';

export interface ProcessInfo {
  pid: number;
  command: string;
  cpu: string;
  memory: string;
}

export interface TerminalSession {
  pid: number;
  process: ChildProcess;
  outputLines: string[];
  lastReadIndex: number;
  isBlocked: boolean;
  startTime: Date;
}

export interface CommandExecutionResult {
  pid: number;
  output: string;
  isBlocked: boolean;
  timingInfo?: TimingInfo;
}

export interface TimingInfo {
  startTime: number;
  endTime: number;
  totalDurationMs: number;
  exitReason: 'early_exit_quick_pattern' | 'early_exit_periodic_check' | 'process_exit' | 'timeout' | 'no_wait';
  firstOutputTime?: number;
  lastOutputTime?: number;
  timeToFirstOutputMs?: number;
  outputEvents?: OutputEvent[];
}

export interface OutputEvent {
  timestamp: number;
  deltaMs: number;
  source: 'stdout' | 'stderr' | 'periodic_poll';
  length: number;
  snippet: string;
  matchedPattern?: string;
}

export interface ActiveSession {
  pid: number;
  isBlocked: boolean;
  runtime: number;
}

export interface PaginatedOutputResult {
  lines: string[];
  totalLines: number;
  readFrom: number;
  readCount: number;
  remaining: number;
  isComplete: boolean;
  exitCode?: number | null;
  runtimeMs?: number;
}

export interface ProcessState {
  isWaitingForInput: boolean;
  isFinished: boolean;
  isRunning: boolean;
  detectedPrompt?: string;
  lastOutput: string;
}

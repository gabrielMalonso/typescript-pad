export interface CodeIssue {
  from: number;
  to: number;
  line: number;
  column: number;
  message: string;
  code: number;
}

export type CompileResult =
  | { ok: true; javascript: string; issues: [] }
  | { ok: false; javascript: null; issues: CodeIssue[] };

export type CompilerReply = { id: number; result: CompileResult } | { id: number; error: string };
export type LogLevel = 'log' | 'info' | 'warn' | 'error';
export type RunnerReply =
  | { type: 'log'; level: LogLevel; text: string }
  | { type: 'error'; text: string }
  | { type: 'done'; duration: number }
  | { type: 'clear' };

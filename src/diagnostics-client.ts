import type { Diagnostic } from '@codemirror/lint';
import type { CheckReply, CodeIssue, CompilerRequest } from './protocol';

export const toDiagnostics = (issues: readonly CodeIssue[]): Diagnostic[] =>
  issues.map((issue) => ({
    from: issue.from,
    to: issue.to,
    severity: 'error',
    message: issue.message,
    source: issue.code ? `TS${issue.code}` : 'TypeScript Pad',
  }));

interface PendingCheck {
  id: number;
  source: string;
  resolve: (diagnostics: readonly Diagnostic[]) => void;
}

// Keep at most one running check and the newest queued draft on slower devices.
export class DiagnosticsClient {
  private worker?: Worker;
  private active?: PendingCheck;
  private queued?: PendingCheck;
  private deadline?: ReturnType<typeof setTimeout>;
  private nextId = 0;

  check(source: string): Promise<readonly Diagnostic[]> {
    return new Promise((resolve) => {
      this.queued?.resolve([]);
      this.queued = { id: ++this.nextId, source, resolve };
      this.start();
    });
  }

  private start() {
    if (this.active || !this.queued) return;
    this.active = this.queued;
    this.queued = undefined;
    try {
      if (!this.worker) {
        this.worker = new Worker(new URL('./compiler.worker.ts', import.meta.url), { type: 'module' });
        this.worker.onmessage = (event: MessageEvent<CheckReply>) => {
          if (event.data.id !== this.active?.id) return;
          if ('error' in event.data) {
            this.fail();
            return;
          }
          clearTimeout(this.deadline);
          this.active.resolve(toDiagnostics(event.data.issues));
          this.active = undefined;
          this.start();
        };
        this.worker.onerror = () => this.fail();
        this.worker.onmessageerror = () => this.fail();
      }
      const { id, source } = this.active;
      this.worker.postMessage({ id, source, kind: 'check' } satisfies CompilerRequest);
      this.deadline = setTimeout(() => this.fail(), 30_000);
    } catch {
      this.fail();
    }
  }

  private fail() {
    clearTimeout(this.deadline);
    this.worker?.terminate();
    this.worker = undefined;
    this.active?.resolve([
      {
        from: 0,
        to: 0,
        severity: 'warning',
        source: 'Editor',
        message:
          'A análise automática falhou. Edite o código para tentar novamente; Run continua disponível.',
      },
    ]);
    this.active = undefined;
    this.start();
  }

  destroy() {
    clearTimeout(this.deadline);
    this.worker?.terminate();
    this.worker = undefined;
    this.active?.resolve([]);
    this.queued?.resolve([]);
    this.active = this.queued = undefined;
  }
}

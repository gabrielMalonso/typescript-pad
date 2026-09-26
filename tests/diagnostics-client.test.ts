import { afterEach, describe, expect, test, vi } from 'vitest';
import { DiagnosticsClient } from '../src/diagnostics-client';
import type { CheckReply, CompilerRequest } from '../src/protocol';

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage?: (event: { data: CheckReply }) => void;
  onerror?: () => void;
  onmessageerror?: () => void;
  postMessage = vi.fn<(request: CompilerRequest) => void>();
  terminate = vi.fn();
  constructor() { FakeWorker.instances.push(this); }
  reply(reply: CheckReply) { this.onmessage?.({ data: reply }); }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  FakeWorker.instances = [];
});

const setup = () => {
  vi.stubGlobal('Worker', FakeWorker);
  vi.useFakeTimers();
  return new DiagnosticsClient();
};

describe('background diagnostics', () => {
  test('keeps only the latest queued draft and routes replies by ID', async () => {
    const client = setup();
    const first = client.check('old');
    const worker = FakeWorker.instances[0];
    const second = client.check('intermediate');
    const third = client.check('latest');
    expect(await second).toEqual([]);
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    worker.reply({ id: 999, issues: [] });
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    worker.reply({ id: 1, issues: [] });
    expect(await first).toEqual([]);
    expect(worker.postMessage).toHaveBeenLastCalledWith({ id: 3, source: 'latest', kind: 'check' });
    worker.reply({ id: 3, issues: [{ from: 0, to: 6, line: 1, column: 1, code: 2304, message: 'Unknown name' }] });
    expect(await third).toEqual([{ from: 0, to: 6, severity: 'error', source: 'TS2304', message: 'Unknown name' }]);
    client.destroy();
  });

  test('times out a stalled worker and recovers for the newest draft', async () => {
    const client = setup();
    const stalled = client.check('old');
    const newest = client.check('new');
    const worker = FakeWorker.instances[0];
    vi.advanceTimersByTime(30_000);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(await stalled).toEqual([expect.objectContaining({ severity: 'warning', source: 'Editor' })]);
    const replacement = FakeWorker.instances[1];
    expect(replacement.postMessage).toHaveBeenCalledWith({ id: 2, source: 'new', kind: 'check' });
    replacement.reply({ id: 2, issues: [] });
    expect(await newest).toEqual([]);
    client.destroy();
  });

  test('reports worker errors and settles pending checks when destroyed', async () => {
    const client = setup();
    const failed = client.check('error');
    FakeWorker.instances[0].onerror?.();
    expect(await failed).toEqual([expect.objectContaining({ severity: 'warning' })]);
    const active = client.check('active');
    const queued = client.check('queued');
    client.destroy();
    expect(await active).toEqual([]);
    expect(await queued).toEqual([]);
    expect(FakeWorker.instances[1].terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});

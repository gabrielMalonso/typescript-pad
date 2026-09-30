import { describe, expect, it, vi } from 'vitest';
import { DraftSync } from '../src/draft-sync';
import type { CloudDraft, SaveResult } from '../src/cloud-api';

function memory(): Storage {
  const data = new Map<string, string>();
  return { get length() { return data.size; }, key: index => [...data.keys()][index] ?? null, getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: key => { data.delete(key); }, clear: () => data.clear() };
}
const cloud = (source: string, revision = 1): CloudDraft => ({ source, revision, updatedAt: revision });
const saved = async (): Promise<SaveResult> => ({ status: 'saved', revision: 2 });

describe('durable Pad draft', () => {
  it('keeps named-file recovery local while the library syncs that file independently', async () => {
    const store = memory();
    const changed = vi.fn();
    const send = vi.fn(saved);
    const sync = new DraftSync(store, 'draft', changed);
    sync.setShared(false);
    sync.connect('owner', send);
    sync.edit('named study');
    sync.receive(cloud('unrelated draft'));
    await sync.flush();
    expect(sync.source).toBe('named study');
    expect(send).not.toHaveBeenCalled();
    expect(new DraftSync(store, 'example', () => {}).source).toBe('named study');
  });
  it('migrates the existing tablet draft and retains edits without an account', () => {
    const store = memory();
    store.setItem('typescript-pad:source', 'existing tablet code');
    const sync = new DraftSync(store, 'example', () => {});
    expect(sync.source).toBe('existing tablet code');
    sync.edit('offline work');
    expect(new DraftSync(store, 'example', () => {}).source).toBe('offline work');
    expect(sync.status).toBe('local');
  });
  it('loads cloud code on a fresh device, but asks before replacing an existing local draft', () => {
    const fresh = new DraftSync(memory(), 'example', () => {});
    fresh.connect('owner', saved); fresh.receive(cloud('cloud work'));
    expect(fresh.source).toBe('cloud work');
    const local = new DraftSync(memory(), 'example', () => {});
    local.edit('local work'); local.connect('owner', saved); local.receive(cloud('cloud work'));
    expect(local.source).toBe('local work'); expect(local.hasConflict).toBe(true);
  });
  it('keeps offline changes across restart and detects a cloud change on reconnect', () => {
    const store = memory(); const original = new DraftSync(store, 'example', () => {});
    original.connect('owner', saved); original.receive(cloud('original')); original.disconnect(); original.edit('offline change');
    const resumed = new DraftSync(store, 'example', () => {});
    resumed.connect('owner', saved); resumed.receive(cloud('other device', 2));
    expect(resumed.hasConflict).toBe(true); expect(resumed.source).toBe('offline change');
    resumed.resolve('cloud'); expect(resumed.source).toBe('other device');
    const recovery = Array.from({ length: store.length }, (_, i) => store.key(i)).find(key => key?.startsWith('typescript-pad:recovery:'))!;
    expect(JSON.parse(store.getItem(recovery)!)).toMatchObject({ local: 'offline change', cloud: 'other device' });
  });
  it('sends edits made while a save is in flight, without replacing the newer text', async () => {
    let finish!: (value: SaveResult) => void;
    const send = vi.fn().mockImplementationOnce(() => new Promise<SaveResult>(resolve => { finish = resolve; })).mockResolvedValue({ status: 'saved', revision: 3 });
    const sync = new DraftSync(memory(), 'example', () => {});
    sync.connect('owner', send); sync.receive(cloud('original')); sync.edit('first');
    const pending = sync.flush(); sync.edit('second'); sync.receive(cloud('first', 2));
    finish({ status: 'saved', revision: 2 }); await pending; await Promise.resolve();
    expect(sync.source).toBe('second'); expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ source: 'second', baseRevision: 2 }));
    expect(sync.status).toBe('saved');
  });
  it('retains changes on network errors and ignores late results after logout', async () => {
    const sync = new DraftSync(memory(), 'example', () => {});
    sync.edit('important'); sync.connect('owner', async () => { throw new Error('offline'); }); sync.receive(null);
    await sync.flush(); expect(sync.source).toBe('important'); expect(sync.status).toBe('error');
    let finish!: (value: SaveResult) => void;
    sync.connect('owner', () => new Promise(resolve => { finish = resolve; })); sync.receive(null);
    const pending = sync.flush(); sync.disconnect(); sync.edit('after logout'); finish({ status: 'saved', revision: 1 }); await pending;
    expect(sync.status).toBe('local'); expect(sync.source).toBe('after logout');
  });
  it('does not throw or overwrite a conflict when local storage is unavailable', () => {
    const store = memory(); const sync = new DraftSync(store, 'example', () => {});
    sync.edit('my work'); sync.connect('owner', saved); sync.receive(cloud('remote'));
    store.setItem = () => { throw new Error('quota'); };
    sync.resolve('cloud'); expect(sync.source).toBe('my work'); expect(sync.hasConflict).toBe(true); expect(sync.status).toBe('storage-error');
  });
});

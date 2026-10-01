import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibrarySync } from '../src/library-sync';
import { StudyLibrary } from '../src/study-library';
import type { CloudStudyFile, SaveFileArgs, SaveFileResult } from '../src/cloud-api';

function memory(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => values.clear(),
  };
}

function server(initial: CloudStudyFile[] = []) {
  const files = new Map(initial.map((file) => [file.id, file]));
  const list = vi.fn(async () => [...files.values()].map(({ id, version }) => ({ id, version })));
  const get = vi.fn(async (id: string) => structuredClone(files.get(id) ?? null));
  const save = vi.fn(async ({ file, baseVersion }: SaveFileArgs): Promise<SaveFileResult> => {
    const current = files.get(file.id);
    if (current?.revision === file.revision) return { status: 'saved', file: current };
    if (current?.deletedAt !== undefined)
      return { status: file.deletedAt === undefined ? 'conflict' : 'saved', file: current };
    if ((current?.version ?? 0) !== baseVersion)
      return { status: 'conflict', file: current ?? null };
    const next = { ...file, version: baseVersion + 1 };
    files.set(file.id, next);
    return { status: 'saved', file: next };
  });
  return { files, list, get, save };
}

function client(storage = memory(), source = '') {
  const library = new StudyLibrary(() => storage, source);
  const changed = vi.fn();
  const sync = new LibrarySync(library, changed);
  return { library, sync, changed, storage };
}
async function connect(
  local: ReturnType<typeof client>,
  remote: ReturnType<typeof server>,
  owner = 'owner',
) {
  local.sync.connect(owner, remote);
  await local.sync.refresh();
}
const remoteFile: CloudStudyFile = {
  id: 'remote-file',
  name: 'Remoto',
  source: 'cloud source',
  createdAt: 100,
  updatedAt: 100,
  revision: 'remote-v1',
  version: 1,
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('whole-library synchronization', () => {
  it('propagates offline deletion after reconnect and clears an unchanged active file', async () => {
    const remote = server([remoteFile]);
    const first = client();
    const second = client();
    await connect(first, remote);
    await connect(second, remote);
    second.library.open(remoteFile.id);
    first.sync.disconnect();
    first.library.delete(remoteFile.id);
    expect(first.library.list()).toEqual([]);
    const restarted = client(first.storage);
    await connect(restarted, remote);
    await second.sync.refresh();
    expect(second.library.list()).toEqual([]);
    expect(second.library.active).toBeNull();
    expect(second.changed).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceChange: { previous: remoteFile.source, next: '' },
      }),
    );
    expect(remote.files.get(remoteFile.id)).toMatchObject({
      source: '',
      deletedAt: expect.any(Number),
    });
    expect(restarted.sync.status).toBe('saved');
  });

  it('keeps concurrent offline edits as a new copy without resurrecting the deleted ID', async () => {
    const remote = server([remoteFile]);
    const deleting = client();
    const editing = client();
    await connect(deleting, remote);
    await connect(editing, remote);
    editing.library.open(remoteFile.id);
    editing.sync.disconnect();
    editing.library.save('offline edits');
    deleting.library.delete(remoteFile.id);
    await deleting.sync.flush();
    await connect(editing, remote);
    expect(editing.library.list()).toHaveLength(1);
    expect(editing.library.list()[0]).toMatchObject({
      source: 'offline edits',
      name: 'Remoto (conflito)',
    });
    expect(editing.library.active?.id).not.toBe(remoteFile.id);
    expect(remote.files.get(remoteFile.id)?.deletedAt).toBeDefined();
    expect(editing.sync.status).toBe('saved');
  });

  it('preserves a newer remote edit before rebasing an offline deletion', async () => {
    const remote = server([remoteFile]);
    const local = client();
    await connect(local, remote);
    local.sync.disconnect();
    local.library.delete(remoteFile.id);
    remote.files.set(remoteFile.id, {
      ...remoteFile,
      source: 'newer',
      revision: 'newer',
      version: 2,
    });
    await connect(local, remote);
    expect(local.library.list()).toHaveLength(1);
    expect(local.library.list()[0]).toMatchObject({
      id: 'newer',
      name: 'Remoto (conflito)',
      source: 'newer',
    });
    expect(remote.files.get(remoteFile.id)).toMatchObject({
      source: '',
      version: 3,
      deletedAt: expect.any(Number),
    });
    expect(local.sync.status).toBe('saved');
  });

  it.each(['deleting', 'editing'] as const)(
    'keeps offline edits when the %s device reconnects first',
    async (first) => {
      const remote = server([remoteFile]);
      const deleting = client();
      const editing = client();
      await connect(deleting, remote);
      await connect(editing, remote);
      editing.library.open(remoteFile.id);
      deleting.sync.disconnect();
      editing.sync.disconnect();
      deleting.library.delete(remoteFile.id);
      const edited = editing.library.save('important offline edit');

      const clients = first === 'deleting' ? [deleting, editing] : [editing, deleting];
      for (const local of clients) await connect(local, remote);
      for (const local of clients) await local.sync.refresh();

      const copy = {
        id: edited.revision,
        name: 'Remoto (conflito)',
        source: 'important offline edit',
      };
      for (const local of clients) {
        expect(local.library.list()).toHaveLength(1);
        expect(local.library.list()[0]).toMatchObject(copy);
        expect(local.sync.status).toBe('saved');
      }
      expect(remote.files.get(edited.revision)).toMatchObject(copy);
      expect(remote.files.get(remoteFile.id)).toMatchObject({
        source: '',
        deletedAt: expect.any(Number),
      });
      expect(remote.files.size).toBe(2);
    },
  );

  it('does not upload a deletion if preserving the concurrent edit fails', async () => {
    const remote = server([remoteFile]);
    const local = client();
    await connect(local, remote);
    local.sync.disconnect();
    local.library.delete(remoteFile.id);
    remote.files.set(remoteFile.id, {
      ...remoteFile,
      source: 'newer',
      revision: 'newer',
      version: 2,
    });
    const setItem = local.storage.setItem;
    const write = vi.spyOn(local.storage, 'setItem').mockImplementation((key, value) => {
      if (key === 'typescript-pad:file:v1:newer') throw new Error('quota');
      setItem(key, value);
    });
    await connect(local, remote);
    expect(local.sync.status).toBe('storage-error');
    expect(remote.files.get(remoteFile.id)).toMatchObject({ source: 'newer', version: 2 });
    expect(remote.files.get(remoteFile.id)?.deletedAt).toBeUndefined();

    write.mockRestore();
    await local.sync.refresh();
    expect(local.library.list()).toHaveLength(1);
    expect(remote.files.get('newer')).toMatchObject({ source: 'newer' });
    expect(remote.files.get(remoteFile.id)?.deletedAt).toBeDefined();
    expect(local.sync.status).toBe('saved');
  });

  it('binds newly created files to the signed-in account before the debounce or network request', async () => {
    const local = client();
    const firstAccount = server();
    await connect(local, firstAccount);
    local.library.save('private', 'Novo');
    expect(local.library.active?.sync?.owner).toBe('owner');
    local.sync.disconnect();
    const other = server();
    await connect(local, other, 'another-owner');
    expect(other.save).not.toHaveBeenCalled();
  });

  it('recovers an accepted upload whose response was lost without making duplicate files', async () => {
    const local = client();
    const remote = server();
    const file = local.library.save('work', 'Estudo');
    remote.save.mockImplementationOnce(async (args) => {
      remote.files.set(args.file.id, { ...args.file, version: 1 });
      throw new Error('Connection lost after commit');
    });
    await connect(local, remote);
    expect(local.sync.status).toBe('error');
    local.sync.disconnect();
    const resumed = client(local.storage, 'work');
    await connect(resumed, remote);
    expect(resumed.sync.status).toBe('saved');
    expect(remote.files.size).toBe(1);
    expect(resumed.library.read(file.id)?.sync?.version).toBe(1);
  });

  it('requests editor replacement only when the active file itself receives a clean remote change', async () => {
    const remote = server([remoteFile]);
    const local = client();
    await connect(local, remote);
    local.library.open(remoteFile.id);
    local.changed.mockClear();
    remote.files.set('other', { ...remoteFile, id: 'other' });
    await local.sync.refresh();
    expect(local.changed.mock.calls.every(([change]) => !change.sourceChange)).toBe(true);
    remote.files.set(remoteFile.id, {
      ...remoteFile,
      source: 'new cloud text',
      version: 2,
      revision: 'next',
    });
    await local.sync.refresh();
    expect(local.changed).toHaveBeenCalledWith({
      filesChanged: true,
      conflict: false,
      sourceChange: { previous: 'cloud source', next: 'new cloud text' },
    });
  });

  it('does not replace unsaved editor text when a different file downloads successfully', async () => {
    const remote = server([remoteFile]);
    const local = client();
    await connect(local, remote);
    local.library.open(remoteFile.id);
    local.sync.disconnect();
    let editorText = 'unsaved edit';
    const sync = new LibrarySync(
      local.library,
      (change) => {
        if (change.sourceChange && editorText === change.sourceChange.previous)
          editorText = change.sourceChange.next;
      },
      () => editorText,
    );
    remote.files.set('other', { ...remoteFile, id: 'other', source: 'another study' });
    sync.connect('owner', remote);
    await sync.refresh();
    expect(local.library.list()).toHaveLength(2);
    expect(editorText).toBe('unsaved edit');
  });
  it('uploads the existing local library and downloads studies from another device', async () => {
    const remote = server([remoteFile]);
    const local = client();
    const original = local.library.save('local source', 'Local');
    await connect(local, remote);
    expect(local.sync.status).toBe('saved');
    expect(local.library.list()).toHaveLength(2);
    expect(local.library.active?.id).toBe(original.id);
    expect(remote.files.get(original.id)?.source).toBe('local source');
    expect(local.library.read(remoteFile.id)?.sync).toEqual({
      owner: 'owner',
      version: 1,
      revision: 'remote-v1',
    });
  });

  it('resumes offline edits after restart with their durable base revision', async () => {
    const remote = server();
    const local = client();
    const file = local.library.save('first', 'Estudo');
    await connect(local, remote);
    local.sync.disconnect();
    local.library.save('offline');
    const resumed = client(local.storage, 'offline');
    await connect(resumed, remote);
    expect(remote.files.get(file.id)).toMatchObject({ source: 'offline', version: 2 });
    expect(resumed.sync.status).toBe('saved');
  });

  it('keeps and uploads both versions when two devices edit the same base', async () => {
    const remote = server();
    const first = client();
    const second = client();
    const file = first.library.save('base', 'Estudo');
    await connect(first, remote);
    await connect(second, remote);
    second.library.open(file.id);
    second.sync.disconnect();
    second.library.save('second offline edit');
    first.library.save('first edit');
    await first.sync.flush();
    await connect(second, remote);
    expect(second.library.active).toMatchObject({
      name: 'Estudo (conflito)',
      source: 'second offline edit',
    });
    expect([...remote.files.values()].map((file) => file.source).sort()).toEqual([
      'first edit',
      'second offline edit',
    ]);
    expect(second.changed).toHaveBeenCalledWith({ filesChanged: true, conflict: true });
    await first.sync.refresh();
    expect(first.library.list()).toHaveLength(2);
  });

  it('handles a conflict returned by a save after the subscription snapshot became stale', async () => {
    const remote = server([remoteFile]);
    const local = client();
    await connect(local, remote);
    local.library.open(remoteFile.id);
    local.library.save('offline edit');
    remote.files.set(remoteFile.id, {
      ...remoteFile,
      source: 'other edit',
      revision: 'remote-v2',
      version: 2,
    });
    await local.sync.flush();
    expect([...remote.files.values()].map((file) => file.source).sort()).toEqual([
      'offline edit',
      'other edit',
    ]);
  });

  it('sends edits made during a request without replacing the newer editor contents or making a conflict copy', async () => {
    const remote = server();
    const local = client();
    const file = local.library.save('base', 'Estudo');
    await connect(local, remote);
    let complete!: (result: SaveFileResult) => void;
    remote.save.mockImplementationOnce(
      (args) =>
        new Promise((resolve) => {
          complete = (result) => {
            remote.files.set(args.file.id, { ...args.file, version: 2 });
            resolve(result);
          };
        }),
    );
    local.library.save('first edit');
    const pending = local.sync.flush();
    const sent = local.library.active!;
    local.library.save('newer edit');
    local.sync.receive([{ id: file.id, version: 2 }]);
    const { sync: _sync, ...payload } = sent;
    complete({ status: 'saved', file: { ...payload, version: 2 } });
    await pending;
    expect(local.library.active?.source).toBe('newer edit');
    expect(local.library.list()).toHaveLength(1);
    expect(remote.files.get(file.id)).toMatchObject({ source: 'newer edit', version: 3 });
  });

  it('ignores old subscription versions and only fetches changed files', async () => {
    const remote = server([remoteFile]);
    const local = client();
    await connect(local, remote);
    local.library.open(remoteFile.id);
    local.library.save('new');
    await local.sync.flush();
    const calls = remote.get.mock.calls.length;
    local.sync.receive([{ id: remoteFile.id, version: 1 }]);
    await local.sync.flush();
    expect(remote.get).toHaveBeenCalledTimes(calls);
    expect(local.library.active?.source).toBe('new');
  });

  it('ignores late results after sign-out and never uploads bound files to a different account', async () => {
    const local = client();
    const remote = server();
    const file = local.library.save('private code', 'Estudo');
    let complete!: (result: SaveFileResult) => void;
    remote.save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const pending = connect(local, remote);
    await vi.waitFor(() => expect(remote.save).toHaveBeenCalled());
    local.sync.disconnect();
    local.library.save('private offline edit');
    complete({ status: 'saved', file: { ...file, version: 1 } });
    await pending;
    expect(local.sync.status).toBe('local');
    expect(local.library.active?.source).toBe('private offline edit');
    const otherAccount = server();
    await connect(local, otherAccount, 'another-owner');
    expect(otherAccount.save).not.toHaveBeenCalled();
  });

  it('preserves unsaved editor text when storage fills up before a remote update', async () => {
    const remote = server([remoteFile]);
    const local = client();
    await connect(local, remote);
    local.library.open(remoteFile.id);
    local.sync.disconnect();
    const sync = new LibrarySync(
      local.library,
      () => {},
      () => 'unsaved editor text',
    );
    vi.spyOn(local.storage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    remote.files.set(remoteFile.id, {
      ...remoteFile,
      source: 'remote edit',
      version: 2,
      revision: 'remote-v2',
    });
    sync.connect('owner', remote);
    await sync.refresh();
    expect(sync.status).toBe('storage-error');
    expect(local.library.active?.source).toBe('cloud source');
    expect(local.library.read(remoteFile.id)?.source).toBe('cloud source');
  });

  it('leaves failed uploads pending for retry while other files still sync', async () => {
    const remote = server();
    const local = client();
    const huge = local.library.save('x'.repeat(200_001), 'Grande');
    local.library.detach();
    const small = local.library.save('small', 'Pequeno');
    await connect(local, remote);
    expect(local.sync.status).toBe('error');
    expect(remote.files.has(huge.id)).toBe(false);
    expect(remote.files.has(small.id)).toBe(true);
    local.library.open(huge.id);
    local.library.save('reduced');
    await local.sync.refresh();
    expect(local.sync.status).toBe('saved');
    expect(remote.files.get(huge.id)?.source).toBe('reduced');
  });

  it('renames across devices without changing the file identity or creation date', async () => {
    const remote = server([remoteFile]);
    const first = client();
    const second = client();
    await connect(first, remote);
    await connect(second, remote);
    first.library.open(remoteFile.id);
    first.library.save(remoteFile.source, 'Novo nome');
    await first.sync.flush();
    await second.sync.refresh();
    expect(second.library.read(remoteFile.id)).toMatchObject({ name: 'Novo nome', createdAt: 100 });
    expect(second.library.list()).toHaveLength(1);
  });
});

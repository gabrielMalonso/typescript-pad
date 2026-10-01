import type { CloudStudyFile, FileRevision, SaveFileArgs, SaveFileResult } from './cloud-api';
import { fileName, type StudyFile, type StudyLibrary } from './study-library';

export type LibraryStatus = 'local' | 'pending' | 'saved' | 'error' | 'storage-error';
type Transport = {
  list: () => Promise<FileRevision[]>;
  get: (id: string) => Promise<CloudStudyFile | null>;
  save: (args: SaveFileArgs) => Promise<SaveFileResult>;
};
type Change = {
  filesChanged: boolean;
  conflict: boolean;
  sourceChange?: { previous: string; next: string };
};
class StorageFailure extends Error {}

/** Local edits stay durable while per-file revisions converge with the signed-in account. */
export class LibrarySync {
  status: LibraryStatus = 'local';
  private connection: (Transport & { owner: string }) | null = null;
  private versions = new Map<string, number>();
  private generation = 0;
  private ready = false;
  private requested = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private flight: Promise<void> | undefined;

  constructor(
    private library: StudyLibrary,
    private changed: (change: Change) => void,
    private activeSource?: () => string,
  ) {
    library.onEdit = () => {
      if (!this.connection) return;
      this.requested = true;
      this.emit('pending');
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        void this.flush();
      }, 750);
    };
  }

  private emit(
    status: LibraryStatus,
    filesChanged = false,
    conflict = false,
    sourceChange?: Change['sourceChange'],
  ) {
    this.status = status;
    this.changed({ filesChanged, conflict, ...(sourceChange ? { sourceChange } : {}) });
  }

  private local<T>(action: () => T): T {
    try {
      return action();
    } catch {
      throw new StorageFailure('Não foi possível guardar a biblioteca neste dispositivo.');
    }
  }

  connect(owner: string, transport: Transport) {
    this.disconnect();
    this.connection = { owner, ...transport };
    this.library.syncOwner = owner;
    this.emit('pending');
  }

  disconnect() {
    this.generation++;
    clearTimeout(this.timer);
    this.connection = null;
    this.library.syncOwner = null;
    this.flight = undefined;
    this.ready = false;
    this.requested = false;
    this.versions.clear();
    this.emit('local');
  }

  fail() {
    if (this.connection) this.emit('error');
  }

  receive(files: FileRevision[]) {
    if (!this.connection) return;
    let changed = !this.ready;
    this.ready = true;
    for (const file of files) {
      if (file.version > (this.versions.get(file.id) ?? 0)) {
        this.versions.set(file.id, file.version);
        changed = true;
      }
    }
    if (changed) void this.flush();
  }

  async refresh() {
    const connection = this.connection;
    if (!connection) return;
    const generation = this.generation;
    try {
      const files = await connection.list();
      if (generation !== this.generation) return;
      this.receive(files);
      await this.flush();
    } catch {
      if (generation === this.generation) this.fail();
    }
  }

  private checkpoint(remote: CloudStudyFile, owner: string): StudyFile {
    const { version, ...file } = remote;
    return { ...file, sync: { owner, version, revision: file.revision } };
  }

  private remember(remote: CloudStudyFile) {
    this.versions.set(remote.id, Math.max(remote.version, this.versions.get(remote.id) ?? 0));
  }

  private preserveConflict(file: StudyFile, owner: string): StudyFile {
    const existingCopy = this.local(() => this.library.read(file.revision));
    const copy: StudyFile = {
      ...file,
      id: existingCopy && existingCopy.source !== file.source ? crypto.randomUUID() : file.revision,
      name: `${fileName(file.name)} (conflito)`,
      sync: { owner, version: 0, revision: null },
    };
    // Persist the copy before advancing the checkpoint or replacing the original.
    if (!existingCopy || copy.id !== existingCopy.id) this.local(() => this.library.write(copy));
    return copy;
  }

  private merge(remote: CloudStudyFile, owner: string) {
    // A failed autosave can leave newer text only in the editor/draft. Preserve it first.
    const active = this.library.active;
    const source = this.activeSource?.();
    if (active?.id === remote.id && source !== undefined && source !== active.source)
      this.local(() => this.library.save(source));
    const local = this.local(() => this.library.read(remote.id));
    if (local?.sync && local.sync.owner !== owner) throw new Error('Arquivo de outra conta.');
    if (local?.sync && local.sync.version >= remote.version) return;
    // Keep concurrent remote edits before rebasing a pending deletion.
    if (local?.deletedAt !== undefined && remote.deletedAt === undefined) {
      this.preserveConflict(this.checkpoint(remote, owner), owner);
      this.local(() => this.library.write({ ...local, sync: this.checkpoint(remote, owner).sync }));
      this.remember(remote);
      this.requested = true;
      this.emit('pending', true, true);
      return;
    }
    let conflict = false;
    if (
      local &&
      local.deletedAt === undefined &&
      local.revision !== remote.revision &&
      local.sync?.revision !== local.revision &&
      (local.source !== remote.source ||
        local.name !== remote.name ||
        remote.deletedAt !== undefined)
    ) {
      const copy = this.preserveConflict(local, owner);
      if (this.library.active?.id === local.id) this.local(() => this.library.open(copy.id));
      this.requested = true;
      conflict = true;
    }
    this.local(() => this.library.write(this.checkpoint(remote, owner)));
    this.remember(remote);
    const sourceChange =
      active?.id === remote.id &&
      (this.library.active?.id === remote.id || (remote.deletedAt !== undefined && !conflict)) &&
      active.source !== remote.source
        ? { previous: active.source, next: remote.source }
        : undefined;
    this.emit('pending', true, conflict, sourceChange);
  }

  private acknowledge(sent: StudyFile, remote: CloudStudyFile, owner: string) {
    const current = this.local(() => this.library.read(sent.id));
    if (!current || current.sync?.owner !== owner || current.sync.version > remote.version) return;
    const saved = this.checkpoint(remote, owner);
    this.local(() =>
      this.library.write(
        current.revision === sent.revision ? saved : { ...current, sync: saved.sync },
      ),
    );
    if (current.revision !== sent.revision) this.requested = true;
    this.remember(remote);
    this.emit('pending', true);
  }

  flush(): Promise<void> {
    clearTimeout(this.timer);
    if (!this.connection || !this.ready) return Promise.resolve();
    this.requested = true;
    if (this.flight) return this.flight;
    const generation = this.generation;
    this.flight = this.run(this.connection, generation).finally(() => {
      if (generation === this.generation) this.flight = undefined;
    });
    return this.flight;
  }

  private async run(connection: Transport & { owner: string }, generation: number) {
    const current = () => generation === this.generation;
    const owner = connection.owner;
    this.emit('pending');
    try {
      while (this.requested && current()) {
        this.requested = false;
        let failure: LibraryStatus | undefined;
        for (const [id, version] of this.versions) {
          if (!current()) return;
          try {
            const local = this.local(() => this.library.read(id));
            if (local?.sync?.owner === owner && local.sync.version >= version) continue;
            const remote = await connection.get(id);
            if (!current()) return;
            if (!remote) throw new Error('Arquivo indisponível.');
            this.merge(remote, owner);
          } catch (error) {
            failure = error instanceof StorageFailure ? 'storage-error' : (failure ?? 'error');
          }
        }
        const files = this.local(() => this.library.list(true));
        if (this.library.unreadableFiles) failure = 'storage-error';
        for (const listed of files) {
          if (!current()) return;
          const file = this.local(() => this.library.read(listed.id));
          if (!file) continue;
          if (file.sync && (file.sync.owner !== owner || file.sync.revision === file.revision))
            continue;
          try {
            if (file.source.length > 200_000)
              throw new Error('Arquivo maior que 200 mil caracteres.');
            const pending: StudyFile = file.sync
              ? file
              : { ...file, sync: { owner, version: 0, revision: null } };
            // Bind the file to this account before sending it, including failed/offline sends.
            if (!file.sync) this.local(() => this.library.write(pending));
            const { sync, ...source } = pending;
            const result = await connection.save({ file: source, baseVersion: sync?.version ?? 0 });
            if (!current()) return;
            if (result.status === 'saved') this.acknowledge(pending, result.file, owner);
            else {
              if (!result.file) throw new Error('A versão na conta está indisponível.');
              this.merge(result.file, owner);
            }
          } catch (error) {
            failure = error instanceof StorageFailure ? 'storage-error' : (failure ?? 'error');
          }
        }
        if (!current()) return;
        if (failure) {
          this.emit(failure, true);
          return;
        }
      }
      if (current()) this.emit('saved');
    } catch (error) {
      if (current()) this.emit(error instanceof StorageFailure ? 'storage-error' : 'error');
    }
  }
}

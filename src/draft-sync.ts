import type { CloudDraft, SaveArgs, SaveResult } from './cloud-api';

type LocalDraft = { source: string; owner: string | null; base: CloudDraft | null; hasDraft: boolean };
export type DraftStatus = 'local' | 'pending' | 'saved' | 'conflict' | 'error' | 'storage-error';
const key = 'typescript-pad:draft:v1';
const legacyKey = 'typescript-pad:source';

/** A durable local draft with optimistic revisions; receiving a cloud update never discards an edit. */
export class DraftSync {
  private local: LocalDraft;
  private remote: CloudDraft | null = null;
  private ready = false;
  private connected = false;
  private generation = 0;
  private running = false;
  private conflict = false;
  private storageFailed = false;
  private send?: (args: SaveArgs) => Promise<SaveResult>;
  status: DraftStatus = 'local';

  constructor(private storage: Storage, initial: string, private changed: () => void) {
    this.local = { source: initial, owner: null, base: null, hasDraft: false };
    try {
      const legacy = storage.getItem(legacyKey);
      if (legacy !== null) this.local = { ...this.local, source: legacy, hasDraft: true };
      const raw = storage.getItem(key);
      if (raw) {
        const value: unknown = JSON.parse(raw);
        if (isLocal(value)) this.local = value;
        else this.storageFailed = true;
      }
    } catch { this.storageFailed = true; }
    if (this.storageFailed) this.status = 'storage-error';
  }
  get source() { return this.local.source; }
  get cloud() { return this.remote; }
  get hasConflict() { return this.conflict; }

  private emit(status: DraftStatus) {
    this.status = this.storageFailed ? 'storage-error' : status;
    this.changed();
  }
  private persist() {
    try {
      this.storage.setItem(key, JSON.stringify(this.local));
      this.storageFailed = false;
    } catch { this.storageFailed = true; }
  }
  edit(source: string) {
    if (source === this.local.source) return;
    this.local.source = source;
    this.local.hasDraft = true;
    this.persist();
    this.emit(this.conflict ? 'conflict' : this.connected ? 'pending' : 'local');
  }
  connect(owner: string, send: (args: SaveArgs) => Promise<SaveResult>) {
    this.generation++;
    this.running = false;
    if (owner !== this.local.owner) this.local.base = null;
    this.local.owner = owner;
    this.send = send;
    this.connected = true;
    this.ready = false;
    this.conflict = false;
    this.persist();
    this.emit('pending');
  }
  disconnect() {
    this.generation++;
    this.connected = false;
    this.ready = false;
    this.running = false;
    this.send = undefined;
    this.conflict = false;
    this.emit('local');
  }
  receive(remote: CloudDraft | null) {
    if (!this.connected) return;
    if (remote && this.remote && this.ready && remote.revision < this.remote.revision) return;
    this.remote = remote;
    this.ready = true;
    // The subscription may precede the mutation response; let that response establish the base.
    if (this.running) return;
    this.reconcile();
  }
  private reconcile() {
    const remote = this.remote;
    if (remote?.source === this.local.source) {
      this.local.base = remote;
      this.local.hasDraft = true;
      this.conflict = false;
      this.persist();
      this.emit('saved');
    } else if (!this.local.hasDraft || (this.local.base && this.local.source === this.local.base.source)) {
      if (remote) {
        this.local.source = remote.source;
        this.local.base = remote;
        this.local.hasDraft = true;
        this.conflict = false;
        this.persist();
        this.emit('saved');
      } else this.emit('local');
    } else if ((remote?.revision ?? 0) !== (this.local.base?.revision ?? 0)) {
      this.conflict = true;
      this.emit('conflict');
    } else {
      this.conflict = false;
      this.emit('pending');
    }
  }
  async flush() {
    if (!this.connected || !this.ready || this.running || this.conflict || !this.send || !this.local.hasDraft) return;
    if (this.local.source === this.local.base?.source) return;
    if (this.local.source.length > 200_000) { this.emit('error'); return; }
    const generation = this.generation;
    const source = this.local.source;
    this.running = true;
    try {
      const result = await this.send({ source, baseRevision: this.local.base?.revision ?? 0, operationId: crypto.randomUUID() });
      if (generation !== this.generation) return;
      if (result.status === 'conflict') {
        this.conflict = true;
        this.emit('conflict');
      } else {
        this.local.base = { source, revision: result.revision, updatedAt: Date.now() };
        this.persist();
        this.emit(this.local.source === source ? 'saved' : 'pending');
      }
    } catch {
      if (generation === this.generation) this.emit('error');
    } finally {
      if (generation === this.generation) {
        this.running = false;
        if (this.remote && this.remote.revision > (this.local.base?.revision ?? 0)) this.reconcile();
        if (this.status === 'pending') void this.flush();
      }
    }
  }
  resolve(choice: 'local' | 'cloud', expectedRevision = this.remote?.revision) {
    if (!this.conflict || !this.remote) return;
    if (this.remote.revision !== expectedRevision) return;
    // Preserve both choices before replacing anything, even if another device changes again.
    try {
      this.storage.setItem('typescript-pad:recovery:' + crypto.randomUUID(), JSON.stringify({ local: this.local.source, cloud: this.remote.source, savedAt: Date.now() }));
    } catch { this.storageFailed = true; this.emit('storage-error'); return; }
    if (choice === 'cloud') this.local.source = this.remote.source;
    this.local.base = this.remote;
    this.conflict = false;
    this.persist();
    this.emit(choice === 'cloud' ? 'saved' : 'pending');
  }
}

function isCloud(value: unknown): value is CloudDraft {
  return Boolean(value && typeof value === 'object' && 'source' in value && typeof value.source === 'string' && 'revision' in value && typeof value.revision === 'number' && Number.isSafeInteger(value.revision) && value.revision > 0 && 'updatedAt' in value && typeof value.updatedAt === 'number');
}
function isLocal(value: unknown): value is LocalDraft {
  return Boolean(value && typeof value === 'object' && 'source' in value && typeof value.source === 'string' && 'owner' in value && (value.owner === null || typeof value.owner === 'string') && 'hasDraft' in value && typeof value.hasDraft === 'boolean' && 'base' in value && (value.base === null || isCloud(value.base)));
}

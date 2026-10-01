export type StudyFile = {
  id: string;
  name: string;
  source: string;
  createdAt: number;
  updatedAt: number;
  revision: string;
  deletedAt?: number;
  sync?: { owner: string; version: number; revision: string | null };
};
export type FileOrder = 'recent' | 'oldest' | 'name';
const prefix = 'typescript-pad:file:v1:';
const activeKey = 'typescript-pad:active-file:v1';

function isFile(value: unknown): value is StudyFile {
  if (!value || typeof value !== 'object') return false;
  return (
    'id' in value &&
    typeof value.id === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'source' in value &&
    typeof value.source === 'string' &&
    'revision' in value &&
    typeof value.revision === 'string' &&
    'createdAt' in value &&
    typeof value.createdAt === 'number' &&
    Number.isSafeInteger(value.createdAt) &&
    Math.abs(value.createdAt) <= 8.64e15 &&
    'updatedAt' in value &&
    typeof value.updatedAt === 'number' &&
    Number.isSafeInteger(value.updatedAt) &&
    Math.abs(value.updatedAt) <= 8.64e15 &&
    (!('deletedAt' in value) ||
      (typeof value.deletedAt === 'number' &&
        Number.isSafeInteger(value.deletedAt) &&
        value.deletedAt >= 0 &&
        value.deletedAt <= 8.64e15)) &&
    (!('sync' in value) || isSyncState(value.sync))
  );
}

function isSyncState(value: unknown): value is NonNullable<StudyFile['sync']> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'owner' in value &&
    typeof value.owner === 'string' &&
    'version' in value &&
    typeof value.version === 'number' &&
    Number.isSafeInteger(value.version) &&
    value.version >= 0 &&
    'revision' in value &&
    (value.revision === null || typeof value.revision === 'string'),
  );
}

export function fileName(name: string): string {
  return name.trim().replace(/\.ts$/i, '').trim().slice(0, 100) || 'Sem título';
}

export function selectFiles(files: StudyFile[], query: string, order: FileOrder): StudyFile[] {
  const normalize = (text: string) =>
    text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');
  const search = normalize(query.trim());
  return files
    .filter((file) => normalize(file.name).includes(search))
    .sort((a, b) => {
      if (order === 'name')
        return (
          a.name.localeCompare(b.name, 'pt-BR', { numeric: true }) || b.updatedAt - a.updatedAt
        );
      return (
        (order === 'oldest' ? a.createdAt - b.createdAt : b.updatedAt - a.updatedAt) ||
        a.name.localeCompare(b.name, 'pt-BR')
      );
    });
}

/** Each study has its own key, so saving one never rewrites the whole library. */
export class StudyLibrary {
  active: StudyFile | null = null;
  unreadableFiles = 0;
  onEdit = () => {};
  syncOwner: string | null = null;

  constructor(
    private storage: () => Storage,
    source: string,
  ) {
    // A cloud update or interrupted write may leave the pointer behind the draft.
    // Only restore the association when both durable copies agree.
    try {
      const id = storage().getItem(activeKey);
      if (id) {
        const file = this.read(id);
        if (file && file.deletedAt === undefined && file.source === source) this.active = file;
      }
    } catch {
      /* Opening the editor must still work if storage is unavailable. */
    }
  }

  read(id: string): StudyFile | null {
    const raw = this.storage().getItem(prefix + id);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (!isFile(value) || value.id !== id)
      throw new Error('Arquivo inválido. A cópia original foi preservada.');
    return value;
  }

  list(includeDeleted = false): StudyFile[] {
    const storage = this.storage();
    const files: StudyFile[] = [];
    this.unreadableFiles = 0;
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (!key?.startsWith(prefix)) continue;
      try {
        const file = this.read(key.slice(prefix.length));
        if (file && (includeDeleted || file.deletedAt === undefined)) files.push(file);
      } catch {
        this.unreadableFiles++;
      }
    }
    return files;
  }

  private remember() {
    try {
      this.storage().setItem(activeKey, this.active?.id ?? '');
    } catch {
      /* The file is already durable; this pointer only restores selection. */
    }
  }

  detach() {
    this.active = null;
    this.remember();
  }

  open(id: string) {
    const file = this.read(id);
    if (!file || file.deletedAt !== undefined)
      throw new Error('Este arquivo não está mais disponível.');
    this.active = file;
    this.remember();
    return file;
  }

  save(source: string, name = this.active?.name): StudyFile {
    const previous = this.active;
    const normalizedName = name === undefined ? undefined : fileName(name);
    if (previous && previous.source === source && previous.name === normalizedName) return previous;
    const latest = previous ? this.read(previous.id) : null;
    // Another tab may have edited this study. Keep its version and save ours as a copy.
    const conflict = previous !== null && latest?.revision !== previous.revision;
    const now = Date.now();
    const id = previous && !conflict ? previous.id : crypto.randomUUID();
    const file: StudyFile = {
      id,
      name: (normalizedName ?? `Sem título ${id.slice(0, 8)}`) + (conflict ? ' (cópia)' : ''),
      source,
      createdAt: previous && !conflict ? previous.createdAt : now,
      updatedAt: now,
      revision: crypto.randomUUID(),
      ...(previous?.sync
        ? {
            sync: conflict
              ? { owner: previous.sync.owner, version: 0, revision: null }
              : previous.sync,
          }
        : this.syncOwner
          ? { sync: { owner: this.syncOwner, version: 0, revision: null } }
          : {}),
    };
    this.write(file);
    this.active = file;
    this.remember();
    this.onEdit();
    return file;
  }

  rename(id: string, name: string) {
    const file = this.read(id);
    if (!file || file.deletedAt !== undefined) throw new Error('Código indisponível.');
    this.write({
      ...file,
      name: fileName(name),
      updatedAt: Date.now(),
      revision: crypto.randomUUID(),
    });
    this.onEdit();
  }

  /** Keep a deletion revision so offline devices cannot bring the file back. */
  delete(id: string) {
    const file = this.read(id);
    if (!file || file.deletedAt !== undefined) return;
    const now = Date.now();
    this.write({
      ...file,
      source: '',
      deletedAt: now,
      updatedAt: now,
      revision: crypto.randomUUID(),
    });
    this.onEdit();
  }

  /** Store received revisions atomically with their synchronization checkpoint. */
  write(file: StudyFile) {
    this.storage().setItem(prefix + file.id, JSON.stringify(file));
    if (this.active?.id === file.id) {
      if (file.deletedAt !== undefined) this.detach();
      else this.active = file;
    }
  }

  /** Preserve even unnamed work before replacing the editor's document. */
  preserve(source: string) {
    if (this.active || source.trim()) this.save(source);
  }

  /** Export the live editor too, even when storage is full and its last save failed. */
  exportFiles(source: string): StudyFile[] {
    const files = this.list();
    if (this.unreadableFiles) throw new Error('Há arquivos ilegíveis.');
    if (this.active) {
      const current = files.find((file) => file.id === this.active?.id);
      if (current?.revision === this.active.revision) {
        return files.map((file) => (file.id === this.active?.id ? { ...file, source } : file));
      }
    }
    if (!this.active && !source.trim()) return files;
    return [
      ...files,
      {
        id: crypto.randomUUID(),
        name: this.active ? `${this.active.name} (cópia)` : 'Sem título',
        source,
        createdAt: this.active?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        revision: crypto.randomUUID(),
      },
    ];
  }
}

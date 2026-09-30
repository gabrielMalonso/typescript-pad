import { describe, expect, it, vi } from 'vitest';
import { StudyLibrary, selectFiles } from '../src/study-library';

function memory(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    clear: () => data.clear(),
  };
}

describe('study library', () => {
  it('keeps the original creation date, autosaves edits and restores the matching draft', () => {
    const store = memory();
    const library = new StudyLibrary(() => store, '');
    const first = library.save('const a = 1;', ' Arrays.ts ');
    const changed = library.save('const a = 2;');
    expect(changed).toMatchObject({ id: first.id, name: 'Arrays', createdAt: first.createdAt });
    expect(new StudyLibrary(() => store, changed.source).active).toEqual(changed);
    expect(library.list()).toHaveLength(1);
    library.save(changed.source, 'Map');
    expect(library.list()[0]).toMatchObject({ id: first.id, name: 'Map', source: changed.source });
  });

  it('preserves unnamed work before a switch, including multiple studies with the same name', () => {
    const store = memory();
    const library = new StudyLibrary(() => store, '');
    library.preserve('my first study');
    const first = library.active!;
    library.detach();
    library.preserve('my second study');
    expect(library.list()).toHaveLength(2);
    expect(library.open(first.id).source).toBe('my first study');
    library.detach();
    library.preserve('');
    expect(library.list()).toHaveLength(2);
  });

  it('never associates a cloud draft or an interrupted save with an unrelated named file', () => {
    const store = memory();
    const original = new StudyLibrary(() => store, '');
    original.save('local study', 'Local');
    const restored = new StudyLibrary(() => store, 'different cloud code');
    expect(restored.active).toBeNull();
    restored.save('different cloud code', 'Cloud');
    expect(
      restored
        .list()
        .map((file) => file.source)
        .sort(),
    ).toEqual(['different cloud code', 'local study']);
  });

  it('keeps both versions when another tab changes an open study', () => {
    const store = memory();
    const first = new StudyLibrary(() => store, '');
    const file = first.save('original', 'Estudo');
    const second = new StudyLibrary(() => store, 'original');
    first.save('first tab');
    const fork = second.save('second tab');
    expect(fork.id).not.toBe(file.id);
    expect(fork.name).toBe('Estudo (cópia)');
    expect(first.read(file.id)?.source).toBe('first tab');
    expect(second.read(fork.id)?.source).toBe('second tab');
  });

  it('refuses a transition when saving fails, and lets the user retry without changing the durable file', () => {
    const store = memory();
    const library = new StudyLibrary(() => store, '');
    const file = library.save('original', 'Estudo');
    const write = vi.spyOn(store, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => library.preserve('important edit')).toThrow('quota');
    expect(library.active).toEqual(file);
    expect(library.read(file.id)?.source).toBe('original');
    write.mockRestore();
    library.preserve('important edit');
    expect(library.read(file.id)?.source).toBe('important edit');
  });

  it('preserves unreadable entries and reports them without hiding healthy files', () => {
    const store = memory();
    store.setItem('typescript-pad:file:v1:broken', '{');
    const library = new StudyLibrary(() => store, '');
    library.save('healthy', 'Estudo');
    expect(library.list()).toHaveLength(1);
    expect(library.unreadableFiles).toBe(1);
    expect(store.getItem('typescript-pad:file:v1:broken')).toBe('{');
  });

  it('exports unsaved work even with full storage, without changing the saved copy', () => {
    const store = memory();
    const library = new StudyLibrary(() => store, '');
    const original = library.save('saved version', 'Estudo');
    vi.spyOn(store, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(library.exportFiles('unsaved edit')).toEqual([{ ...original, source: 'unsaved edit' }]);
    expect(library.read(original.id)?.source).toBe('saved version');
    library.detach();
    expect(library.exportFiles('new draft').map((file) => file.source)).toEqual([
      'saved version',
      'new draft',
    ]);
  });

  it('includes both versions in exports when another tab edited the same study', () => {
    const store = memory();
    const first = new StudyLibrary(() => store, '');
    first.save('original', 'Estudo');
    const second = new StudyLibrary(() => store, 'original');
    first.save('first tab');
    expect(second.exportFiles('second tab').map((file) => file.source)).toEqual([
      'first tab',
      'second tab',
    ]);
  });

  it('searches without accents and orders by name, creation date or last edit', () => {
    const library = new StudyLibrary(() => memory(), '');
    const file = library.save('', 'Funções 2');
    const files = [
      file,
      { ...file, name: 'Arrays', createdAt: file.createdAt - 2, updatedAt: file.updatedAt + 2 },
      { ...file, name: 'Funções 10', createdAt: file.createdAt - 1 },
    ];
    expect(selectFiles(files, 'FUNCOES', 'name').map((file) => file.name)).toEqual([
      'Funções 2',
      'Funções 10',
    ]);
    expect(selectFiles(files, '', 'oldest')[0].name).toBe('Arrays');
    expect(selectFiles(files, '', 'recent')[0].name).toBe('Arrays');
  });
});

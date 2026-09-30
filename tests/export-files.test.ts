import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { downloadName, studyArchive } from '../src/export-files';
import type { StudyFile } from '../src/study-library';

const file: StudyFile = {
  id: '1',
  name: 'Funções / arrays',
  source: 'const mensagem = "Olá 🌎";\n',
  createdAt: new Date(2026, 8, 30, 12).getTime(),
  updatedAt: new Date(2026, 8, 30, 12).getTime(),
  revision: '1',
};

describe('study exports', () => {
  it('uses filesystem-safe names with the local creation date', () => {
    expect(downloadName(file)).toBe('2026-09-30_Funções - arrays.ts');
  });

  it('creates a ZIP readable by an independent implementation, preserving UTF-8 and duplicate names', () => {
    const archive = studyArchive([
      file,
      { ...file, source: 'second version' },
      { ...file, name: 'Vazio', source: '' },
    ]);
    // Reference archive produced by Python's standard zipfile implementation.
    const reference = readFileSync(new URL('./fixtures/studies.zip', import.meta.url));
    expect(Buffer.from(archive)).toEqual(reference);
  });
});

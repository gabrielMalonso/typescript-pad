import { Capacitor, registerPlugin } from '@capacitor/core';
import type { StudyFile } from './study-library';

const NativeFiles = registerPlugin<{
  save(options: {
    name: string;
    mimeType: string;
    base64: string;
  }): Promise<{ cancelled: boolean }>;
}>('PadFiles');

export function downloadName(file: Pick<StudyFile, 'name' | 'createdAt'>): string {
  const date = new Date(file.createdAt);
  const day = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
  const name =
    file.name
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
      .replace(/[. ]+$/g, '')
      .slice(0, 100) || 'Sem título';
  return `${day}_${name}.ts`;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** A standard, uncompressed ZIP: small study files don't need a compression dependency. */
export function studyArchive(files: StudyFile[]): Uint8Array<ArrayBuffer> {
  if (files.length > 65535) throw new Error('Exporte uma seleção menor de arquivos.');
  const encoder = new TextEncoder();
  const usedNames = new Set<string>();
  const entries = files.map((file) => {
    const original = downloadName(file);
    let name = original;
    let count = 2;
    while (usedNames.has(name.toLocaleLowerCase('pt-BR')))
      name = original.slice(0, -3) + ` (${count++}).ts`;
    usedNames.add(name.toLocaleLowerCase('pt-BR'));
    const data = encoder.encode(file.source);
    return {
      name: encoder.encode(name),
      data,
      crc: crc32(data),
      date: new Date(file.updatedAt),
      offset: 0,
    };
  });
  const size = entries.reduce(
    (sum, entry) => sum + 76 + entry.name.length * 2 + entry.data.length,
    22,
  );
  if (size > 0xffffffff) throw new Error('A biblioteca é grande demais para este formato.');
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  let offset = 0;
  const u16 = (value: number) => {
    view.setUint16(offset, value, true);
    offset += 2;
  };
  const u32 = (value: number) => {
    view.setUint32(offset, value, true);
    offset += 4;
  };
  const append = (value: Uint8Array) => {
    bytes.set(value, offset);
    offset += value.length;
  };
  const metadata = (entry: (typeof entries)[number]) => {
    u16(0x0800); // UTF-8 filenames.
    u16(0); // Stored, without compression.
    u16(
      (entry.date.getHours() << 11) |
        (entry.date.getMinutes() << 5) |
        (entry.date.getSeconds() >> 1),
    );
    u16(
      ((Math.max(1980, Math.min(2107, entry.date.getFullYear())) - 1980) << 9) |
        ((entry.date.getMonth() + 1) << 5) |
        entry.date.getDate(),
    );
    u32(entry.crc);
    u32(entry.data.length);
    u32(entry.data.length);
    u16(entry.name.length);
    u16(0);
  };
  for (const entry of entries) {
    entry.offset = offset;
    u32(0x04034b50);
    u16(20);
    metadata(entry);
    append(entry.name);
    append(entry.data);
  }
  const centralOffset = offset;
  for (const entry of entries) {
    u32(0x02014b50);
    u16(20);
    u16(20);
    metadata(entry);
    u16(0);
    u16(0);
    u16(0);
    u32(0);
    u32(entry.offset);
    append(entry.name);
  }
  const centralSize = offset - centralOffset;
  u32(0x06054b50);
  u16(0);
  u16(0);
  u16(entries.length);
  u16(entries.length);
  u32(centralSize);
  u32(centralOffset);
  u16(0);
  return bytes;
}

export async function exportDownload(
  name: string,
  data: Uint8Array<ArrayBuffer>,
  mimeType: string,
): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    let binary = '';
    for (let offset = 0; offset < data.length; offset += 8192)
      binary += String.fromCharCode(...data.subarray(offset, offset + 8192));
    const result = await NativeFiles.save({ name, mimeType, base64: btoa(binary) });
    return !result.cancelled;
  }
  const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return true;
}

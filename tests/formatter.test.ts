import { describe, expect, test } from 'vitest';
import { formatTypeScript } from '../src/formatter';

describe('TypeScript formatter', () => {
  test('formats TypeScript with the editor indentation', async () => {
    const source = 'const dobro=(valor:number)=>{return valor*2}';
    const result = await formatTypeScript(source, source.indexOf('valor*'));

    expect(result.formatted).toBe(
      'const dobro = (valor: number) => {\n    return valor * 2;\n};\n',
    );
  });

  test('keeps the cursor next to the same expression', async () => {
    const source = 'const resultado=1+2';
    const result = await formatTypeScript(source, source.indexOf('1'));

    expect(result.formatted.slice(result.cursorOffset)).toMatch(/^1 \+ 2/);
  });
});

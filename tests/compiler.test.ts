import { describe, expect, test } from 'vitest';
import { check, compile } from '../src/compiler';
import { formatValue } from '../src/format-value';

describe('offline TypeScript compiler', () => {
  test.each([
    ['console.log("teste";', 1005],
    ['let escritor = 1; console.log(escrito);', 2552],
    ['let escritor = "1"; escritor--;', 2356],
    ['const teste = 1; teste = 2;', 2588],
    ['let teste: number = 1; teste = "2";', 2322],
  ])('checks the editor example %s without running it', (source, code) => {
    const issues = check(source);
    expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ code })]));
    expect(issues).toEqual(compile(source).issues);
    for (const issue of issues) {
      expect(issue.from).toBeGreaterThanOrEqual(0);
      expect(issue.to).toBeLessThanOrEqual(source.length);
      expect(issue.to).toBeGreaterThanOrEqual(issue.from);
    }
  });
  test('checks successive drafts and never executes user code', () => {
    expect(check('let teste: number = "2";')).not.toHaveLength(0);
    expect(check('let teste: number = 2; throw new Error("must not run");')).toEqual([]);
    expect(check('const teste = 1; teste = 2;')).not.toHaveLength(0);
    expect(check('')).toEqual([]);
  });
  test.each(['import {', 'export {', 'function f(', 'const x =', '// comment']) (
    'keeps diagnostics inside an unfinished draft: %s', (source) => {
      for (const issue of check(source)) {
        expect(issue.from).toBeGreaterThanOrEqual(0);
        expect(issue.to).toBeLessThanOrEqual(source.length);
        expect(issue.to).toBeGreaterThanOrEqual(issue.from);
      }
    },
  );
  test('checks standard libraries and removes TypeScript types', () => {
    const result = compile('const values: number[] = [1, 2]; console.log(values.map(n => n * 2));');
    expect(result.ok).toBe(true);
    expect(result.javascript).not.toContain(': number[]');
    expect(result.javascript).toContain('console.log');
  });
  test('reports the actual type error and source position', () => {
    const result = compile('const name: number = "Gabriel";');
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 2322, line: 1, column: 7 })]),
    );
  });
  test('supports worker APIs without suggesting DOM or Node globals', () => {
    expect(compile('setTimeout(() => console.log(new Map<string, number>()), 1);').ok).toBe(true);
    expect(compile('document.body; process.exit();').ok).toBe(false);
  });
  test('rejects module loading with an actionable message', () => {
    const result = compile('import x from "some-package"; console.log(x);');
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes('sem import/export'))).toBe(true);
  });
  test('reports syntax errors instead of running partial output', () => {
    const result = compile('const broken = ;');
    expect(result.ok).toBe(false);
    expect(result.javascript).toBeNull();
  });
  test('supports top-level await and names that collide with worker globals', () => {
    const result = compile('const name = "Gabriel"; await Promise.resolve(); console.log(name);');
    expect(result.ok).toBe(true);
    expect(result.javascript).toContain('await Promise.resolve()');
    expect(result.javascript).not.toContain('export');
  });
});

describe('console values', () => {
  test('preserves undefined, bigint, Map and quoted array strings', () => {
    expect(formatValue([undefined, 12n, 'text'])).toBe('[undefined, 12n, "text"]');
    expect(formatValue(new Map([['a', 1]]))).toBe('Map(1) {"a" => 1}');
  });
  test('distinguishes cycles from repeated references', () => {
    const shared = { n: 1 };
    expect(formatValue([shared, shared])).toBe('[{n: 1}, {n: 1}]');
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    expect(formatValue(cycle)).toBe('{self: [Circular]}');
  });
  test('does not run object getters while logging', () => {
    expect(
      formatValue({
        get surprise() {
          throw new Error('Do not invoke');
        },
      }),
    ).toBe('{surprise: [Getter]}');
  });
});

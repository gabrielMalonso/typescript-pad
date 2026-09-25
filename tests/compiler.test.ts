import { describe, expect, test } from 'vitest';
import { compile } from '../src/compiler';
import { formatValue } from '../src/format-value';

describe('offline TypeScript compiler', () => {
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

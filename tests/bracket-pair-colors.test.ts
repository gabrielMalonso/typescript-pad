import { EditorState } from '@codemirror/state';
import { typescriptLanguage } from '@codemirror/lang-javascript';
import { describe, expect, test } from 'vitest';
import { bracketPairTokens } from '../src/bracket-pair-colors';

const coloredBrackets = (source: string) => {
  const state = EditorState.create({ doc: source, extensions: [typescriptLanguage] });
  return bracketPairTokens(state).map((token) => ({
    bracket: source.slice(token.from, token.to),
    level: token.level,
  }));
};

describe('bracket pair colors', () => {
  test('cycles by nesting depth and keeps both sides of a pair together', () => {
    expect(coloredBrackets('function f(values: number[]) { return [values[0]]; }')).toEqual([
      { bracket: '(', level: 0 },
      { bracket: '[', level: 1 },
      { bracket: ']', level: 1 },
      { bracket: ')', level: 0 },
      { bracket: '{', level: 0 },
      { bracket: '[', level: 1 },
      { bracket: '[', level: 2 },
      { bracket: ']', level: 2 },
      { bracket: ']', level: 1 },
      { bracket: '}', level: 0 },
    ]);
  });

  test('ignores bracket characters inside strings and comments', () => {
    expect(coloredBrackets('const text = "([{}])"; // ]\n')).toEqual([]);
  });
});

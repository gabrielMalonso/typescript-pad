import { EditorState } from '@codemirror/state';
import { describe, expect, test } from 'vitest';
import { indentGuideTokens } from '../src/indent-guides';

describe('indent guides', () => {
  test('draws one guide per indentation level', () => {
    const source = 'if (true) {\n    while (true) {\n        run();\n    }\n}';
    const state = EditorState.create({ doc: source });

    expect(indentGuideTokens(state).map(({ column }) => column)).toEqual([4, 4, 8, 4]);
  });

  test('highlights the current indentation block', () => {
    const source = 'if (true) {\n    while (true) {\n        run();\n        stop();\n    }\n}';
    const cursor = source.indexOf('run');
    const state = EditorState.create({ doc: source, selection: { anchor: cursor } });
    const active = indentGuideTokens(state).filter((token) => token.active);

    expect(active).toHaveLength(2);
    expect(active.every(({ column }) => column === 8)).toBe(true);
  });
});

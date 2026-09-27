import type { EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { Decoration, ViewPlugin } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';

const closingBracket = new Map([
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
]);
const openingBracket = new Map(Array.from(closingBracket, ([open, close]) => [close, open]));

export interface BracketPairToken {
  from: number;
  to: number;
  level: number | null;
}

export const bracketPairTokens = (state: EditorState): BracketPairToken[] => {
  const tokens: BracketPairToken[] = [];
  const stack: Array<{ open: string; level: number; tokenIndex: number }> = [];

  syntaxTree(state).iterate({
    enter(node) {
      if (node.to - node.from !== 1) return;
      const close = closingBracket.get(node.name);
      if (close) {
        const level = stack.length % 6;
        tokens.push({ from: node.from, to: node.to, level });
        stack.push({ open: node.name, level, tokenIndex: tokens.length - 1 });
        return;
      }
      const open = openingBracket.get(node.name);
      if (!open) return;
      const pair = stack.at(-1);
      if (pair?.open === open) {
        stack.pop();
        tokens.push({ from: node.from, to: node.to, level: pair.level });
      } else {
        tokens.push({ from: node.from, to: node.to, level: null });
      }
    },
  });

  for (const unmatched of stack) tokens[unmatched.tokenIndex].level = null;
  return tokens;
};

const decorations = (state: EditorState): DecorationSet =>
  Decoration.set(
    bracketPairTokens(state).map((token) =>
      Decoration.mark({
        class:
          token.level === null ? 'cm-bracket-unexpected' : `cm-bracket-level-${token.level + 1}`,
      }).range(token.from, token.to),
    ),
    true,
  );

export const bracketPairColors = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor({ state }: { state: EditorState }) {
      this.decorations = decorations(state);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = decorations(update.state);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

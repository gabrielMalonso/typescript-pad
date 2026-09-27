import { EditorState } from '@codemirror/state';
import { Decoration, ViewPlugin } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';

export interface IndentGuideToken {
  from: number;
  to: number;
  column: number;
  active: boolean;
}

const indentation = (text: string, tabSize: number) => {
  const guides: Array<{ offset: number; column: number }> = [];
  let column = 0;
  let offset = 0;

  for (const character of text) {
    if (character !== ' ' && character !== '\t') break;
    const width = character === '\t' ? tabSize - (column % tabSize) : 1;
    column += width;
    if (column % tabSize === 0) guides.push({ offset, column });
    offset += character.length;
  }

  return { column, guides };
};

export const indentGuideTokens = (state: EditorState): IndentGuideToken[] => {
  const tabSize = state.facet(EditorState.tabSize);
  const cursorLine = state.doc.lineAt(state.selection.main.head);
  const activeColumn = indentation(cursorLine.text, tabSize).guides.at(-1)?.column;
  let activeFrom = cursorLine.number;
  let activeTo = cursorLine.number;

  if (activeColumn !== undefined) {
    while (activeFrom > 1) {
      const line = state.doc.line(activeFrom - 1);
      const width = indentation(line.text, tabSize).column;
      if (line.text.trim() && width < activeColumn) break;
      activeFrom--;
    }
    while (activeTo < state.doc.lines) {
      const line = state.doc.line(activeTo + 1);
      const width = indentation(line.text, tabSize).column;
      if (line.text.trim() && width < activeColumn) break;
      activeTo++;
    }
  }

  const tokens: IndentGuideToken[] = [];
  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber++) {
    const line = state.doc.line(lineNumber);
    for (const guide of indentation(line.text, tabSize).guides) {
      tokens.push({
        from: line.from + guide.offset,
        to: line.from + guide.offset + 1,
        column: guide.column,
        active:
          guide.column === activeColumn &&
          lineNumber >= activeFrom &&
          lineNumber <= activeTo,
      });
    }
  }
  return tokens;
};

const decorations = (state: EditorState): DecorationSet =>
  Decoration.set(
    indentGuideTokens(state).map((token) =>
      Decoration.mark({
        class: token.active ? 'cm-indent-guide cm-indent-guide-active' : 'cm-indent-guide',
      }).range(token.from, token.to),
    ),
    true,
  );

export const indentGuides = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor({ state }: { state: EditorState }) {
      this.decorations = decorations(state);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = decorations(update.state);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

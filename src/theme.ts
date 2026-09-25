import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-400-italic.css';

// Gabriel's GitHub Dark token colors, kept identical to the customized LiveCodes editor.
export const githubDark = [
  EditorView.theme(
    {
      '&': { height: '100%', color: '#e6edf3', backgroundColor: '#0d1117', fontSize: '14px' },
      '.cm-scroller': {
        fontFamily: '"JetBrains Mono", monospace',
        lineHeight: '1.4',
        overflow: 'auto',
      },
      '.cm-content': { caretColor: '#2f81f7', padding: '12px 0 40px' },
      '.cm-line': { padding: '0 16px 0 10px' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#2f81f7' },
      '&.cm-focused': { outline: 'none' },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: '#2f81f766',
      },
      '.cm-activeLine': { backgroundColor: '#6e76811a' },
      '.cm-gutters': {
        backgroundColor: '#0d1117',
        color: '#6e7681',
        border: 'none',
        paddingLeft: '6px',
      },
      '.cm-activeLineGutter': { backgroundColor: '#6e76811a', color: '#e6edf3' },
      '.cm-tooltip': { backgroundColor: '#161b22', color: '#e6edf3', border: '1px solid #30363d' },
      '.cm-tooltip-autocomplete ul li[aria-selected]': {
        backgroundColor: '#1f6feb',
        color: '#fff',
      },
      '.cm-matchingBracket': { backgroundColor: '#2f81f733', outline: '1px solid #388bfd66' },
      '.cm-panels': { backgroundColor: '#161b22', color: '#e6edf3' },
      '.cm-searchMatch': { backgroundColor: '#d2992240' },
      '.cm-searchMatch-selected': { backgroundColor: '#d2992280' },
    },
    { dark: true },
  ),
  syntaxHighlighting(
    HighlightStyle.define([
      { tag: [t.comment, t.docComment], color: '#6a9955' },
      { tag: [t.string, t.character], color: '#f2cc60' },
      { tag: [t.keyword, t.controlKeyword, t.modifier, t.operatorKeyword], color: '#ff7b72' },
      { tag: [t.variableName, t.name], color: '#e6edf3' },
      { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#d2a8ff' },
      { tag: [t.typeName, t.className, t.standard(t.typeName)], color: '#ffb77a' },
      { tag: [t.number, t.bool, t.null, t.atom], color: '#79c0ff' },
      { tag: [t.propertyName, t.attributeName], color: '#79c0ff' },
      { tag: t.tagName, color: '#7ee787' },
      { tag: t.invalid, color: '#ffa198', fontStyle: 'italic' },
    ]),
  ),
];

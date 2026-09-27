import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-400-italic.css';

// Gabriel's customized GitHub Dark Default colors from VSCodium.
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
      '.cm-tooltip-lint, .cm-tapped-diagnostic': {
        maxWidth: 'min(480px, calc(100vw - 32px))',
        maxHeight: '180px',
        overflow: 'auto',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
      },
      '.cm-tapped-diagnostic': { padding: '8px 12px', borderRadius: '6px' },
      '.cm-tapped-diagnostic p': { margin: '0', padding: '4px 0' },
      '.cm-tooltip-autocomplete ul li[aria-selected]': {
        backgroundColor: '#1f6feb',
        color: '#fff',
      },
      '.cm-matchingBracket': { backgroundColor: '#2f81f733', outline: '1px solid #388bfd66' },
      '.cm-semantic-parameter': { color: '#58a6ff', fontStyle: 'italic' },
      '.cm-bracket-level-1': { color: '#79c0ff' },
      '.cm-bracket-level-2': { color: '#56d364' },
      '.cm-bracket-level-3': { color: '#e3b341' },
      '.cm-bracket-level-4': { color: '#ffa198' },
      '.cm-bracket-level-5': { color: '#ff9bce' },
      '.cm-bracket-level-6': { color: '#d2a8ff' },
      '.cm-bracket-unexpected': { color: '#7d8590' },
      '.cm-indent-guide': { boxShadow: 'inset -1px 0 #e6edf31f' },
      '.cm-indent-guide-active': { boxShadow: 'inset -1px 0 #e6edf33d' },
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
      {
        tag: [t.keyword, t.controlKeyword, t.modifier, t.operator, t.operatorKeyword],
        color: '#ff7b72',
      },
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

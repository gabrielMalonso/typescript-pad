import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { EditorView, ViewPlugin, keymap, showTooltip } from '@codemirror/view';
import type { Tooltip } from '@codemirror/view';
import { forEachDiagnostic, linter, lintKeymap, setDiagnosticsEffect } from '@codemirror/lint';
import { DiagnosticsClient } from './diagnostics-client';

const checker = ViewPlugin.define(() => new DiagnosticsClient());
const showIssue = StateEffect.define<Tooltip | null>();
const tappedIssue = StateField.define<Tooltip | null>({
  create: () => null,
  update(tooltip, transaction) {
    const cursor = transaction.newSelection.main.head;
    const movedOutside = transaction.selection && tooltip &&
      (cursor < tooltip.pos || cursor > (tooltip.end ?? tooltip.pos));
    if (
      transaction.docChanged ||
      movedOutside ||
      transaction.effects.some((effect) => effect.is(setDiagnosticsEffect))
    ) tooltip = null;
    for (const effect of transaction.effects) {
      if (effect.is(showIssue)) tooltip = effect.value;
    }
    return tooltip;
  },
  provide: (field) => showTooltip.from(field),
});

export const liveDiagnostics = [
  checker,
  linter((view) => view.plugin(checker)?.check(view.state.doc.toString()) ?? [], {
    delay: 400,
    tooltipFilter: (diagnostics, state) => state.field(tappedIssue) ? [] : [...diagnostics],
    hideOn: (transaction) => transaction.effects.some((effect) => effect.is(showIssue)) ? true : null,
  }),
  keymap.of(lintKeymap),
  // Remove stale errors in the same transaction as the edit. The linter ignores
  // asynchronous replies whose document no longer matches the checked draft.
  EditorState.transactionExtender.of((transaction) =>
    transaction.docChanged ? { effects: setDiagnosticsEffect.of([]) } : null,
  ),
  tappedIssue,
  EditorView.domEventHandlers({
    click(event, view) {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      const messages: string[] = [];
      let start = pos;
      let end = pos;
      if (pos !== null) {
        forEachDiagnostic(view.state, (diagnostic, from, to) => {
          if (pos >= from && pos <= to) {
            start = Math.min(start ?? from, from);
            end = Math.max(end ?? to, to);
            messages.push(`${diagnostic.message}${diagnostic.source ? ` · ${diagnostic.source}` : ''}`);
          }
        });
      }
      view.dispatch({
        effects: showIssue.of(
          messages.length && start !== null && end !== null
            ? {
                pos: start,
                end,
                above: true,
                create() {
                  const dom = document.createElement('div');
                  dom.className = 'cm-tapped-diagnostic';
                  dom.setAttribute('role', 'tooltip');
                  for (const message of messages) {
                    const row = document.createElement('p');
                    row.textContent = message;
                    dom.append(row);
                  }
                  return { dom };
                },
              }
            : null,
        ),
      });
      return false;
    },
    blur(_event, view) {
      view.dispatch({ effects: showIssue.of(null) });
    },
  }),
  keymap.of([
    {
      key: 'Escape',
      run(view) {
        if (!view.state.field(tappedIssue)) return false;
        view.dispatch({ effects: showIssue.of(null) });
        return true;
      },
    },
  ]),
];

import { EditorState } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, indentUnit } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { setDiagnostics } from '@codemirror/lint';
import { githubDark } from './theme';
import { setupKeyboardToolbar } from './keyboard-toolbar';
import { liveDiagnostics } from './live-diagnostics';
import { toDiagnostics } from './diagnostics-client';
import type { CodeIssue, CompilerReply, CompilerRequest, LogLevel, RunnerReply } from './protocol';
import './style.css';
import { DraftSync } from './draft-sync';
import { setupAccount } from './account';
import { SandboxRunner } from './sandbox-runner';
import { formatTypeScript } from './formatter';

const element = (id: string): HTMLElement => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Elemento ausente: ${id}`);
  return node;
};
const outputPreferenceKey = 'typescript-pad:output-expanded';
let outputExpanded = false;
try {
  outputExpanded = localStorage.getItem(outputPreferenceKey) === 'true';
} catch {
  // Panel visibility still works when local storage is unavailable.
}
let selectedPanel: 'console' | 'js' = 'console';
const initialSource = `// Um espaço para pensar em TypeScript.
const numeros: number[] = [1, 2, 3, 4];

const dobrados = numeros.map((numero) => numero * 2);
console.log(dobrados);
`;
let saveTimer: number | undefined;
let compiler: Worker | undefined;
let runner: SandboxRunner | undefined;
let deadline: number | undefined;
let requestId = 0;
let phase: 'idle' | 'compiling' | 'running' = 'idle';
let lastJavascript = '';
let logCount = 0;
const saveStatus = element('save-status');
const runStatus = element('run-status');
const runButton = element('run');
const consoleView = element('console');
const consolePanel = element('console-panel');
const formatButton = element('format') as HTMLButtonElement;
const playIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg>';
const stopIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1"/></svg>';
const stopButton = document.createElement('button');
stopButton.id = 'stop';
stopButton.className = 'quiet-button icon-button danger-button';
stopButton.innerHTML = stopIcon;
stopButton.title = 'Encerrar execução e tarefas assíncronas';
stopButton.setAttribute('aria-label', stopButton.title);
stopButton.hidden = true;
runButton.before(stopButton);

const setPhase = (next: typeof phase) => {
  phase = next;
  const busy = phase !== 'idle';
  runButton.innerHTML = busy ? stopIcon : playIcon;
  runButton.title = busy ? 'Parar execução' : 'Executar código (Shift + Enter)';
  runButton.setAttribute('aria-label', busy ? 'Parar execução' : 'Executar código');
  stopButton.hidden = !runner || busy;
  toolbar.setBusy(busy);
};
const stopExecution = (label = 'Interrompido') => {
  requestId++;
  if (phase === 'compiling') {
    compiler?.terminate();
    compiler = undefined;
  }
  runner?.terminate();
  runner = undefined;
  window.clearTimeout(deadline);
  setPhase('idle');
  runStatus.textContent = label;
};
const clearConsole = () => {
  consoleView.replaceChildren();
  logCount = 0;
  element('log-count').textContent = '0';
};
const appendLog = (level: LogLevel, text: string, issue?: CodeIssue) => {
  if (logCount >= 501) return;
  if (logCount === 0) consoleView.replaceChildren();
  const nearBottom =
    consolePanel.scrollHeight - consolePanel.scrollTop - consolePanel.clientHeight < 50;
  const row = document.createElement(issue ? 'button' : 'p');
  row.className = `log-row ${level}`;
  row.textContent = text;
  if (issue) {
    row.title = 'Ir para o erro no editor';
    row.addEventListener('click', () => {
      editor.dispatch({
        selection: { anchor: Math.min(issue.from, editor.state.doc.length) },
        scrollIntoView: true,
      });
      editor.focus();
    });
  }
  consoleView.append(row);
  element('log-count').textContent = String(++logCount);
  if (nearBottom) consolePanel.scrollTop = consolePanel.scrollHeight;
};

const renderOutput = () => {
  document.querySelector('.workspace')?.classList.toggle('output-collapsed', !outputExpanded);
  const toggle = element('toggle-output');
  toggle.setAttribute('aria-expanded', String(outputExpanded));
  toggle.title = outputExpanded ? 'Recolher painel' : 'Mostrar painel';
  toggle.setAttribute('aria-label', toggle.title);
  for (const name of ['console', 'js'] as const) {
    element(`${name}-panel`).hidden = !outputExpanded || name !== selectedPanel;
    const tab = element(`${name}-tab`);
    tab.setAttribute('aria-selected', String(name === selectedPanel));
    tab.tabIndex = name === selectedPanel ? 0 : -1;
  }
  element('clear').hidden = !outputExpanded || selectedPanel !== 'console';
  element('copy-js').hidden = !outputExpanded || selectedPanel !== 'js';
  editor.requestMeasure();
  if (outputExpanded && selectedPanel === 'js') javascriptView.requestMeasure();
};
const setOutputExpanded = (expanded: boolean) => {
  outputExpanded = expanded;
  renderOutput();
  try {
    localStorage.setItem(outputPreferenceKey, String(expanded));
  } catch {
    // Keep the user's choice for this session even if it cannot be persisted.
  }
};
const selectPanel = (panel: 'console' | 'js') => {
  selectedPanel = panel;
  renderOutput();
};

const run = () => {
  stopExecution('Compilando…');
  clearConsole();
  selectPanel('console');
  lastJavascript = '';
  javascriptView.dispatch({
    changes: { from: 0, to: javascriptView.state.doc.length, insert: '' },
  });
  const source = editor.state.doc.toString();
  const id = ++requestId;
  setPhase('compiling');
  compiler ??= new Worker(new URL('./compiler.worker.ts', import.meta.url), { type: 'module' });
  compiler.onerror = (event) => {
    if (id !== requestId) return;
    appendLog('error', `Falha ao iniciar o compilador: ${event.message}`);
    stopExecution('Falha no compilador');
  };
  compiler.onmessage = (event: MessageEvent<CompilerReply>) => {
    if (event.data.id !== requestId || id !== requestId) return;
    window.clearTimeout(deadline);
    if (source !== editor.state.doc.toString()) {
      stopExecution('Código alterado. Execute novamente.');
      return;
    }
    if ('error' in event.data) {
      appendLog('error', event.data.error);
      stopExecution('Falha na compilação');
      return;
    }
    const result = event.data.result;
    if (!result.ok) {
      editor.dispatch(setDiagnostics(editor.state, toDiagnostics(result.issues)));
      for (const issue of result.issues)
        appendLog(
          'error',
          `main.ts:${issue.line}:${issue.column}${issue.code ? ` · TS${issue.code}` : ''}\n${issue.message}`,
          issue,
        );
      setPhase('idle');
      runStatus.textContent = `${result.issues.length} erro(s)`;
      return;
    }
    lastJavascript = result.javascript;
    javascriptView.dispatch({
      changes: { from: 0, to: javascriptView.state.doc.length, insert: lastJavascript },
    });
    runner = new SandboxRunner();
    setPhase('running');
    runStatus.textContent = 'Executando…';
    runner.onerror = (error) => {
      if (id !== requestId) return;
      appendLog('error', error.message);
      stopExecution('Erro de execução');
    };
    runner.onmessage = (message: MessageEvent<RunnerReply>) => {
      if (id !== requestId) return;
      const reply = message.data;
      switch (reply.type) {
        case 'log':
          appendLog(reply.level, reply.text);
          break;
        case 'clear':
          clearConsole();
          break;
        case 'error':
          appendLog('error', reply.text);
          stopExecution('Erro de execução');
          break;
        case 'done':
          setPhase('idle');
          runStatus.textContent = `${reply.duration.toFixed(1)} ms`;
          if (!logCount) {
            const empty = document.createElement('p');
            empty.className = 'empty-state';
            empty.textContent = 'Executado sem logs. Use console.log() para mostrar valores.';
            consoleView.append(empty);
          }
          break;
      }
    };
    runner.postMessage({ javascript: lastJavascript });
    // Keep async logs alive for a bounded time. Busy loops never block the UI.
    deadline = window.setTimeout(() => {
      if (phase === 'running') {
        appendLog('warn', 'Execução interrompida após 30 segundos.');
        stopExecution('Limite de tempo');
      } else {
        const label = runStatus.textContent ?? 'Pronto';
        stopExecution(label);
      }
    }, 30_000);
  };
  compiler.postMessage({ id, source, kind: 'compile' } satisfies CompilerRequest);
  deadline = window.setTimeout(() => {
    appendLog('error', 'A compilação excedeu 30 segundos. Tente reduzir o código.');
    stopExecution('Limite de compilação');
  }, 30_000);
};
const runOrStop = () => {
  if (phase === 'idle') run();
  else stopExecution();
};

const syncLabels = {
  local: 'Salvo no dispositivo', pending: 'Aguardando sincronização…', saved: 'Sincronizado',
  conflict: 'Duas versões · revisar', error: 'Salvo aqui · tentar sincronizar',
  'storage-error': 'Não foi possível salvar aqui — copie seu código',
};
const sync = new DraftSync(localStorage, initialSource, () => {
  saveStatus.textContent = syncLabels[sync.status];
  saveStatus.classList.toggle('needs-attention', sync.hasConflict);
  if (editor.state.doc.toString() !== sync.source) {
    stopExecution('Código sincronizado');
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: sync.source } });
  }
});
const save = () => {
  window.clearTimeout(saveTimer);
  sync.edit(editor.state.doc.toString());
  void sync.flush();
};
const editor = new EditorView({
  parent: element('editor'),
  state: EditorState.create({
    doc: sync.source,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      history(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      javascript({ typescript: true }),
      autocompletion(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      indentUnit.of('    '),
      githubDark,
      liveDiagnostics,
      EditorView.contentAttributes.of({
        'aria-label': 'Código TypeScript',
        autocapitalize: 'off',
        autocorrect: 'off',
        spellcheck: 'false',
      }),
      keymap.of([
        {
          key: 'Shift-Enter',
          run: () => {
            runOrStop();
            return true;
          },
        },
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        ...completionKeymap,
        indentWithTab,
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          sync.edit(update.state.doc.toString());
          window.clearTimeout(saveTimer);
          saveTimer = window.setTimeout(save, 750);
        }
        if (update.selectionSet || update.docChanged) {
          const cursor = update.state.selection.main.head;
          const line = update.state.doc.lineAt(cursor);
          element('cursor-position').textContent =
            `Ln ${line.number}, Col ${cursor - line.from + 1}`;
        }
      }),
    ],
  }),
});
const javascriptView = new EditorView({
  parent: element('javascript'),
  extensions: [
    javascript(),
    githubDark,
    lineNumbers(),
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
    EditorView.contentAttributes.of({ 'aria-label': 'JavaScript compilado' }),
  ],
});
let formatFeedbackTimer: number | undefined;
const showFormatFeedback = (state: 'success' | 'error', label: string) => {
  window.clearTimeout(formatFeedbackTimer);
  formatButton.dataset.state = state;
  formatButton.title = label;
  formatButton.setAttribute('aria-label', label);
  formatFeedbackTimer = window.setTimeout(() => {
    delete formatButton.dataset.state;
    formatButton.title = 'Formatar código';
    formatButton.setAttribute('aria-label', 'Formatar código');
  }, 1500);
};
const formatEditor = async () => {
  if (formatButton.disabled) return;
  formatButton.disabled = true;
  formatButton.setAttribute('aria-busy', 'true');
  const source = editor.state.doc.toString();
  try {
    const result = await formatTypeScript(source, editor.state.selection.main.head);
    if (result.formatted !== source) {
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: result.formatted },
        selection: { anchor: result.cursorOffset },
        scrollIntoView: true,
        userEvent: 'input',
      });
    }
    showFormatFeedback(
      'success',
      result.formatted === source ? 'Código já formatado' : 'Código formatado',
    );
  } catch {
    showFormatFeedback('error', 'Não foi possível formatar');
  } finally {
    formatButton.disabled = false;
    formatButton.removeAttribute('aria-busy');
    editor.focus();
  }
};
const toolbar = setupKeyboardToolbar(element('keyboard-toolbar'), editor, runOrStop, () => {
  void formatEditor();
});
renderOutput();
element('toggle-output').addEventListener('pointerdown', (event) => {
  if (editor.hasFocus) event.preventDefault();
});
element('toggle-output').addEventListener('click', () => setOutputExpanded(!outputExpanded));
saveStatus.textContent = syncLabels[sync.status];
setupAccount(sync);
runButton.addEventListener('click', runOrStop);
stopButton.addEventListener('click', () => stopExecution());
formatButton.addEventListener('pointerdown', (event) => {
  if (editor.hasFocus) event.preventDefault();
});
formatButton.addEventListener('click', () => {
  void formatEditor();
});
element('clear').addEventListener('click', clearConsole);
for (const name of ['console', 'js'] as const) {
  const tab = element(`${name}-tab`);
  tab.addEventListener('click', () => {
    selectPanel(name);
    setOutputExpanded(true);
  });
  tab.addEventListener('keydown', (event) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next =
        event.key === 'Home'
          ? 'console'
          : event.key === 'End'
            ? 'js'
            : name === 'console'
              ? 'js'
              : 'console';
      selectPanel(next);
      setOutputExpanded(true);
      element(`${next}-tab`).focus();
    }
  });
}
const copy = async (button: HTMLElement, content: string) => {
  const label = button.textContent;
  const title = button.title;
  const ariaLabel = button.getAttribute('aria-label');
  try {
    await navigator.clipboard.writeText(content);
    if (button.classList.contains('icon-button')) {
      button.dataset.state = 'success';
      button.title = 'Copiado!';
      button.setAttribute('aria-label', 'Copiado!');
    } else button.textContent = 'Copiado!';
  } catch {
    if (button.classList.contains('icon-button')) {
      button.dataset.state = 'error';
      button.title = 'Falha ao copiar';
      button.setAttribute('aria-label', 'Falha ao copiar');
    } else button.textContent = 'Falha ao copiar';
  }
  window.setTimeout(() => {
    if (button.classList.contains('icon-button')) {
      delete button.dataset.state;
      button.title = title;
      if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
    } else button.textContent = label;
  }, 1500);
};
element('copy').addEventListener('click', () => {
  void copy(element('copy'), editor.state.doc.toString());
});
element('copy-js').addEventListener('click', () => {
  void copy(element('copy-js'), lastJavascript);
});
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    save();
    if (runner || phase !== 'idle') stopExecution();
  }
});

const conflictDialog = document.querySelector<HTMLDialogElement>('#conflict-dialog')!;
const localVersion = document.querySelector<HTMLTextAreaElement>('#local-version')!;
const cloudVersion = document.querySelector<HTMLTextAreaElement>('#cloud-version')!;
let reviewedRevision: number | undefined;
saveStatus.addEventListener('click', () => {
  if (!sync.hasConflict) { void sync.flush(); return; }
  localVersion.value = sync.source;
  cloudVersion.value = sync.cloud?.source ?? '';
  reviewedRevision = sync.cloud?.revision;
  conflictDialog.showModal();
});
for (const choice of ['local', 'cloud'] as const) {
  element('keep-' + choice).addEventListener('click', () => {
    sync.resolve(choice, reviewedRevision);
    if (!sync.hasConflict) { conflictDialog.close(); void sync.flush(); }
    else if (reviewedRevision !== sync.cloud?.revision) {
      cloudVersion.value = sync.cloud?.source ?? '';
      reviewedRevision = sync.cloud?.revision;
      element('conflict-title').textContent = 'A versão da nuvem mudou. Revise novamente.';
    }
  });
}
element('close-conflict').addEventListener('click', () => conflictDialog.close());
element('export-recoveries').addEventListener('click', () => {
  const copies: unknown[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('typescript-pad:recovery:')) copies.push(JSON.parse(localStorage.getItem(key)!));
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(copies, null, 2)], { type: 'application/json' }));
  link.download = 'typescript-pad-recuperacoes.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

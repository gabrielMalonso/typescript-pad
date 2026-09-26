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

const element = (id: string): HTMLElement => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Elemento ausente: ${id}`);
  return node;
};
const storageKey = 'typescript-pad:source';
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
let storageAvailable = true;
const loadSource = () => {
  try {
    return localStorage.getItem(storageKey) ?? initialSource;
  } catch {
    storageAvailable = false;
    return initialSource;
  }
};
let saveTimer: number | undefined;
let compiler: Worker | undefined;
let runner: Worker | undefined;
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
const stopButton = document.createElement('button');
stopButton.id = 'stop';
stopButton.className = 'quiet-button';
stopButton.textContent = 'Parar';
stopButton.title = 'Encerrar execução e tarefas assíncronas';
stopButton.hidden = true;
runButton.before(stopButton);

const setPhase = (next: typeof phase) => {
  phase = next;
  const busy = phase !== 'idle';
  runButton.innerHTML = busy
    ? '<span aria-hidden="true">□</span> Parar'
    : '<span aria-hidden="true">▷</span> Run';
  runButton.title = busy ? 'Parar execução' : 'Executar código (Shift + Enter)';
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
    runner = new Worker(new URL('./runner.worker.ts', import.meta.url), { type: 'module' });
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

const save = () => {
  window.clearTimeout(saveTimer);
  try {
    localStorage.setItem(storageKey, editor.state.doc.toString());
    storageAvailable = true;
    saveStatus.textContent = 'Salvo no dispositivo';
  } catch {
    storageAvailable = false;
    saveStatus.textContent = 'Não foi possível salvar — copie seu código';
  }
};
const editor = new EditorView({
  parent: element('editor'),
  state: EditorState.create({
    doc: loadSource(),
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
          saveStatus.textContent = 'Salvando…';
          window.clearTimeout(saveTimer);
          saveTimer = window.setTimeout(save, 250);
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
const toolbar = setupKeyboardToolbar(element('keyboard-toolbar'), editor, runOrStop);
renderOutput();
element('toggle-output').addEventListener('pointerdown', (event) => {
  if (editor.hasFocus) event.preventDefault();
});
element('toggle-output').addEventListener('click', () => setOutputExpanded(!outputExpanded));
if (!storageAvailable) saveStatus.textContent = 'Armazenamento indisponível — copie seu código';
runButton.addEventListener('click', runOrStop);
stopButton.addEventListener('click', () => stopExecution());
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
  try {
    await navigator.clipboard.writeText(content);
    button.textContent = 'Copiado!';
  } catch {
    button.textContent = 'Falha ao copiar';
  }
  window.setTimeout(() => {
    button.textContent = label;
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

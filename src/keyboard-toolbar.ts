import { indentLess, indentMore } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';
import { Capacitor } from '@capacitor/core';

declare global {
  interface Window {
    typescriptPadKeyboardVisible?: boolean;
  }
}

export const keyGroups = [
  ['=', '=>', '<', '>', '"', '`', ':', ';'],
  ['!', '&', '|', '{', '}', '[', ']'],
];

export const setupKeyboardToolbar = (
  toolbar: HTMLElement,
  editor: EditorView,
  runOrStop: () => void,
) => {
  let keyboardVisible = window.typescriptPadKeyboardVisible === true;
  let columns = 0;
  let pageIndex = 0;
  const makeKey = (label: string, action: () => void, title = label) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.addEventListener('click', action);
    return button;
  };
  const fixed = document.createElement('div');
  fixed.className = 'keyboard-fixed';
  const play = makeKey('▷', runOrStop, 'Executar código');
  play.className = 'keyboard-run';
  fixed.append(
    makeKey(
      'Tab',
      () => {
        indentMore(editor);
        editor.focus();
      },
      'Indentar',
    ),
    makeKey(
      '⇧ Tab',
      () => {
        indentLess(editor);
        editor.focus();
      },
      'Desindentar',
    ),
    play,
  );
  const pager = document.createElement('div');
  pager.className = 'keyboard-pager';
  const pages = document.createElement('div');
  pages.className = 'keyboard-pages';
  const dots = document.createElement('div');
  dots.className = 'keyboard-dots';
  pager.append(pages, dots);
  toolbar.append(fixed, pager);
  const updateDots = () => {
    if (!pages.clientWidth) return;
    pageIndex = Math.round(pages.scrollLeft / pages.clientWidth);
    Array.from(dots.children).forEach((dot, index) =>
      dot.setAttribute('aria-pressed', String(index === pageIndex)),
    );
  };
  const layout = () => {
    const width = pages.clientWidth;
    if (!width) return;
    const nextColumns = Math.max(1, Math.floor((width + 4) / 48));
    if (nextColumns !== columns) {
      columns = nextColumns;
      pages.replaceChildren();
      dots.replaceChildren();
      const groups = keyGroups.flatMap((group) => {
        const count = Math.ceil(group.length / columns);
        const size = Math.ceil(group.length / count);
        return Array.from({ length: count }, (_, index) =>
          group.slice(index * size, (index + 1) * size),
        );
      });
      groups.forEach((group, index) => {
        const page = document.createElement('div');
        page.className = 'keyboard-page';
        group.forEach((key) =>
          page.append(
            makeKey(key, () => {
              editor.dispatch(editor.state.replaceSelection(key), {
                scrollIntoView: true,
                userEvent: 'input.type',
              });
              editor.focus();
            }),
          ),
        );
        pages.append(page);
        dots.append(
          makeKey(
            '',
            () => {
              pageIndex = index;
              pages.scrollTo({ left: index * pages.clientWidth });
              updateDots();
            },
            `Página ${index + 1} de ${groups.length}`,
          ),
        );
      });
      pageIndex = Math.min(pageIndex, groups.length - 1);
    }
    pages.scrollLeft = pageIndex * width;
    updateDots();
  };
  const sync = () => {
    toolbar.hidden = !keyboardVisible || !editor.hasFocus;
    document.body.classList.toggle('keyboard-open', !toolbar.hidden);
    if (!toolbar.hidden) layout();
  };
  window.addEventListener('typescript-pad-keyboard', (event) => {
    if (event instanceof CustomEvent && typeof event.detail === 'boolean') {
      keyboardVisible = event.detail;
      sync();
    }
  });
  document.addEventListener('focusin', sync);
  document.addEventListener('focusout', () => queueMicrotask(sync));
  if (!Capacitor.isNativePlatform()) {
    window.visualViewport?.addEventListener('resize', () => {
      keyboardVisible =
        window.innerHeight - (window.visualViewport?.height ?? window.innerHeight) > 150;
      sync();
    });
  }
  // Keep the editor's selection and the Android IME while allowing horizontal swipes.
  toolbar.addEventListener('pointerdown', (event) => event.preventDefault());
  pages.addEventListener('scroll', updateDots, { passive: true });
  new ResizeObserver(layout).observe(pages);
  sync();
  return {
    setBusy: (busy: boolean) => {
      play.textContent = busy ? '□' : '▷';
      play.title = busy ? 'Parar execução' : 'Executar código';
      play.setAttribute('aria-label', play.title);
    },
  };
};

import './sidebar.css';

type SidebarTab = 'console' | 'saved';

/** Owns visibility and tab selection; both panels stay mounted with their own state. */
export function setupSidebar(layoutChanged: () => void) {
  const get = (id: string) => {
    const node = document.getElementById(id);
    if (!node) throw new Error(`Elemento ausente: ${id}`);
    return node;
  };
  const workspace = document.querySelector<HTMLElement>('.workspace')!;
  const editor = document.querySelector<HTMLElement>('.editor-pane')!;
  const sidebar = get('sidebar');
  const toggle = get('toggle-sidebar');
  const backdrop = get('sidebar-backdrop');
  const actions = get('file-actions');
  const narrow = matchMedia('(max-width: 840px)');
  const tabs = {
    console: { button: get('tab-console'), panel: get('console-panel') },
    saved: { button: get('tab-saved'), panel: get('study-library') },
  } satisfies Record<SidebarTab, { button: HTMLElement; panel: HTMLElement }>;
  const tabNames: SidebarTab[] = ['console', 'saved'];
  let expanded = false;
  let selected: SidebarTab = 'console';
  try {
    expanded =
      (localStorage.getItem('typescript-pad:sidebar-expanded') ??
        localStorage.getItem('typescript-pad:output-expanded')) === 'true';
    if (localStorage.getItem('typescript-pad:sidebar-tab') === 'saved') selected = 'saved';
  } catch {
    // The panel also works when preferences cannot be read.
  }

  const render = () => {
    workspace.classList.toggle('sidebar-collapsed', !expanded);
    sidebar.inert = !expanded;
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.title = expanded ? 'Recolher painel lateral' : 'Mostrar painel lateral';
    toggle.setAttribute('aria-label', toggle.title);
    backdrop.hidden = !expanded || !narrow.matches;
    editor.inert = expanded && narrow.matches;
    get('keyboard-toolbar').inert = expanded && narrow.matches;
    for (const name of tabNames) {
      const active = name === selected;
      tabs[name].button.setAttribute('aria-selected', String(active));
      tabs[name].button.tabIndex = active ? 0 : -1;
      tabs[name].panel.hidden = !active;
    }
    get('clear').hidden = selected !== 'console';
    get('toggle-search').hidden = selected !== 'saved';
    layoutChanged();
  };
  const persist = () => {
    try {
      localStorage.setItem('typescript-pad:sidebar-expanded', String(expanded));
      localStorage.setItem('typescript-pad:sidebar-tab', selected);
    } catch {
      // Keep this session's selection even if storage is unavailable.
    }
  };
  const setExpanded = (open: boolean) => {
    if (!open) actions.hidePopover();
    const hadFocus = sidebar.contains(document.activeElement);
    expanded = open;
    render();
    persist();
    if (!open && hadFocus) toggle.focus();
    // The tab is still sliding into view; focus must not scroll the workspace.
    if (open && narrow.matches) tabs[selected].button.focus({ preventScroll: true });
  };
  const select = (name: SidebarTab) => {
    actions.hidePopover();
    selected = name;
    render();
    persist();
  };
  for (const name of tabNames) {
    const button = tabs[name].button;
    button.addEventListener('click', () => select(name));
    button.addEventListener('keydown', (event) => {
      let next: SidebarTab;
      if (event.key === 'Home') next = 'console';
      else if (event.key === 'End') next = 'saved';
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
        next = name === 'console' ? 'saved' : 'console';
      else return;
      event.preventDefault();
      select(next);
      tabs[next].button.focus({ preventScroll: true });
    });
  }
  toggle.addEventListener('click', () => setExpanded(!expanded));
  backdrop.addEventListener('click', () => setExpanded(false));
  const dismiss = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !expanded || actions.matches(':popover-open')) return;
    event.preventDefault();
    event.stopPropagation();
    setExpanded(false);
  };
  sidebar.addEventListener('keydown', dismiss);
  toggle.addEventListener('keydown', dismiss);
  narrow.addEventListener('change', () => {
    const moveFocus = expanded && narrow.matches && editor.contains(document.activeElement);
    render();
    if (moveFocus) tabs[selected].button.focus({ preventScroll: true });
  });
  render();
  return {
    closeOnNarrowScreen() {
      if (narrow.matches) setExpanded(false);
    },
  };
}

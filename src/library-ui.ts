import { StudyLibrary, selectFiles, type FileOrder, type StudyFile } from './study-library';
import { downloadName, exportDownload, studyArchive } from './export-files';
import { LibrarySync, type LibraryStatus } from './library-sync';
import './library.css';

type EditorBridge = {
  source: () => string;
  replace: (source: string, focus?: boolean) => void;
  statusChanged: () => void;
};
const date = new Intl.DateTimeFormat('pt-BR', {
  year: 'numeric',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function setupStudyLibrary(editor: EditorBridge) {
  const library = new StudyLibrary(() => localStorage, editor.source());
  const get = <T extends HTMLElement>(id: string) => {
    const node = document.getElementById(id);
    if (!node) throw new Error(`Elemento ausente: ${id}`);
    return node as T;
  };
  const panel = get<HTMLElement>('study-library');
  const toggle = get<HTMLButtonElement>('toggle-library');
  const backdrop = get<HTMLButtonElement>('library-backdrop');
  const list = get<HTMLElement>('file-list');
  const search = get<HTMLInputElement>('file-search');
  const order = get<HTMLSelectElement>('file-order');
  const searchToggle = get<HTMLButtonElement>('toggle-search');
  const searchField = get<HTMLElement>('library-search');
  const dialog = get<HTMLDialogElement>('name-dialog');
  const name = get<HTMLInputElement>('study-name');
  const warning = get<HTMLElement>('library-warning');
  const notice = get<HTMLElement>('library-notice');
  const exportAll = get<HTMLButtonElement>('export-all');
  const actions = get<HTMLElement>('file-actions');
  const deleteDialog = get<HTMLDialogElement>('delete-dialog');
  let actionFile: StudyFile | null = null;
  let namingId: string | null = null;
  let deletingId: string | null = null;
  const narrow = matchMedia('(max-width: 840px)');
  let failed = false;
  let noticeTimer: number | undefined;
  let listTimer: number | undefined;
  const syncLabels: Record<LibraryStatus, string> = {
    local: 'Salvos neste dispositivo. Entre na sua conta para sincronizar.',
    pending: 'Salvos aqui · sincronização pendente…',
    saved: 'Biblioteca sincronizada com sua conta.',
    error: 'Salvos aqui · não foi possível sincronizar. Tente novamente pela sua conta.',
    'storage-error':
      'Não foi possível guardar todos os arquivos aqui. Exporte uma cópia dos seus códigos.',
  };
  const sync = new LibrarySync(
    library,
    ({ filesChanged, conflict, sourceChange }) => {
      get('library-sync-status').textContent = syncLabels[sync.status];
      get('library-sync-status').hidden =
        sync.status !== 'error' && sync.status !== 'storage-error';
      get('library-sync-status').classList.toggle(
        'needs-attention',
        sync.status === 'error' || sync.status === 'storage-error',
      );
      if (filesChanged) {
        if (sourceChange && editor.source() === sourceChange.previous)
          editor.replace(sourceChange.next, false);
        renderIdentity();
        renderList();
      }
      if (conflict)
        inform(
          'Este estudo mudou nos dois dispositivos. Guardamos sua versão em uma cópia “(conflito)”.',
        );
      editor.statusChanged();
    },
    editor.source,
  );

  const inform = (message: string) => {
    clearTimeout(noticeTimer);
    notice.textContent = message;
    notice.hidden = false;
    noticeTimer = window.setTimeout(() => {
      notice.hidden = true;
    }, 4500);
  };
  const reportFailure = () => {
    failed = true;
    editor.statusChanged();
    inform('Não foi possível guardar o arquivo. Seu código continua no editor; exporte uma cópia.');
  };
  const renderIdentity = () => {
    get('current-file-name').textContent = library.active
      ? `${library.active.name}.ts`
      : 'Rascunho';
    get('file-name').title = library.active ? 'Renomear código' : 'Dar um nome ao código';
    get('file-name').setAttribute(
      'aria-label',
      library.active ? `Renomear ${library.active.name}` : 'Dar um nome ao código',
    );
  };
  const renderList = () => {
    clearTimeout(listTimer);
    try {
      const files = library.list();
      exportAll.disabled = files.length === 0;
      warning.hidden = library.unreadableFiles === 0;
      warning.textContent =
        'Há arquivos que não puderam ser lidos. Os dados originais foram preservados.';
      const selectedOrder: FileOrder =
        order.value === 'name' || order.value === 'oldest' ? order.value : 'recent';
      const visible = selectFiles(files, search.value, selectedOrder);
      actions.hidePopover();
      list.replaceChildren();
      if (!visible.length) {
        const empty = document.createElement('div');
        empty.className = 'library-empty';
        empty.innerHTML = files.length
          ? '<strong>Nenhum resultado</strong>'
          : '<strong>Nenhum código salvo</strong>';
        list.append(empty);
      }
      for (const file of visible) {
        const row = document.createElement('div');
        row.className = 'study-row';
        row.classList.toggle('is-current', file.id === library.active?.id);
        const open = document.createElement('button');
        open.className = 'study-open';
        open.setAttribute('aria-current', String(file.id === library.active?.id));
        open.title = `${file.name}.ts\nCriado em ${date.format(file.createdAt)}\nAlterado em ${date.format(file.updatedAt)}`;
        const icon = document.createElement('span');
        icon.className = 'study-icon';
        icon.textContent = 'TS';
        icon.setAttribute('aria-hidden', 'true');
        const info = document.createElement('span');
        info.className = 'study-info';
        const title = document.createElement('span');
        title.className = 'study-title';
        title.textContent = file.name;
        const meta = document.createElement('span');
        meta.className = 'study-meta';
        const lines = file.source.split('\n').length;
        meta.textContent = `${date.format(selectedOrder === 'oldest' ? file.createdAt : file.updatedAt)} · ${lines} ${lines === 1 ? 'linha' : 'linhas'}`;
        info.append(title, meta);
        open.append(icon, info);
        open.addEventListener('click', () => {
          if (file.id === library.active?.id) {
            if (narrow.matches) setOpen(false);
            return;
          }
          try {
            library.preserve(editor.source());
            const opened = library.open(file.id);
            editor.replace(opened.source);
            failed = false;
            renderIdentity();
            renderList();
            editor.statusChanged();
            if (narrow.matches) setOpen(false);
          } catch {
            reportFailure();
          }
        });
        const more = document.createElement('button');
        more.className = 'console-button icon-button study-more';
        more.title = 'Ações do código';
        more.setAttribute('aria-label', `Ações de ${file.name}`);
        more.setAttribute('aria-controls', 'file-actions');
        more.innerHTML =
          '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>';
        more.addEventListener('click', () => {
          actionFile = file;
          actions.showPopover();
          const rect = more.getBoundingClientRect();
          actions.style.left = `${Math.max(8, Math.min(rect.right - actions.offsetWidth, innerWidth - actions.offsetWidth - 8))}px`;
          actions.style.top = `${Math.min(rect.bottom + 4, innerHeight - actions.offsetHeight - 8)}px`;
          get('rename-file').focus();
        });
        row.append(open, more);
        list.append(row);
      }
    } catch {
      warning.hidden = false;
      warning.textContent =
        'Não foi possível acessar os arquivos neste dispositivo. Exporte o código aberto para guardar uma cópia.';
    }
  };
  const setOpen = (open: boolean) => {
    if (!open) actions.hidePopover();
    panel.hidden = !open;
    backdrop.hidden = !open || !narrow.matches;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) renderList();
    // The folder button stays available while the narrow drawer covers the editor.
    const overlay = open && narrow.matches;
    document.querySelector<HTMLElement>('.workspace')!.inert = overlay;
    document.querySelector<HTMLElement>('.header-actions')!.inert = overlay;
    document.querySelector<HTMLElement>('.status-bar')!.inert = overlay;
    get('keyboard-toolbar').inert = overlay;
    if (overlay) searchToggle.focus();
    if (!open) toggle.focus();
  };
  toggle.addEventListener('click', () => setOpen(Boolean(panel.hidden)));
  backdrop.addEventListener('click', () => setOpen(false));
  narrow.addEventListener('change', () => setOpen(!panel.hidden));
  const handleDrawerKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !panel.hidden && !actions.matches(':popover-open')) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  };
  panel.addEventListener('keydown', handleDrawerKey);
  toggle.addEventListener('keydown', handleDrawerKey);
  const setSearchOpen = (open: boolean) => {
    searchField.hidden = !open;
    searchToggle.setAttribute('aria-expanded', String(open));
    if (open) search.focus();
    else {
      search.value = '';
      renderList();
      searchToggle.focus();
    }
  };
  searchToggle.addEventListener('click', () => setSearchOpen(Boolean(searchField.hidden)));
  search.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    event.preventDefault();
    setSearchOpen(false);
  });
  search.addEventListener('input', renderList);
  order.addEventListener('change', renderList);
  window.addEventListener('storage', (event) => {
    if (event.key?.startsWith('typescript-pad:file:')) {
      try {
        const active = library.active;
        if (active && library.read(active.id)?.deletedAt !== undefined) {
          if (editor.source() !== active.source) library.save(editor.source());
          else {
            library.detach();
            editor.replace('', false);
          }
          renderIdentity();
          editor.statusChanged();
        }
      } catch {
        reportFailure();
      }
      renderList();
      void sync.flush();
    }
  });

  get('new-file').addEventListener('click', () => {
    try {
      const unnamed = !library.active && Boolean(editor.source().trim());
      library.preserve(editor.source());
      library.detach();
      editor.replace('');
      failed = false;
      search.value = '';
      renderIdentity();
      renderList();
      editor.statusChanged();
      if (narrow.matches) setOpen(false);
      if (unnamed)
        inform('O código anterior foi guardado como “Sem título”. Você pode renomeá-lo depois.');
    } catch {
      reportFailure();
    }
  });
  const showName = (file = library.active) => {
    namingId = file?.id ?? null;
    get('name-dialog-title').textContent = file ? 'Renomear código' : 'Salvar código';
    name.value = file?.name ?? '';
    get('name-error').hidden = true;
    dialog.showModal();
    name.focus();
    name.select();
  };
  const save = () => {
    if (!library.active) {
      showName();
      return;
    }
    try {
      library.save(editor.source());
      failed = false;
      renderIdentity();
      renderList();
      editor.statusChanged();
      inform('Código salvo.');
    } catch {
      reportFailure();
    }
  };
  get('file-name').addEventListener('click', () => showName());
  get('save-file').addEventListener('click', save);
  get('cancel-name-secondary').addEventListener('click', () => dialog.close());
  get('name-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (!name.value.trim()) {
      name.setCustomValidity('Digite um nome para o código.');
      name.reportValidity();
      return;
    }
    try {
      if (namingId && namingId !== library.active?.id) library.rename(namingId, name.value);
      else library.save(editor.source(), name.value);
      failed = false;
      dialog.close();
      renderIdentity();
      renderList();
      editor.statusChanged();
      inform('Código salvo.');
    } catch {
      get('name-error').textContent =
        'Não foi possível salvar. Seu código continua no editor; exporte uma cópia.';
      get('name-error').hidden = false;
      failed = true;
      editor.statusChanged();
    }
  });
  get('rename-file').addEventListener('click', () => {
    actions.hidePopover();
    if (actionFile) showName(actionFile);
  });
  get('delete-file').addEventListener('click', () => {
    actions.hidePopover();
    if (!actionFile) return;
    deletingId = actionFile.id;
    get('delete-description').textContent = `Excluir “${actionFile.name}.ts”?`;
    get('delete-error').hidden = true;
    deleteDialog.showModal();
  });
  get('cancel-delete').addEventListener('click', () => deleteDialog.close());
  get('delete-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (!deletingId) return;
    try {
      const active = deletingId === library.active?.id;
      library.delete(deletingId);
      if (active) editor.replace('');
      failed = false;
      deleteDialog.close();
      renderIdentity();
      renderList();
      editor.statusChanged();
      get('new-file').focus();
      inform('Código excluído.');
    } catch {
      get('delete-error').textContent = 'Não foi possível excluir. Tente novamente.';
      get('delete-error').hidden = false;
    }
  });
  name.addEventListener('input', () => name.setCustomValidity(''));
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (!dialog.open && !deleteDialog.open) save();
    }
  });
  const download = async (all: boolean) => {
    const button = all ? exportAll : get<HTMLButtonElement>('export-file');
    button.disabled = true;
    try {
      let success: boolean;
      if (all) {
        const files = selectFiles(library.exportFiles(editor.source()), '', 'oldest');
        success = await exportDownload(
          'typescript-pad-estudos.zip',
          studyArchive(files),
          'application/zip',
        );
        renderIdentity();
      } else {
        const file = library.active ?? { name: 'Sem título', createdAt: Date.now() };
        success = await exportDownload(
          downloadName(file),
          new TextEncoder().encode(editor.source()),
          'text/plain',
        );
      }
      if (success) inform('Exportação enviada para salvar no dispositivo.');
    } catch {
      inform('Não foi possível exportar. Tente novamente; seus códigos continuam aqui.');
    } finally {
      button.disabled = false;
      renderList();
    }
  };
  get('export-file').addEventListener('click', () => {
    void download(false);
  });
  exportAll.addEventListener('click', () => {
    void download(true);
  });
  renderIdentity();
  renderList();
  setOpen(!narrow.matches);
  return {
    sync,
    get hasActiveFile() {
      return library.active !== null;
    },
    get failed() {
      return failed;
    },
    detach() {
      library.detach();
      failed = false;
      renderIdentity();
      renderList();
      editor.statusChanged();
    },
    edit(source: string) {
      if (!library.active) return;
      try {
        const id = library.active.id;
        library.save(source);
        if (library.active.id !== id)
          inform('Este estudo mudou em outra aba. Suas alterações foram guardadas em uma cópia.');
        failed = false;
        renderIdentity();
        clearTimeout(listTimer);
        listTimer = window.setTimeout(renderList, 500);
      } catch {
        failed = true;
      }
      editor.statusChanged();
    },
  };
}

import { Capacitor, registerPlugin } from '@capacitor/core';
import { ConvexClient } from 'convex/browser';
import { padApi, type Account, type Credentials } from './cloud-api';
import type { DraftSync } from './draft-sync';

const NativeAccount = registerPlugin<{
  read(): Promise<{ token: string | null }>;
  write(options: { token: string | null }): Promise<void>;
  open(options: { url: string }): Promise<void>;
}>('PadAccount');
const native = Capacitor.isNativePlatform();
const convexUrl: string | undefined = import.meta.env.VITE_CONVEX_URL;
const courseUrl: string | undefined = import.meta.env.VITE_COURSE_URL;

export function setupAccount(sync: DraftSync) {
  const button = document.querySelector<HTMLButtonElement>('#account-button')!;
  const panel = document.querySelector<HTMLElement>('#account-panel')!;
  const title = document.querySelector<HTMLElement>('#account-name')!;
  const message = document.querySelector<HTMLElement>('#account-message')!;
  const action = document.querySelector<HTMLButtonElement>('#account-action')!;
  const retry = document.querySelector<HTMLButtonElement>('#sync-retry')!;
  const devicesLink = document.querySelector<HTMLAnchorElement>('#account-devices')!;
  let client: ConvexClient | undefined;
  let account: Account | null = null;
  let token: string | undefined;
  let unsubscribeSession: (() => void) | undefined;
  let unsubscribeDraft: (() => void) | undefined;
  let pairing = false;
  let pairingCode = '';
  let pairingTimer: ReturnType<typeof setTimeout> | undefined;
  let sessionRequest: Promise<string | null> | undefined;

  const render = () => {
    button.classList.toggle('has-account', Boolean(account));
    button.setAttribute('aria-label', account ? `Perfil de ${account.name}` : 'Entrar para sincronizar');
    button.title = account ? `Perfil de ${account.name}` : 'Entrar para sincronizar';
    title.textContent = account?.name ?? 'Seu código, em qualquer tela';
    message.textContent = account ? 'Rascunho conectado à sua conta.' : 'Entre para continuar no computador ou no tablet. Sem conta, seu código fica neste dispositivo.';
    if (pairing) message.textContent = `Confirme o código ${pairingCode} no navegador e volte ao aplicativo.`;
    action.textContent = account ? 'Sair deste dispositivo' : pairing ? 'Cancelar entrada' : 'Entrar e sincronizar';
    retry.hidden = !account;
    devicesLink.hidden = !account;
    devicesLink.href = native ? `${courseUrl}/pad/dispositivos` : '/pad/dispositivos';
  };
  const closePanel = () => { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); };
  button.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    button.setAttribute('aria-expanded', String(!panel.hidden));
  });
  document.addEventListener('pointerdown', event => {
    if (event.target instanceof Node && !panel.contains(event.target) && !button.contains(event.target)) closePanel();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { closePanel(); button.focus(); } });
  if (native) devicesLink.addEventListener('click', event => {
    event.preventDefault();
    void NativeAccount.open({ url: devicesLink.href }).catch(() => { message.textContent = 'Não foi possível abrir o navegador.'; });
  });
  const showError = () => { message.textContent = 'Não foi possível conectar. Seu código continua disponível neste dispositivo.'; };
  const credentials = (): Credentials => token ? { deviceToken: token } : {};
  const accept = (next: Account | null) => {
    if (next?.owner === account?.owner && account && next) return;
    unsubscribeDraft?.();
    unsubscribeDraft = undefined;
    account = next;
    if (!next || !client) { sync.disconnect(); render(); return; }
    pairing = false;
    clearTimeout(pairingTimer);
    const connection = client;
    const auth = credentials();
    sync.connect(next.owner, args => connection.mutation(padApi.save, { ...args, ...auth }));
    unsubscribeDraft = connection.onUpdate(padApi.get, auth, draft => {
      sync.receive(draft);
      void sync.flush();
    }, () => { showError(); });
    render();
  };
  const watchSession = () => {
    unsubscribeSession?.();
    unsubscribeSession = client?.onUpdate(padApi.session, credentials(), accept, () => { accept(null); showError(); });
  };
  const fetchWebToken = async (): Promise<string | null> => {
    if (sessionRequest) return sessionRequest;
    sessionRequest = (async () => {
      const response = await fetch('/auth/sessao?refresh=1', { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
      if (response.status === 401) { accept(null); return null; }
      if (!response.ok) throw new Error('Session unavailable');
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object' || !('accessToken' in data) || typeof data.accessToken !== 'string') throw new Error('Invalid session');
      return data.accessToken;
    })();
    try { return await sessionRequest; }
    finally { sessionRequest = undefined; }
  };
  const initialize = async () => {
    if (!convexUrl || (native && !courseUrl)) return;
    client = new ConvexClient(convexUrl);
    if (native) {
      token = (await NativeAccount.read()).token ?? undefined;
      if (token) watchSession();
    } else {
      const initial = await fetchWebToken();
      if (initial) client.setAuth(async () => {
        try { return await fetchWebToken(); } catch { showError(); return null; }
      }, authenticated => { if (authenticated) watchSession(); else accept(null); });
    }
  };
  action.addEventListener('click', () => { void (async () => {
    action.disabled = true;
    try {
      if (account || pairing) {
        clearTimeout(pairingTimer);
        unsubscribeSession?.();
        unsubscribeSession = undefined;
        if (native) {
          const previous = token;
          // Local sign-out works offline; the owner can also revoke devices from the course.
          await NativeAccount.write({ token: null });
          token = undefined;
          if (previous) void client?.mutation(padApi.disconnect, { deviceToken: previous }).catch(() => {});
        } else {
          const response = await fetch('/auth/pad/sair', { method: 'POST', signal: AbortSignal.timeout(15_000) });
          if (!response.ok && response.status !== 401) throw new Error('Logout failed');
          client?.setAuth(async () => null);
        }
        pairing = false;
        accept(null);
      } else if (!convexUrl || (native && !courseUrl)) {
        message.textContent = 'A sincronização ainda não foi configurada nesta versão. Você pode continuar usando o editor.';
      } else if (!native) {
        location.assign('/auth/entrar?returnTo=' + encodeURIComponent('/pad/'));
      } else {
        if (!client) client = new ConvexClient(convexUrl);
        token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
        await NativeAccount.write({ token });
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
        const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
        pairing = true;
        pairingCode = hash.slice(0, 8).toUpperCase();
        watchSession();
        render();
        message.textContent = `Confirme o código ${hash.slice(0, 8).toUpperCase()} no navegador e volte ao aplicativo.`;
        await NativeAccount.open({ url: `${courseUrl}/pad/connect?key=${hash}` });
        pairingTimer = setTimeout(() => {
          if (!pairing) return;
          unsubscribeSession?.();
          pairing = false;
          render();
          message.textContent = 'A entrada demorou mais que o esperado. Toque em entrar para tentar novamente.';
        }, 10 * 60_000);
      }
    } catch { showError(); }
    finally { action.disabled = false; }
  })(); });
  retry.addEventListener('click', () => { void sync.flush(); });
  const resume = () => {
    if (document.hidden) return;
    if (account) void sync.flush();
    if (native && token) watchSession();
  };
  window.addEventListener('online', resume);
  document.addEventListener('visibilitychange', resume);
  render();
  const back = document.querySelector<HTMLAnchorElement>('#course-link')!;
  back.hidden = native || !location.pathname.startsWith('/pad');
  void initialize().catch(showError);
}

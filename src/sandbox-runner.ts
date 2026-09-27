import { formatValue } from './format-value';
import { runWorker } from './runner.worker';
import type { RunnerReply } from './protocol';

// This function deliberately captures no parent state: only its source enters the sandbox.
function sandboxHost() {
  window.addEventListener('message', event => {
    const port = event.ports[0];
    if (!port) return;
    const url = URL.createObjectURL(new Blob([event.data.worker], { type: 'text/javascript' }));
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = reply => port.postMessage(reply.data);
    worker.onerror = error => port.postMessage({ type: 'error', text: error.message });
    port.onmessage = () => worker.terminate();
    worker.postMessage({ javascript: event.data.javascript });
  }, { once: true });
}

/** User code has no application origin, network, account credentials, or native bridge. */
export class SandboxRunner {
  onmessage?: (message: MessageEvent<RunnerReply>) => void;
  onerror?: (error: { message: string }) => void;
  private frame = document.createElement('iframe');
  private channel = new MessageChannel();

  constructor() {
    this.frame.hidden = true;
    this.frame.setAttribute('sandbox', 'allow-scripts');
    this.frame.setAttribute('aria-hidden', 'true');
    this.channel.port1.onmessage = event => {
      if (isReply(event.data)) this.onmessage?.(event);
    };
  }
  postMessage({ javascript }: { javascript: string }) {
    const worker = `(${runWorker.toString()})(${formatValue.toString()});`;
    this.frame.onload = () => {
      this.frame.contentWindow?.postMessage({ worker, javascript }, '*', [this.channel.port2]);
    };
    this.frame.onerror = () => this.onerror?.({ message: 'Não foi possível iniciar a execução.' });
    this.frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:; connect-src 'none'"><script>(${sandboxHost.toString()})();<\/script>`;
    document.body.append(this.frame);
  }
  terminate() {
    this.channel.port1.postMessage('stop');
    this.channel.port1.close();
    this.frame.remove();
  }
}

function isReply(value: unknown): value is RunnerReply {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;
  if (value.type === 'clear') return true;
  if (value.type === 'done') return 'duration' in value && typeof value.duration === 'number' && Number.isFinite(value.duration);
  if (!('text' in value) || typeof value.text !== 'string' || value.text.length > 16000) return false;
  if (value.type === 'error') return true;
  return value.type === 'log' && 'level' in value && (value.level === 'log' || value.level === 'info' || value.level === 'warn' || value.level === 'error');
}

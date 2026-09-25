import { formatValue } from './format-value';
import type { LogLevel, RunnerReply } from './protocol';

const send = (message: RunnerReply) => self.postMessage(message);
let logCount = 0;
const log = (level: LogLevel, values: unknown[]) => {
  if (logCount++ >= 500) {
    if (logCount === 501)
      send({ type: 'log', level: 'warn', text: 'Limite de 500 logs atingido nesta execução.' });
    return;
  }
  try {
    send({
      type: 'log',
      level,
      text: values
        .map((value) => formatValue(value))
        .join(' ')
        .slice(0, 16000),
    });
  } catch {
    send({ type: 'log', level, text: '[Não foi possível representar este valor]' });
  }
};
for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
  console[level] = (...values: unknown[]) => log(level === 'debug' ? 'log' : level, values);
}
console.table = (value: unknown) => log('log', [value]);
console.clear = () => send({ type: 'clear' });
console.assert = (condition?: boolean, ...values: unknown[]) => {
  if (!condition) log('error', ['Assertion failed:', ...values]);
};
const timers = new Map<string, number>();
console.time = (label = 'default') => {
  timers.set(label, performance.now());
};
console.timeEnd = (label = 'default') => {
  const start = timers.get(label);
  if (start !== undefined) {
    log('log', [`${label}: ${(performance.now() - start).toFixed(2)} ms`]);
    timers.delete(label);
  }
};
const reportError = (error: unknown) => send({ type: 'error', text: formatValue(error) });
self.addEventListener('error', (event) => {
  event.preventDefault();
  reportError(event.error ?? event.message);
});
self.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
  reportError(event.reason);
});
self.onmessage = async (event: MessageEvent<{ javascript: string }>) => {
  const start = performance.now();
  try {
    // User code lives only in this disposable worker, with no DOM or Capacitor bridge.
    const execute = new Function(
      `return (async () => {\n"use strict";\n${event.data.javascript}\n})();\n//# sourceURL=playground.js`,
    );
    await execute();
    send({ type: 'done', duration: performance.now() - start });
  } catch (error) {
    reportError(error);
  }
};

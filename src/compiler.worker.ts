import { compile } from './compiler';
import type { CompilerReply } from './protocol';

self.onmessage = (event: MessageEvent<{ id: number; source: string }>) => {
  const { id, source } = event.data;
  let reply: CompilerReply;
  try {
    reply = { id, result: compile(source) };
  } catch (error) {
    reply = { id, error: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(reply);
};

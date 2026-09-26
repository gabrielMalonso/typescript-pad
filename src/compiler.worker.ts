import { check, compile } from './compiler';
import type { CheckReply, CompilerReply, CompilerRequest } from './protocol';

self.onmessage = (event: MessageEvent<CompilerRequest>) => {
  const { id, source, kind } = event.data;
  let reply: CompilerReply | CheckReply;
  try {
    reply = kind === 'check' ? { id, issues: check(source) } : { id, result: compile(source) };
  } catch (error) {
    reply = { id, error: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(reply);
};

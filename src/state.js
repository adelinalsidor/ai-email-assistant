import { existsSync, readFileSync, writeFileSync } from 'fs';

const STATE_PATH = new URL('../data/state.json', import.meta.url);

// Remembers the highest UID we've already processed, so every run only looks at
// mail that arrived after the last one - regardless of how much old/unread mail
// already sits in the mailbox, and regardless of whether a human reads it first.
export function loadState() {
  if (!existsSync(STATE_PATH)) {
    return { lastUid: 0 };
  }
  return JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
}

export function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

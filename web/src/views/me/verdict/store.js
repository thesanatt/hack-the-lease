// The verdict's per-home notes, shared with the Ranking table so each row can show its biggest plus or minus.
// Verdict publishes; Ranking reads. Nothing leaves the page.
import { useSyncExternalStore } from 'react';

let notes = null;
const subs = new Set();

export function publishNotes(next) {
  if (next === notes) return;
  notes = next;
  for (const fn of subs) fn();
}

function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

const snap = () => notes;

export function useVerdictNotes() {
  return useSyncExternalStore(subscribe, snap, snap);
}

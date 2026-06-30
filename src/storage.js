// Local persistence + JSON backup. Replaces the Claude-only window.storage.
const KEY = "shift-tracker-state-v1";

export function load() {
  try { const r = localStorage.getItem(KEY); return r ? JSON.parse(r) : null; }
  catch { return null; }
}
export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* quota */ }
}
export function exportJSON() {
  return localStorage.getItem(KEY) || "{}";
}
export function importJSON(text) {
  const obj = JSON.parse(text);
  localStorage.setItem(KEY, JSON.stringify(obj));
  return obj;
}

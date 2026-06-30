// Two-way Google Calendar sync via client-side OAuth (Google Identity Services).
// GET events, POST new events, PATCH notes onto existing events. No backend.
import { GOOGLE_CLIENT_ID } from "./config.js";

const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const TOKEN_KEY = "st_gcal_token";
const BASE = "https://www.googleapis.com/calendar/v3";
let gisReady = null;

function configured() {
  return GOOGLE_CLIENT_ID && !GOOGLE_CLIENT_ID.startsWith("YOUR_");
}
export function isConfigured() { return configured(); }

function loadGis() {
  if (gisReady) return gisReady;
  gisReady = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Google sign-in"));
    document.head.appendChild(s);
  });
  return gisReady;
}

function getToken() {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || "null");
    if (t && t.expiry > Date.now() + 30000) return t.access_token;
  } catch { /* ignore */ }
  return null;
}
export function isConnected() { return !!getToken(); }
export function disconnect() { localStorage.removeItem(TOKEN_KEY); }

export async function connect() {
  if (!configured()) throw new Error("Set your Google client ID in src/config.js first.");
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error) return reject(new Error(resp.error));
        const expiry = Date.now() + Number(resp.expires_in || 3600) * 1000;
        localStorage.setItem(TOKEN_KEY, JSON.stringify({ access_token: resp.access_token, expiry }));
        resolve(true);
      },
    });
    client.requestAccessToken({ prompt: "" });
  });
}

async function api(path, opts = {}) {
  const token = getToken();
  if (!token) throw new Error("Not connected");
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (res.status === 401) { disconnect(); throw new Error("Session expired, reconnect"); }
  if (!res.ok) throw new Error("Calendar API " + res.status);
  return res.status === 204 ? null : res.json();
}

export async function listEvents(timeMinISO, timeMaxISO) {
  const q = new URLSearchParams({ timeMin: timeMinISO, timeMax: timeMaxISO,
    singleEvents: "true", orderBy: "startTime", maxResults: "50" });
  const data = await api("/calendars/primary/events?" + q.toString());
  return (data.items || []).map((it) => ({
    id: it.id, title: it.summary || "(no title)", start: it.start?.dateTime || it.start?.date,
  }));
}

export async function createEvent({ summary, startISO, endISO, description }) {
  const body = {
    summary, description: description || "",
    start: { dateTime: startISO },
    end: { dateTime: endISO || new Date(Date.parse(startISO) + 30 * 60000).toISOString() },
  };
  const data = await api("/calendars/primary/events", { method: "POST", body: JSON.stringify(body) });
  return data.id;
}

export async function appendNote(eventId, note) {
  const ev = await api("/calendars/primary/events/" + eventId);
  const description = (ev.description ? ev.description + "\n" : "") + note;
  await api("/calendars/primary/events/" + eventId, { method: "PATCH", body: JSON.stringify({ description }) });
}

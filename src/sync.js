// Shared-space sync via Supabase (auth + realtime). Dormant until configured.
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

let supa = null;
let state = { user: null, space: null, role: null };

export function configured() {
  return SUPABASE_URL && !SUPABASE_URL.startsWith("YOUR_") &&
    SUPABASE_PUBLISHABLE_KEY && !SUPABASE_PUBLISHABLE_KEY.startsWith("YOUR_");
}
function client() {
  if (!configured()) return null;
  if (!supa) supa = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  return supa;
}
export function getState() { return state; }

async function loadSpace() {
  const c = client(); if (!c || !state.user) return;
  const { data } = await c.from("space_members").select("space_id, role").eq("user_id", state.user.id).limit(1);
  if (data && data.length) { state.space = data[0].space_id; state.role = data[0].role; }
}
export async function init() {
  const c = client(); if (!c) return null;
  const { data } = await c.auth.getSession();
  state.user = data.session?.user || null;
  if (state.user) await loadSpace();
  return state.user;
}
export function onAuth(cb) {
  const c = client(); if (!c) return;
  c.auth.onAuthStateChange(async (_e, sess) => {
    state.user = sess?.user || null;
    if (state.user) await loadSpace(); else { state.space = null; state.role = null; }
    cb(state);
  });
}
export async function signIn(email) {
  const c = client(); if (!c) throw new Error("Supabase not configured");
  const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
  if (error) throw error;
}
export async function signOut() {
  const c = client(); if (c) await c.auth.signOut();
  state = { user: null, space: null, role: null };
}
export async function createSpace() {
  const c = client();
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const { data, error } = await c.rpc("create_space", { code });
  if (error) throw error;
  state.space = data; state.role = "owner"; return code;
}
export async function spaceCode() {
  const c = client(); if (!state.space) return null;
  const { data } = await c.from("spaces").select("invite_code").eq("id", state.space).single();
  return data?.invite_code || null;
}
export async function joinSpace(code) {
  const c = client();
  const { data, error } = await c.rpc("join_space", { code: code.trim().toUpperCase() });
  if (error) throw error;
  state.space = data; state.role = "partner"; return data;
}
export async function emit(kind, title, detail, meta = {}) {
  const c = client(); if (!c || !state.space || !state.user) return;
  try { await c.from("activity").insert({ space_id: state.space, author: state.user.id, kind, title, detail, meta }); } catch { /* offline */ }
}
export async function listActivity(limit = 50) {
  const c = client(); if (!c || !state.space) return [];
  const { data } = await c.from("activity").select("*").eq("space_id", state.space).order("created_at", { ascending: false }).limit(limit);
  return data || [];
}
export async function listReactions() {
  const c = client(); if (!c || !state.space) return [];
  const { data } = await c.from("reactions").select("*");
  return data || [];
}
export async function listComments() {
  const c = client(); if (!c || !state.space) return [];
  const { data } = await c.from("comments").select("*");
  return data || [];
}
export async function react(activityId, emoji) {
  const c = client(); await c.from("reactions").upsert({ activity_id: activityId, user_id: state.user.id, emoji }, { onConflict: "activity_id,user_id,emoji" });
}
export async function unreact(activityId, emoji) {
  const c = client(); await c.from("reactions").delete().match({ activity_id: activityId, user_id: state.user.id, emoji });
}
export async function comment(activityId, body) {
  const c = client(); await c.from("comments").insert({ activity_id: activityId, user_id: state.user.id, body });
}
export async function approveReward(activityId, meta) {
  const c = client(); const { error } = await c.from("activity").update({ meta }).eq("id", activityId);
  if (error) throw error;
}
export function subscribe(onChange) {
  const c = client(); if (!c || !state.space) return () => {};
  const ch = c.channel("space-" + state.space)
    .on("postgres_changes", { event: "*", schema: "public", table: "activity", filter: "space_id=eq." + state.space }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "reactions" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, onChange)
    .subscribe();
  return () => { c.removeChannel(ch); };
}

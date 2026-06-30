import { useState, useEffect, useRef } from "react";
import * as cal from "./calendar.js";
import * as storage from "./storage.js";
import * as sync from "./sync.js";

// ---------------------------------------------------------------------------
// A quiet time-management app for ADHD focus. Druid skin: work with cycles,
// shift form to match the terrain, no shame on what is unfinished.
//   Shift  · a bounded focus loop with a visible queue
//   Cadence · showing up on time, as a streak
// ---------------------------------------------------------------------------

const C = {
  bg: "#1a201c", surface: "#232a26", surface2: "#2b332e", line: "#34403a",
  bone: "#e8e4d8", muted: "#8a948a", faint: "#5f6b62", amber: "#d9a441",
  moss: "#7a9b6e", rust: "#a8595f",
};
const FORM_COLORS = ["#7a9b6e", "#d9a441", "#6a9b94", "#c08552", "#9b8ec0", "#b76e79"];
const serif = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif";
const sans = "ui-sans-serif, -apple-system, 'Segoe UI', Roboto, sans-serif";
const mono = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

const STORAGE_KEY = "shift-tracker-state-v1";
const DEFAULT_FORMS = [
  { id: "engage", name: "Engage M", color: "#7a9b6e", recurring: "" },
  { id: "forge", name: "Forge", color: "#d9a441", recurring: "Ship one small thing" },
  { id: "signal", name: "Signal", color: "#6a9b94", recurring: "Move the profile forward" },
  { id: "tend", name: "Tend", color: "#c08552", recurring: "" },
];
const DEFAULT_LABS = { notes: false, tags: false, chimes: false, rest: false, goal: false, hideDone: false };
const LAB_INFO = [
  { key: "notes", name: "Field notes", desc: "Capture ideas and friction mid-shift, copy them out later." },
  { key: "tags", name: "Batch tags", desc: "Tag tasks by type so you can see when you are batching." },
  { key: "chimes", name: "Time chimes", desc: "A soft tone at the halfway mark and the final minute." },
  { key: "rest", name: "Rest beat", desc: "A short regeneration timer between shifts." },
  { key: "goal", name: "Weekly goal", desc: "Set a shift target; the grove tracks it." },
  { key: "hideDone", name: "Hide served", desc: "Collapse finished tasks to keep the queue clean." },
];
const TAGS = ["Build", "Review", "Call", "Write", "Admin"];
const LENGTHS = [25, 50, 90];
const REST_LENGTHS = [3, 5, 10];
const MAX_QUEUE = 5;

// Cadence categories. "good" status keeps the streak alive.
const KINDS = {
  meeting:  { label: "Meeting",   color: "#7a9b6e", statuses: ["on time", "late", "missed"] },
  deadline: { label: "Deadline",  color: "#6a9b94", statuses: ["met", "missed"] },
  focus:    { label: "Focus",     color: "#9b8ec0", statuses: ["held", "skipped"] },
  kang:     { label: "Meet Kang", color: "#c08552", statuses: ["on time", "late", "missed"] },
};
const GOOD = new Set(["on time", "met", "held"]);
const CAL_MCP = "https://calendarmcp.googleapis.com/mcp/v1";

// Ledger: skills you level by logging reps. Points are earned, never deducted.
const PT_TIERS = [1, 3, 5];
const DEFAULT_SKILLS = [
  { id: "timing", name: "Timing", color: "#7a9b6e", desc: "Showing up when you said you would.", reps: [
    { id: "t1", text: "Arrive to meet Kang at the agreed minute", pts: 5 },
    { id: "t2", text: "Join a work meeting settled, not scrambling", pts: 3 },
    { id: "t3", text: "Hit a deadline without renegotiating it day-of", pts: 3 } ] },
  { id: "focus", name: "Focus", color: "#d9a441", desc: "The Shift loop, paying out.", reps: [
    { id: "f1", text: "Complete a Shift with the full queue served", pts: 3 },
    { id: "f2", text: "Run two Shifts in one day", pts: 5 },
    { id: "f3", text: "Start a Shift within 10 min of sitting down", pts: 3 } ] },
  { id: "provision", name: "Provision", color: "#6a9b94", desc: "Spending on yourself is permission, not pressure. If it ever feels like pressure, lower the points or skip it.", reps: [
    { id: "p1", text: "Buy the thing you circled, and let it stand", pts: 5 },
    { id: "p2", text: "Put money toward a reward trip on purpose", pts: 5 },
    { id: "p3", text: "Treat yourself small, logged as a win", pts: 1 } ] },
  { id: "intention", name: "Intention", color: "#9b8ec0", desc: "The ritual that already worked for you.", reps: [
    { id: "i1", text: "Set one clear intention before opening Slack", pts: 1 },
    { id: "i2", text: "Report the day's outcome at night, honestly", pts: 3 },
    { id: "i3", text: "Name tomorrow's most-avoided task before bed", pts: 1 } ] },
  { id: "renown", name: "Renown", color: "#c08552", desc: "Building the independent consultant profile.", reps: [
    { id: "r1", text: "Send one outreach or follow-up", pts: 3 },
    { id: "r2", text: "Publish one thing: write-up, demo, case study", pts: 5 },
    { id: "r3", text: "Focused block sharpening a portfolio piece", pts: 3 } ] },
  { id: "maker", name: "Maker", color: "#b76e79", desc: "Shipping the side apps with Kang.", reps: [
    { id: "m1", text: "Ship one visible increment", pts: 3 },
    { id: "m2", text: "Close a build task you both agreed on", pts: 3 },
    { id: "m3", text: "Demo progress to Kang instead of polishing alone", pts: 5 } ] },
  { id: "upkeep", name: "Upkeep", color: "#8aa0a0", desc: "The baseline that quietly holds everything up.", reps: [
    { id: "u1", text: "Hold your sleep window", pts: 3 },
    { id: "u2", text: "Clear a declutter or repair task from Tend", pts: 1 },
    { id: "u3", text: "Eat a real meal at a real time", pts: 1 } ] },
  { id: "bond", name: "Bond", color: "#cf8ca0", desc: "Investing in the relationship, not the logistics.", reps: [
    { id: "b1", text: "Plan quality time with Kang, phone away", pts: 3 },
    { id: "b2", text: "Do one thoughtful thing unprompted", pts: 1 },
    { id: "b3", text: "Have the real conversation you put off", pts: 5 } ] },
];
const DEFAULT_REWARDS = [
  { id: "bar", name: "A night at my favorite bar", cost: 40, redeemed: false },
  { id: "hotel", name: "Overnight at a downtown hotel", cost: 120, redeemed: false },
  { id: "universal", name: "Day trip to Universal Studios", cost: 300, redeemed: false },
];

const uid = () => Math.random().toString(36).slice(2, 9);
const now = () => Date.now();

let audioCtx;
function beep(freq = 640, dur = 0.18, when = 0) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const t0 = audioCtx.currentTime + when;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = "sine"; osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.16, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g); g.connect(audioCtx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  } catch { /* no audio */ }
}

async function loadState() { return storage.load(); }
async function saveState(state) { storage.save(state); }

function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function whenLabel(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
  } catch { return ""; }
}
function fmtDelta(targetMs, doneMs) {
  if (!targetMs || !doneMs) return null;
  const diff = targetMs - doneMs;
  const mins = Math.round(Math.abs(diff) / 60000);
  if (mins === 0) return "on the minute";
  const unit = mins >= 90 ? `${Math.round((mins / 60) * 10) / 10} hr` : `${mins} min`;
  return diff >= 0 ? `${unit} early` : `${unit} late`;
}
function whenStamp(ms) {
  try { return new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  catch { return ""; }
}
function toLocalInput(ms) {
  if (!ms) return "";
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}
function TargetControl({ mode, setMode, when, setWhen }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div className="flex flex-wrap items-center" style={{ gap: 6 }}>
        <span style={{ color: C.faint, fontSize: 12.5, marginRight: 2 }}>target time</span>
        <Chip small active={mode === "none"} onClick={() => setMode("none")}>none</Chip>
        <Chip small active={mode === "now"} onClick={() => setMode("now")}>now</Chip>
        <Chip small active={mode === "set"} onClick={() => setMode("set")}>set</Chip>
      </div>
      {mode === "set" && (
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)}
          style={{ ...inputStyle, width: "100%", marginTop: 8, colorScheme: "dark" }} />
      )}
    </div>
  );
}
function computeStreak(events) {
  const resolved = events.filter((e) => e.status !== "pending").sort((a, b) => a.ts - b.ts);
  let cur = 0, best = 0;
  for (const e of resolved) {
    if (GOOD.has(e.status)) { cur++; best = Math.max(best, cur); } else cur = 0;
  }
  return { cur, best };
}

function Ring({ taskFrac, timeFrac, center }) {
  const size = 240, cx = size / 2, rO = 104, rI = 84;
  const cO = 2 * Math.PI * rO, cI = 2 * Math.PI * rI;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
      <g transform={`rotate(-90 ${cx} ${cx})`}>
        <circle cx={cx} cy={cx} r={rO} fill="none" stroke={C.line} strokeWidth="10" />
        <circle cx={cx} cy={cx} r={rO} fill="none" stroke={C.amber} strokeWidth="10"
          strokeLinecap="round" strokeDasharray={cO} strokeDashoffset={cO * (1 - taskFrac)}
          style={{ transition: "stroke-dashoffset 600ms cubic-bezier(.4,0,.2,1)" }} />
        {timeFrac != null && <>
          <circle cx={cx} cy={cx} r={rI} fill="none" stroke={C.line} strokeWidth="4" />
          <circle cx={cx} cy={cx} r={rI} fill="none" stroke={C.moss} strokeWidth="4"
            strokeLinecap="round" strokeDasharray={cI} strokeDashoffset={cI * (1 - timeFrac)}
            style={{ transition: "stroke-dashoffset 1000ms linear" }} />
        </>}
      </g>
      {center}
    </svg>
  );
}
function Chip({ active, color, onClick, children, title, small }) {
  return (
    <button onClick={onClick} title={title} style={{
      border: `1px solid ${active ? (color || C.amber) : C.line}`,
      background: active ? `${color || C.amber}22` : "transparent",
      color: active ? C.bone : C.muted, borderRadius: 999,
      padding: small ? "5px 11px" : "7px 14px", fontSize: small ? 13 : 14,
      cursor: "pointer", fontFamily: sans, transition: "all 160ms",
    }}>{children}</button>
  );
}
function Toggle({ on, onClick }) {
  return (
    <button onClick={onClick} aria-pressed={on} style={{
      width: 44, height: 25, borderRadius: 999, flexShrink: 0,
      border: `1px solid ${on ? C.amber : C.line}`, background: on ? `${C.amber}33` : C.surface2,
      position: "relative", cursor: "pointer", transition: "all 160ms",
    }}>
      <span style={{ position: "absolute", top: 2, left: on ? 21 : 2, width: 18, height: 18,
        borderRadius: 999, background: on ? C.amber : C.faint, transition: "left 160ms" }} />
    </button>
  );
}
function TagBadge({ tag }) {
  if (!tag) return null;
  return <span style={{ fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: C.muted,
    border: `1px solid ${C.line}`, borderRadius: 6, padding: "2px 7px" }}>{tag}</span>;
}
const inputStyle = { flex: 1, background: C.surface2, border: `1px solid ${C.line}`, color: C.bone,
  borderRadius: 10, padding: "11px 13px", fontSize: 15, fontFamily: sans, outline: "none" };
const ghostBtn = { background: "transparent", border: `1px solid ${C.line}`, color: C.muted,
  borderRadius: 10, padding: "0 16px", fontSize: 14, cursor: "pointer", fontFamily: sans };
function Label({ children }) {
  return <div style={{ fontSize: 12, letterSpacing: 1.4, textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>{children}</div>;
}
function NavTab({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{ background: "none", border: "none", cursor: "pointer",
      fontFamily: serif, fontSize: 21, padding: "0 0 4px", color: active ? C.bone : C.faint,
      borderBottom: `2px solid ${active ? C.amber : "transparent"}`, transition: "all 160ms" }}>
      {children}
    </button>
  );
}

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("shift");
  const [forms, setForms] = useState(DEFAULT_FORMS);
  const [log, setLog] = useState([]);
  const [shift, setShift] = useState(null);
  const [view, setView] = useState("setup");
  const [summary, setSummary] = useState(null);
  const [events, setEvents] = useState([]);
  const [skills, setSkills] = useState(DEFAULT_SKILLS);
  const [pointsLog, setPointsLog] = useState([]);
  const [rewards, setRewards] = useState(DEFAULT_REWARDS);

  const [labs, setLabs] = useState(DEFAULT_LABS);
  const [notes, setNotes] = useState([]);
  const [weeklyGoal, setWeeklyGoal] = useState(10);
  const [restLen, setRestLen] = useState(5);

  const [formId, setFormId] = useState(DEFAULT_FORMS[0].id);
  const [items, setItems] = useState([]);
  const [length, setLength] = useState(50);
  const [customLen, setCustomLen] = useState("");
  const [draft, setDraft] = useState("");
  const [draftTag, setDraftTag] = useState(null);

  const [tick, setTick] = useState(0);
  const [panel, setPanel] = useState(null);
  const tickRef = useRef(null);

  useEffect(() => {
    (async () => {
      const s = await loadState();
      if (s) {
        setForms(s.forms?.length ? s.forms : DEFAULT_FORMS);
        setLog(s.log || []);
        setEvents(s.events || []);
        setSkills(s.skills?.length ? s.skills : DEFAULT_SKILLS);
        setPointsLog(s.pointsLog || []);
        setRewards(s.rewards || DEFAULT_REWARDS);
        setLabs({ ...DEFAULT_LABS, ...(s.labs || {}) });
        setNotes(s.notes || []);
        setWeeklyGoal(s.weeklyGoal ?? 10);
        setRestLen(s.restLen ?? 5);
        setFormId(s.forms?.[0]?.id || DEFAULT_FORMS[0].id);
        if (s.shift) { setShift(s.shift); setView("active"); }
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    saveState({ forms, log, shift, events, skills, pointsLog, rewards, labs, notes, weeklyGoal, restLen });
  }, [forms, log, shift, events, skills, pointsLog, rewards, labs, notes, weeklyGoal, restLen, loaded]);

  useEffect(() => { sync.init().catch(() => {}); }, []);

  useEffect(() => {
    if (view !== "active" || !shift || shift.paused) return;
    tickRef.current = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(tickRef.current);
  }, [view, shift]);

  const remainingMs = shift ? (shift.paused ? shift.remainingMs : Math.max(0, shift.endsAt - now())) : 0;

  useEffect(() => {
    if (view !== "active" || !shift || shift.paused) return;
    const rem = Math.max(0, shift.endsAt - now());
    if (rem <= 0) { endShift(true); return; }
    if (labs.chimes && shift.cues) {
      if (!shift.cues.half && rem <= shift.totalMs / 2) {
        beep(560); setShift((s) => ({ ...s, cues: { ...s.cues, half: true } }));
      } else if (!shift.cues.final && rem <= 60000) {
        beep(740); beep(740, 0.18, 0.22); setShift((s) => ({ ...s, cues: { ...s.cues, final: true } }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const activeForm = forms.find((f) => f.id === (shift ? shift.formId : formId)) || forms[0];

  function addItem(text) {
    const t = text.trim();
    if (!t || items.length >= MAX_QUEUE) return;
    setItems((xs) => [...xs, { id: uid(), text: t, done: false, tag: labs.tags ? draftTag : null }]);
    setDraft(""); setDraftTag(null);
  }
  const removeItem = (id) => setItems((xs) => xs.filter((x) => x.id !== id));
  function beginShift() {
    const mins = customLen ? Number(customLen) : length;
    if (!items.length || !mins || mins <= 0) return;
    const totalMs = mins * 60 * 1000;
    setShift({ formId, items: items.map((i) => ({ ...i })), totalMs, endsAt: now() + totalMs,
      remainingMs: totalMs, paused: false, startedAt: now(), cues: { half: false, final: false } });
    setView("active");
  }
  const toggle = (id) => setShift((s) => ({ ...s, items: s.items.map((i) => i.id === id ? { ...i, done: !i.done } : i) }));
  function quickAdd(text) {
    const t = text.trim();
    if (!t || shift.items.length >= MAX_QUEUE) return;
    setShift((s) => ({ ...s, items: [...s.items, { id: uid(), text: t, done: false, tag: null }] }));
  }
  function pause() {
    setShift((s) => s.paused ? { ...s, paused: false, endsAt: now() + s.remainingMs }
      : { ...s, paused: true, remainingMs: Math.max(0, s.endsAt - now()) });
  }
  function endShift(byTimer) {
    if (!shift) return;
    const served = shift.items.filter((i) => i.done).length;
    const total = shift.items.length;
    const carried = shift.items.filter((i) => !i.done).map((i) => ({ ...i, done: false }));
    const entry = { id: uid(), formId: shift.formId, served, total, mins: Math.round(shift.totalMs / 60000), endedAt: now(), byTimer: !!byTimer };
    setLog((l) => [entry, ...l].slice(0, 60));
    sync.emit("shift", (forms.find((f) => f.id === entry.formId)?.name || "Shift") + " shift complete", `served ${served} of ${total}`, { served, total, mins: entry.mins });
    setSummary({ entry, carried });
    setShift(null); setView("close");
  }
  function nextShift(keepCarried) {
    setFormId(summary.entry.formId);
    setItems(keepCarried ? summary.carried.map((c) => ({ ...c, id: uid() })) : []);
    setSummary(null); setView("setup");
  }
  const addNote = (text) => { const t = text.trim(); if (t) setNotes((ns) => [{ id: uid(), text: t, ts: now() }, ...ns]); };
  const patchForm = (id, patch) => setForms((fs) => fs.map((f) => f.id === id ? { ...f, ...patch } : f));
  const addForm = () => setForms((fs) => [...fs, { id: uid(), name: "New form", color: FORM_COLORS[fs.length % FORM_COLORS.length], recurring: "" }]);
  function deleteForm(id) {
    if (forms.length <= 1) return;
    setForms((fs) => fs.filter((f) => f.id !== id));
    if (formId === id) setFormId(forms.find((f) => f.id !== id).id);
  }

  const week = log.filter((e) => now() - e.endedAt < 7 * 864e5);

  if (!loaded) {
    return <div style={{ minHeight: "100%", background: C.bg, color: C.muted, fontFamily: sans,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>Waking the grove...</div>;
  }

  return (
    <div style={{ minHeight: "100%", background: C.bg, color: C.bone, fontFamily: sans, padding: "26px 18px 48px", boxSizing: "border-box" }}>
      <style>{`
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
        input::placeholder { color: ${C.faint}; }
        .row-enter { animation: fade 240ms ease both; }
        @keyframes fade { from {opacity:0;transform:translateY(4px);} to {opacity:1;transform:none;} }
      `}</style>

      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
          <div className="flex items-center" style={{ gap: 18 }}>
            <NavTab active={tab === "shift"} onClick={() => setTab("shift")}>Shift</NavTab>
            <NavTab active={tab === "cadence"} onClick={() => setTab("cadence")}>Cadence</NavTab>
            <NavTab active={tab === "ledger"} onClick={() => setTab("ledger")}>Ledger</NavTab>
            <NavTab active={tab === "together"} onClick={() => setTab("together")}>Together</NavTab>
          </div>
          {tab === "shift" && view === "setup" && (panel
            ? <button onClick={() => setPanel(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13 }}>close</button>
            : <div className="flex" style={{ gap: 16 }}>
                <button onClick={() => setPanel("forms")} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13 }}>forms</button>
                <button onClick={() => setPanel("labs")} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13 }}>labs</button>
              </div>)}
          {tab === "ledger" && (
            <button onClick={() => setPanel(panel === "ledger" ? null : "ledger")} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13 }}>
              {panel === "ledger" ? "close" : "manage"}
            </button>)}
        </div>
        <div style={{ color: C.faint, fontSize: 12.5, marginBottom: 22 }}>
          {tab === "shift" ? "shift form to match the terrain"
            : tab === "cadence" ? "show up when you said you would"
            : tab === "ledger" ? "level your skills, bank the points, redeem with Kang"
            : "share the day with Kang"}
        </div>

        {tab === "together" ? (
          <Together rewards={rewards} setRewards={setRewards} />
        ) : tab === "ledger" ? (
          <Ledger skills={skills} setSkills={setSkills} pointsLog={pointsLog} setPointsLog={setPointsLog}
            rewards={rewards} setRewards={setRewards} manage={panel === "ledger"} />
        ) : tab === "cadence" ? (
          <Cadence events={events} setEvents={setEvents} />
        ) : (
          <>
            {view === "setup" && (
              panel === "forms" ? <FormsManager forms={forms} patchForm={patchForm} addForm={addForm} deleteForm={deleteForm} />
              : panel === "labs" ? <LabsPanel labs={labs} setLabs={setLabs} weeklyGoal={weeklyGoal} setWeeklyGoal={setWeeklyGoal} restLen={restLen} setRestLen={setRestLen} />
              : (
                <>
                  <Label>Form</Label>
                  <div className="flex flex-wrap" style={{ gap: 8, marginBottom: 22 }}>
                    {forms.map((f) => (
                      <Chip key={f.id} active={formId === f.id} color={f.color} onClick={() => setFormId(f.id)}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 99, background: f.color }} />{f.name}
                        </span>
                      </Chip>
                    ))}
                  </div>
                  <Label>Queue <span style={{ color: C.faint }}>· {items.length}/{MAX_QUEUE}</span></Label>
                  <div style={{ marginBottom: 8 }}>
                    {items.map((it) => (
                      <div key={it.id} className="row-enter flex items-center" style={{ gap: 10, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", marginBottom: 7 }}>
                        <span style={{ flex: 1, fontSize: 15 }}>{it.text}</span>
                        {labs.tags && <TagBadge tag={it.tag} />}
                        <button onClick={() => removeItem(it.id)} style={{ background: "none", border: "none", color: C.faint, cursor: "pointer", fontSize: 16 }}>×</button>
                      </div>
                    ))}
                  </div>
                  {labs.tags && items.length < MAX_QUEUE && (
                    <div className="flex flex-wrap" style={{ gap: 6, marginBottom: 8 }}>
                      {TAGS.map((t) => <Chip key={t} small active={draftTag === t} onClick={() => setDraftTag(draftTag === t ? null : t)}>{t}</Chip>)}
                    </div>
                  )}
                  {items.length < MAX_QUEUE && (
                    <div className="flex" style={{ gap: 8, marginBottom: 6 }}>
                      <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addItem(draft)} placeholder="one task, then Enter" style={inputStyle} />
                      <button onClick={() => addItem(draft)} style={ghostBtn}>add</button>
                    </div>
                  )}
                  {items.length >= MAX_QUEUE && <div style={{ color: C.faint, fontSize: 12.5, marginBottom: 6 }}>Five is the cap. A full queue you can see beats a long one you can't.</div>}
                  {activeForm?.recurring && !items.some((i) => i.text === activeForm.recurring) && items.length < MAX_QUEUE && (
                    <button onClick={() => addItem(activeForm.recurring)} style={{ background: "none", border: `1px dashed ${activeForm.color}`, color: C.muted, borderRadius: 8, padding: "7px 12px", fontSize: 13, cursor: "pointer", marginTop: 4, marginBottom: 22 }}>+ {activeForm.recurring}</button>
                  )}
                  <div style={{ height: 14 }} />
                  <Label>Length</Label>
                  <div className="flex flex-wrap items-center" style={{ gap: 8, marginBottom: 26 }}>
                    {LENGTHS.map((m) => <Chip key={m} active={!customLen && length === m} onClick={() => { setLength(m); setCustomLen(""); }}>{m} min</Chip>)}
                    <input value={customLen} onChange={(e) => setCustomLen(e.target.value.replace(/\D/g, ""))} placeholder="custom" style={{ ...inputStyle, width: 84, padding: "8px 10px" }} />
                  </div>
                  <button onClick={beginShift} disabled={!items.length || (!length && !customLen)} style={{ width: "100%", padding: "15px", borderRadius: 12, border: "none", background: items.length ? C.amber : C.surface2, color: items.length ? "#241c08" : C.faint, fontFamily: serif, fontSize: 17, fontWeight: 600, cursor: items.length ? "pointer" : "default", transition: "all 200ms" }}>Begin shift</button>
                  {labs.notes && <NotesBlock notes={notes} addNote={addNote} setNotes={setNotes} />}
                  <Grove week={week} forms={forms} log={log} goal={labs.goal ? weeklyGoal : 0} />
                </>
              )
            )}
            {view === "active" && shift && (
              <ActiveShift shift={shift} form={activeForm} remainingMs={remainingMs} labs={labs} toggle={toggle} pause={pause} quickAdd={quickAdd} end={() => endShift(false)} addNote={addNote} />
            )}
            {view === "close" && summary && (
              <CloseShift summary={summary} form={forms.find((f) => f.id === summary.entry.formId)} next={nextShift} rest={labs.rest} restLen={restLen} />
            )}
          </>
        )}
      </div>
      <Footer />
    </div>
  );
}

function ActiveShift({ shift, form, remainingMs, labs, toggle, pause, quickAdd, end, addNote }) {
  const [qa, setQa] = useState("");
  const [note, setNote] = useState("");
  const served = shift.items.filter((i) => i.done).length;
  const total = shift.items.length;
  const visible = labs.hideDone ? shift.items.filter((i) => !i.done) : shift.items;
  const hidden = shift.items.length - visible.length;
  return (
    <>
      <div className="flex items-center justify-between" style={{ marginBottom: 18 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.muted, fontSize: 14 }}>
          <span style={{ width: 9, height: 9, borderRadius: 99, background: form.color }} />{form.name}
        </span>
        <button onClick={end} style={{ background: "none", border: "none", color: C.faint, cursor: "pointer", fontSize: 13 }}>end shift</button>
      </div>
      <div className="flex flex-col items-center" style={{ marginBottom: 22 }}>
        <Ring taskFrac={total ? served / total : 0} timeFrac={shift.totalMs ? remainingMs / shift.totalMs : 0} center={
          <foreignObject x="0" y="0" width="240" height="240">
            <div style={{ width: 240, height: 240, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontFamily: mono, fontSize: 44, color: C.bone, letterSpacing: 1, opacity: shift.paused ? 0.45 : 1 }}>{fmt(remainingMs)}</div>
              <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>served {served}/{total}</div>
            </div>
          </foreignObject>} />
        <button onClick={pause} style={{ marginTop: 8, background: "transparent", border: `1px solid ${C.line}`, color: C.muted, borderRadius: 999, padding: "7px 20px", fontSize: 13.5, cursor: "pointer" }}>{shift.paused ? "resume" : "pause"}</button>
      </div>
      <div>
        {visible.map((it) => (
          <button key={it.id} onClick={() => toggle(it.id)} className="flex items-center" style={{ width: "100%", textAlign: "left", gap: 12, background: it.done ? "transparent" : C.surface, border: `1px solid ${C.line}`, borderRadius: 11, padding: "13px 14px", marginBottom: 8, cursor: "pointer", transition: "all 200ms" }}>
            <span style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, border: `2px solid ${it.done ? C.amber : C.faint}`, background: it.done ? C.amber : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#241c08", fontSize: 13 }}>{it.done ? "✓" : ""}</span>
            <span style={{ flex: 1, fontSize: 15.5, color: it.done ? C.faint : C.bone, textDecoration: it.done ? "line-through" : "none" }}>{it.text}</span>
            {labs.tags && <TagBadge tag={it.tag} />}
          </button>
        ))}
        {hidden > 0 && <div style={{ color: C.faint, fontSize: 12.5, padding: "2px 2px 8px" }}>{hidden} served, tucked away</div>}
      </div>
      {shift.items.length < MAX_QUEUE && (
        <input value={qa} onChange={(e) => setQa(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { quickAdd(qa); setQa(""); } }} placeholder="remembered something? add it" style={{ ...inputStyle, fontSize: 14, width: "100%", boxSizing: "border-box", marginTop: 4 }} />
      )}
      {labs.notes && (
        <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { addNote(note); setNote(""); } }} placeholder="note to self (idea, friction)" style={{ ...inputStyle, fontSize: 14, width: "100%", boxSizing: "border-box", marginTop: 8, borderStyle: "dashed" }} />
      )}
    </>
  );
}

function CloseShift({ summary, form, next, rest, restLen }) {
  const { entry, carried } = summary;
  const [release, setRelease] = useState(false);
  const [restLeft, setRestLeft] = useState(rest ? restLen * 60 : 0);
  const frac = entry.total ? entry.served / entry.total : 0;
  const line = entry.served === entry.total && entry.total > 0 ? "Whole queue cleared. Rest before the next turn."
    : entry.served === 0 ? "Nothing served, and that is allowed. The next shift starts clean."
    : "Solid turn. Take a breath before the next one.";
  useEffect(() => {
    if (!rest) return;
    const id = setInterval(() => setRestLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [rest]);
  return (
    <div className="flex flex-col items-center" style={{ paddingTop: 8 }}>
      <div style={{ fontFamily: serif, fontSize: 22, marginBottom: 4 }}>{entry.byTimer ? "Time complete" : "Shift ended"}</div>
      <div style={{ color: C.muted, fontSize: 13.5, marginBottom: 20, display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 9, height: 9, borderRadius: 99, background: form?.color || C.moss }} />{form?.name}
      </div>
      <Ring taskFrac={frac} timeFrac={null} center={
        <foreignObject x="0" y="0" width="240" height="240">
          <div style={{ width: 240, height: 240, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontFamily: serif, fontSize: 46, color: C.bone }}>{entry.served}<span style={{ color: C.faint, fontSize: 26 }}>/{entry.total}</span></div>
            <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>served</div>
          </div>
        </foreignObject>} />
      <div style={{ color: C.bone, fontSize: 14.5, textAlign: "center", margin: "18px 0 6px", maxWidth: 340, lineHeight: 1.5 }}>{line}</div>
      {rest && <div style={{ color: restLeft > 0 ? C.moss : C.amber, fontFamily: mono, fontSize: 15, marginTop: 4 }}>{restLeft > 0 ? `rest ${fmt(restLeft * 1000)}` : "rested · ready"}</div>}
      {carried.length > 0 && (
        <div style={{ width: "100%", maxWidth: 380, marginTop: 16 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <span style={{ color: C.muted, fontSize: 12.5 }}>{release ? "released" : `${carried.length} carry forward`}</span>
            <button onClick={() => setRelease((v) => !v)} style={{ background: "none", border: "none", color: C.faint, fontSize: 12.5, cursor: "pointer" }}>{release ? "keep them" : "release them"}</button>
          </div>
          {!release && carried.map((c) => <div key={c.id} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 9, padding: "9px 12px", marginBottom: 6, fontSize: 14, color: C.muted }}>{c.text}</div>)}
        </div>
      )}
      <div className="flex" style={{ gap: 10, marginTop: 24, width: "100%", maxWidth: 380 }}>
        <button onClick={() => next(!release && carried.length > 0)} style={{ flex: 1, padding: "13px", borderRadius: 11, border: "none", background: C.amber, color: "#241c08", fontFamily: serif, fontSize: 15.5, fontWeight: 600, cursor: "pointer" }}>Begin next shift</button>
        <button onClick={() => next(false)} style={{ padding: "13px 18px", borderRadius: 11, border: `1px solid ${C.line}`, background: "transparent", color: C.muted, fontSize: 14.5, cursor: "pointer" }}>Done for now</button>
      </div>
    </div>
  );
}

function Grove({ week, forms, log, goal }) {
  const colorOf = (id) => forms.find((f) => f.id === id)?.color || C.moss;
  if (!log.length) return <div style={{ marginTop: 30, color: C.faint, fontSize: 12.5, textAlign: "center" }}>Your shifts will gather here.</div>;
  const pct = goal ? Math.min(100, (week.length / goal) * 100) : 0;
  return (
    <div style={{ marginTop: 30, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
        <span style={{ color: C.muted, fontSize: 12.5 }}>{week.length} shifts this week{goal ? ` of ${goal}` : ""}</span>
      </div>
      {goal > 0 && <div style={{ height: 5, borderRadius: 99, background: C.surface2, marginBottom: 14, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: C.amber, transition: "width 500ms" }} /></div>}
      <div className="flex flex-wrap" style={{ gap: 6 }}>
        {log.slice(0, 24).map((e) => {
          const f = e.total ? e.served / e.total : 0;
          return <span key={e.id} title={`${e.served}/${e.total} · ${e.mins}m`} style={{ width: 18, height: 18, borderRadius: 5, background: C.surface, border: `1px solid ${C.line}`, position: "relative", overflow: "hidden" }}><span style={{ position: "absolute", left: 0, bottom: 0, width: "100%", height: `${f * 100}%`, background: colorOf(e.formId) }} /></span>;
        })}
      </div>
    </div>
  );
}

function NotesBlock({ notes, addNote, setNotes }) {
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  function copyAll() {
    const text = notes.map((n) => "- " + n.text).join("\n");
    try { navigator.clipboard?.writeText(text); } catch { /* ignore */ }
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div style={{ marginTop: 30, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <Label>Field notes</Label>
        {notes.length > 0 && (
          <div className="flex" style={{ gap: 14 }}>
            <button onClick={copyAll} style={{ background: "none", border: "none", color: C.muted, fontSize: 12.5, cursor: "pointer" }}>{copied ? "copied" : "copy all"}</button>
            <button onClick={() => setNotes([])} style={{ background: "none", border: "none", color: C.faint, fontSize: 12.5, cursor: "pointer" }}>clear</button>
          </div>
        )}
      </div>
      <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { addNote(draft); setDraft(""); } }} placeholder="an idea or a snag" style={{ ...inputStyle, width: "100%", boxSizing: "border-box", borderStyle: "dashed", marginBottom: 8 }} />
      {notes.map((n) => <div key={n.id} style={{ color: C.muted, fontSize: 13.5, padding: "6px 2px", borderBottom: `1px solid ${C.line}` }}>{n.text}</div>)}
    </div>
  );
}

function LabsPanel({ labs, setLabs, weeklyGoal, setWeeklyGoal, restLen, setRestLen }) {
  return (
    <div>
      <Label>Labs · optional add-ons</Label>
      <div style={{ color: C.faint, fontSize: 12.5, marginBottom: 16, lineHeight: 1.5 }}>Flip one on, live with it, keep it or drop it. Everything off is the lean core.</div>
      {LAB_INFO.map((l) => (
        <div key={l.key} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 11, padding: 13, marginBottom: 10 }}>
          <div className="flex items-center justify-between" style={{ gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15 }}>{l.name}</div>
              <div style={{ color: C.muted, fontSize: 12.5, marginTop: 3, lineHeight: 1.4 }}>{l.desc}</div>
            </div>
            <Toggle on={labs[l.key]} onClick={() => setLabs((s) => ({ ...s, [l.key]: !s[l.key] }))} />
          </div>
          {l.key === "goal" && labs.goal && (
            <div className="flex items-center" style={{ gap: 8, marginTop: 12 }}>
              <span style={{ color: C.muted, fontSize: 13 }}>target per week</span>
              <input value={weeklyGoal} onChange={(e) => setWeeklyGoal(Number(e.target.value.replace(/\D/g, "")) || 0)} style={{ ...inputStyle, width: 70, flex: "none", padding: "7px 10px" }} />
            </div>
          )}
          {l.key === "rest" && labs.rest && (
            <div className="flex flex-wrap items-center" style={{ gap: 8, marginTop: 12 }}>
              {REST_LENGTHS.map((m) => <Chip key={m} small active={restLen === m} onClick={() => setRestLen(m)}>{m} min</Chip>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// --------------------------- Cadence tab -----------------------------------
function Cadence({ events, setEvents }) {
  const [kind, setKind] = useState("meeting");
  const [label, setLabel] = useState("");
  const [sync, setSync] = useState({ state: "idle", msg: "" });
  const [connected, setConnected] = useState(cal.isConnected());
  const [when, setWhen] = useState("");
  const [targetMode, setTargetMode] = useState("none");
  const [editing, setEditing] = useState(null);

  const pending = events.filter((e) => e.status === "pending").sort((a, b) => a.ts - b.ts);
  const resolved = events.filter((e) => e.status !== "pending");
  const { cur, best } = computeStreak(events);
  const wk = resolved.filter((e) => now() - e.ts < 7 * 864e5);
  const wkGood = wk.filter((e) => GOOD.has(e.status)).length;
  const rate = wk.length ? wkGood / wk.length : 0;

  async function addEvent(k, text) {
    const t = (text || "").trim();
    if (!t) return;
    const id = uid();
    const targetMs = targetMode === "set" ? (when ? Date.parse(when) : undefined) : targetMode === "now" ? now() : undefined;
    setEvents((es) => [...es, { id, kind: k, label: t, status: "pending", ts: now(),
      targetMs, startMs: targetMs, startISO: targetMs ? new Date(targetMs).toISOString() : undefined, source: "manual" }]);
    if (targetMode === "set" && when && cal.isConnected()) {
      try {
        const eventId = await cal.createEvent({
          summary: (k === "kang" ? "Meet Kang: " : k === "deadline" ? "Deadline: " : "") + t,
          startISO: new Date(when).toISOString(),
          description: "[shift] " + KINDS[k].label,
        });
        setEvents((es) => es.map((e) => e.id === id ? { ...e, eventId } : e));
      } catch { /* stays local */ }
    }
    setWhen(""); setTargetMode("none");
  }
  const removeEvent = (id) => setEvents((es) => es.filter((e) => e.id !== id));
  const patchTime = (id, field, val) => setEvents((es) => es.map((e) => e.id === id ? { ...e, [field]: val ? Date.parse(val) : undefined } : e));
  async function mark(id, status) {
    const ev = events.find((e) => e.id === id);
    const doneMs = ev?.doneMs || now();
    setEvents((es) => es.map((e) => e.id === id ? { ...e, status, doneMs } : e));
    if (ev) sync.emit("cadence", `${KINDS[ev.kind].label}: ${ev.label}`, status, { status, delta: fmtDelta(ev.targetMs || ev.startMs, doneMs) });
    if (ev && ev.eventId && cal.isConnected()) {
      const d = fmtDelta(ev.targetMs || ev.startMs, doneMs);
      try { await cal.appendNote(ev.eventId, `[shift] ${KINDS[ev.kind].label} marked: ${status}${d ? " (" + d + ")" : ""}`); } catch { /* offline */ }
    }
  }

  async function syncMeetings() {
    if (!cal.isConfigured()) {
      setSync({ state: "error", msg: "add your Google client ID in src/config.js to enable sync" });
      return;
    }
    if (!cal.isConnected()) {
      try { await cal.connect(); setConnected(true); }
      catch (e) { setSync({ state: "error", msg: e.message || "connect failed" }); return; }
    }
    setSync({ state: "loading", msg: "" });
    const start = new Date(now() - 2 * 864e5).toISOString();
    const end = new Date(now() + 7 * 864e5).toISOString();
    try {
      const items = await cal.listEvents(start, end);
      const existing = new Set(events.filter((e) => e.eventId).map((e) => e.eventId));
      const fresh = items.filter((it) => !existing.has(it.id)).map((it) => ({
        id: uid(), kind: "meeting", label: it.title, status: "pending",
        ts: Date.parse(it.start) || now(), startMs: Date.parse(it.start) || now(),
        startISO: it.start, source: "calendar", eventId: it.id }));
      setEvents((es) => [...es, ...fresh]);
      setSync({ state: "done", msg: fresh.length ? `${fresh.length} pulled in` : "nothing new" });
    } catch (e) {
      setSync({ state: "error", msg: e.message || "couldn't reach the calendar" });
    }
  }

  return (
    <>
      <div className="flex flex-col items-center" style={{ marginBottom: 24 }}>
        <Ring taskFrac={rate} timeFrac={null} center={
          <foreignObject x="0" y="0" width="240" height="240">
            <div style={{ width: 240, height: 240, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontFamily: serif, fontSize: 56, color: cur > 0 ? C.bone : C.muted, lineHeight: 1 }}>{cur}</div>
              <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>in a row</div>
            </div>
          </foreignObject>} />
        <div style={{ color: C.muted, fontSize: 13, marginTop: 8 }}>
          best {best} · this week {wk.length ? Math.round(rate * 100) : 0}% on time
        </div>
      </div>

      {/* pending */}
      <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
        <Label>To mark</Label>
        <div className="flex items-center" style={{ gap: 12 }}>
          {connected && <button onClick={() => { cal.disconnect(); setConnected(false); }} style={{ background: "none", border: "none", color: C.faint, fontSize: 12, cursor: "pointer" }}>disconnect</button>}
          <button onClick={syncMeetings} disabled={sync.state === "loading"} style={{ background: "none", border: `1px solid ${connected ? C.moss : C.line}`, color: connected ? C.bone : C.muted, borderRadius: 999, padding: "5px 13px", fontSize: 12.5, cursor: "pointer" }}>
            {sync.state === "loading" ? "syncing..." : connected ? "sync calendar" : "connect google"}
          </button>
        </div>
      </div>
      {sync.msg && <div style={{ color: sync.state === "error" ? C.rust : C.faint, fontSize: 12.5, marginBottom: 10 }}>{sync.msg}</div>}

      {pending.length === 0 && <div style={{ color: C.faint, fontSize: 13, marginBottom: 14 }}>Nothing waiting. Sync your calendar or add a commitment below.</div>}
      {pending.map((e) => {
        const k = KINDS[e.kind];
        return (
          <div key={e.id} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 11, padding: "11px 13px", marginBottom: 8 }}>
            <div className="flex items-center" style={{ gap: 8, marginBottom: 9 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: k.color, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 15 }}>{e.label}</span>
              {e.startISO && <span style={{ color: C.faint, fontSize: 12 }}>{whenLabel(e.startISO)}</span>}
              <button onClick={() => removeEvent(e.id)} style={{ background: "none", border: "none", color: C.faint, cursor: "pointer", fontSize: 15 }}>×</button>
            </div>
            <div className="flex flex-wrap" style={{ gap: 7 }}>
              {k.statuses.map((s) => (
                <button key={s} onClick={() => mark(e.id, s)} style={{
                  border: `1px solid ${GOOD.has(s) ? C.moss : C.line}`, background: "transparent",
                  color: GOOD.has(s) ? C.bone : C.muted, borderRadius: 999, padding: "5px 13px",
                  fontSize: 13, cursor: "pointer", fontFamily: sans }}>{s}</button>
              ))}
            </div>
          </div>
        );
      })}

      {/* add */}
      <div style={{ marginTop: 18 }}>
        <Label>Log a commitment</Label>
        <div className="flex flex-wrap" style={{ gap: 6, marginBottom: 8 }}>
          {Object.entries(KINDS).map(([key, k]) => (
            <Chip key={key} small active={kind === key} color={k.color} onClick={() => setKind(key)}>{k.label}</Chip>
          ))}
        </div>
        <div className="flex" style={{ gap: 8 }}>
          <input value={label} onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { addEvent(kind, label); setLabel(""); } }}
            placeholder={kind === "kang" ? "where are you meeting Kang?" : kind === "deadline" ? "what did you commit to?" : kind === "focus" ? "the focus block" : "meeting name"}
            style={inputStyle} />
          <button onClick={() => { addEvent(kind, label); setLabel(""); }} style={ghostBtn}>add</button>
        </div>
        <TargetControl mode={targetMode} setMode={setTargetMode} when={when} setWhen={setWhen} />
        {targetMode === "set" && (
          <div style={{ color: C.faint, fontSize: 12, marginTop: 6 }}>
            {connected ? "with a time set, this also lands on your Google calendar" : "connect Google above to also put this on your calendar"}
          </div>
        )}
      </div>

      {/* weekly breakdown */}
      <div style={{ marginTop: 28, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
        <Label>This week</Label>
        {wk.length === 0 ? (
          <div style={{ color: C.faint, fontSize: 12.5 }}>Marked events will gather here.</div>
        ) : (
          <>
            {Object.entries(KINDS).map(([key, k]) => {
              const list = wk.filter((e) => e.kind === key);
              if (!list.length) return null;
              const good = list.filter((e) => GOOD.has(e.status)).length;
              return (
                <div key={key} className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.muted, fontSize: 13.5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 99, background: k.color }} />{k.label}
                  </span>
                  <span style={{ color: C.bone, fontSize: 13.5 }}>{good}/{list.length}</span>
                </div>
              );
            })}
            <div className="flex flex-wrap" style={{ gap: 6, marginTop: 14 }}>
              {resolved.slice(-28).map((e) => (
                <span key={e.id} title={`${KINDS[e.kind].label}: ${e.status}`} style={{ width: 16, height: 16, borderRadius: 5,
                  background: GOOD.has(e.status) ? C.amber : C.rust, opacity: GOOD.has(e.status) ? 1 : 0.7 }} />
              ))}
            </div>
          </>
        )}
      </div>
      {resolved.length > 0 && (
        <div style={{ marginTop: 22, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
          <Label>Recent</Label>
          {resolved.slice().sort((a, b) => (b.doneMs || b.ts) - (a.doneMs || a.ts)).slice(0, 6).map((e) => {
            const target = e.targetMs || e.startMs;
            const d = fmtDelta(target, e.doneMs);
            return (
              <div key={e.id} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", marginBottom: 7 }}>
                <div className="flex items-center" style={{ gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: KINDS[e.kind].color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 14 }}>{e.label}</span>
                  <span style={{ fontSize: 12.5, color: GOOD.has(e.status) ? C.moss : C.rust }}>{e.status}</span>
                </div>
                <div className="flex items-center justify-between" style={{ marginTop: 6 }}>
                  <span style={{ fontSize: 12, color: d ? (d.includes("early") ? C.moss : d.includes("late") ? C.rust : C.faint) : C.faint }}>
                    {e.doneMs ? "done " + whenStamp(e.doneMs) : "no time logged"}{d ? " · " + d : ""}
                  </span>
                  <button onClick={() => setEditing(editing === e.id ? null : e.id)} style={{ background: "none", border: "none", color: C.faint, fontSize: 12, cursor: "pointer" }}>{editing === e.id ? "close" : "edit time"}</button>
                </div>
                {editing === e.id && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ color: C.faint, fontSize: 11.5, marginBottom: 3 }}>target</div>
                    <input type="datetime-local" value={toLocalInput(target)} onChange={(ev) => patchTime(e.id, "targetMs", ev.target.value)} style={{ ...inputStyle, width: "100%", padding: "8px 10px", colorScheme: "dark", marginBottom: 8 }} />
                    <div style={{ color: C.faint, fontSize: 11.5, marginBottom: 3 }}>completed</div>
                    <input type="datetime-local" value={toLocalInput(e.doneMs)} onChange={(ev) => patchTime(e.id, "doneMs", ev.target.value)} style={{ ...inputStyle, width: "100%", padding: "8px 10px", colorScheme: "dark" }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

const REACT_EMOJIS = ["\ud83d\udc4f", "\ud83d\udd25", "\u2764\ufe0f", "\ud83d\udcaa", "\ud83c\udfaf", "\ud83c\udf89"];

function Together({ rewards, setRewards }) {
  const [ready, setReady] = useState(false);
  const [st, setSt] = useState(sync.getState());
  const [email, setEmail] = useState("");
  const [emailed, setEmailed] = useState(false);
  const [code, setCode] = useState("");
  const [invite, setInvite] = useState(null);
  const [feed, setFeed] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [comments, setComments] = useState([]);
  const [draft, setDraft] = useState({});
  const [err, setErr] = useState("");
  const applied = useRef(new Set());
  const configured = sync.configured();

  async function refresh() {
    const [a, r, c] = await Promise.all([sync.listActivity(), sync.listReactions(), sync.listComments()]);
    setFeed(a); setReactions(r); setComments(c);
  }
  async function loadInvite() { try { setInvite(await sync.spaceCode()); } catch { /* ignore */ } }

  useEffect(() => {
    if (!configured) { setReady(true); return; }
    let unsub = () => {};
    (async () => {
      await sync.init();
      setSt({ ...sync.getState() });
      if (sync.getState().space) { await loadInvite(); await refresh(); unsub = sync.subscribe(() => refresh()); }
      setReady(true);
    })();
    sync.onAuth(async (s2) => { setSt({ ...s2 }); if (s2.space) { await loadInvite(); await refresh(); } });
    return () => unsub();
  }, []);

  useEffect(() => {
    const me = st.user?.id;
    feed.forEach((a) => {
      if (a.kind === "reward_request" && a.author === me && a.meta?.status === "released" && !applied.current.has(a.id)) {
        applied.current.add(a.id);
        setRewards((rs) => rs.map((x) => x.id === a.meta.rewardId ? { ...x, redeemed: true, awaiting: false, redeemedAt: Date.now() } : x));
      }
    });
  }, [feed]);

  if (!ready) return <div style={{ color: C.muted, fontSize: 14 }}>Connecting...</div>;
  if (!configured) return (
    <div style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.6 }}>
      Sharing needs a Supabase project. Add your project URL and anon key in src/config.js, run supabase/schema.sql in the SQL editor, then reload. The README has the steps.
    </div>
  );
  if (!st.user) return (
    <div>
      <Label>Sign in</Label>
      <div style={{ color: C.faint, fontSize: 12.5, marginBottom: 12 }}>A one-time magic link, no password.</div>
      <div className="flex" style={{ gap: 8 }}>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email" style={inputStyle} />
        <button onClick={async () => { try { setErr(""); await sync.signIn(email); setEmailed(true); } catch (e) { setErr(e.message); } }} style={ghostBtn}>send link</button>
      </div>
      {emailed && <div style={{ color: C.moss, fontSize: 12.5, marginTop: 8 }}>Check your email for the sign-in link.</div>}
      {err && <div style={{ color: C.rust, fontSize: 12.5, marginTop: 8 }}>{err}</div>}
    </div>
  );
  if (!st.space) return (
    <div>
      <Label>Start a shared space</Label>
      <button onClick={async () => { try { setErr(""); const c = await sync.createSpace(); setInvite(c); setSt({ ...sync.getState() }); await refresh(); } catch (e) { setErr(e.message); } }} style={{ ...ghostBtn, padding: "10px 16px", marginBottom: 20 }}>create a space</button>
      <Label>Or join Kang's</Label>
      <div className="flex" style={{ gap: 8 }}>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="invite code" style={inputStyle} />
        <button onClick={async () => { try { setErr(""); await sync.joinSpace(code); setSt({ ...sync.getState() }); await loadInvite(); await refresh(); } catch (e) { setErr(e.message); } }} style={ghostBtn}>join</button>
      </div>
      {err && <div style={{ color: C.rust, fontSize: 12.5, marginTop: 8 }}>{err}</div>}
    </div>
  );

  const me = st.user.id;
  return (
    <>
      <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
        <span style={{ color: C.muted, fontSize: 13 }}>{st.role === "owner" ? "your space" : "Kang's space"}</span>
        <div className="flex items-center" style={{ gap: 12 }}>
          {invite && <span style={{ color: C.faint, fontSize: 12.5 }}>code <b style={{ color: C.bone }}>{invite}</b></span>}
          <button onClick={async () => { await sync.signOut(); setSt({ ...sync.getState() }); }} style={{ background: "none", border: "none", color: C.faint, fontSize: 12, cursor: "pointer" }}>sign out</button>
        </div>
      </div>
      {feed.length === 0 && <div style={{ color: C.faint, fontSize: 13 }}>No activity yet. Complete a shift or mark an arrival and it shows up here for Kang.</div>}
      {feed.map((a) => {
        const mine = a.author === me;
        const rx = reactions.filter((r) => r.activity_id === a.id);
        const cs = comments.filter((c) => c.activity_id === a.id).sort((x, y) => new Date(x.created_at) - new Date(y.created_at));
        const reward = a.kind === "reward_request";
        return (
          <div key={a.id} style={{ background: C.surface, border: `1px solid ${reward ? C.amber : C.line}`, borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
            <div className="flex items-center" style={{ gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: mine ? C.amber : C.moss }}>{mine ? "You" : "Partner"}</span>
              <span style={{ flex: 1 }} />
              <span style={{ color: C.faint, fontSize: 11.5 }}>{whenStamp(new Date(a.created_at).getTime())}</span>
            </div>
            <div style={{ fontSize: 15 }}>{a.title}</div>
            {a.detail && <div style={{ color: C.muted, fontSize: 13, marginTop: 2 }}>{a.detail}</div>}
            {reward && a.meta?.status !== "released" && !mine && (
              <button onClick={async () => { await sync.approveReward(a.id, { ...a.meta, status: "released" }); refresh(); }} style={{ marginTop: 10, border: "none", borderRadius: 9, padding: "8px 14px", background: C.amber, color: "#241c08", fontFamily: serif, fontWeight: 600, fontSize: 13.5, cursor: "pointer" }}>release this reward</button>
            )}
            {reward && a.meta?.status === "released" && <div style={{ marginTop: 8, color: C.moss, fontSize: 12.5 }}>released</div>}
            {reward && a.meta?.status !== "released" && mine && <div style={{ marginTop: 8, color: C.faint, fontSize: 12.5 }}>waiting on Kang</div>}
            <div className="flex flex-wrap items-center" style={{ gap: 6, marginTop: 10 }}>
              {REACT_EMOJIS.map((em) => {
                const list = rx.filter((r) => r.emoji === em);
                const mineR = list.some((r) => r.user_id === me);
                return (
                  <button key={em} onClick={async () => { if (mineR) await sync.unreact(a.id, em); else await sync.react(a.id, em); refresh(); }} style={{ border: `1px solid ${mineR ? C.amber : C.line}`, background: mineR ? `${C.amber}22` : "transparent", borderRadius: 999, padding: "3px 9px", fontSize: 13, cursor: "pointer" }}>
                    {em}{list.length ? " " + list.length : ""}
                  </button>
                );
              })}
            </div>
            {cs.map((c) => (
              <div key={c.id} style={{ marginTop: 8, fontSize: 13 }}>
                <span style={{ color: c.user_id === me ? C.amber : C.moss }}>{c.user_id === me ? "You" : "Partner"}: </span>
                <span style={{ color: C.bone }}>{c.body}</span>
              </div>
            ))}
            <input value={draft[a.id] || ""} onChange={(e) => setDraft((d) => ({ ...d, [a.id]: e.target.value }))}
              onKeyDown={async (e) => { if (e.key === "Enter" && (draft[a.id] || "").trim()) { await sync.comment(a.id, draft[a.id].trim()); setDraft((d) => ({ ...d, [a.id]: "" })); refresh(); } }}
              placeholder="say something" style={{ ...inputStyle, fontSize: 13, padding: "8px 11px", marginTop: 8, width: "100%", boxSizing: "border-box" }} />
          </div>
        );
      })}
    </>
  );
}

function Footer() {
  const fileRef = useRef(null);
  function doExport() {
    const blob = new Blob([storage.exportJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "shift-backup.json"; a.click();
    URL.revokeObjectURL(url);
  }
  function doImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { try { storage.importJSON(reader.result); location.reload(); } catch { alert("Could not read that backup file."); } };
    reader.readAsText(file);
  }
  return (
    <div style={{ maxWidth: 560, margin: "40px auto 0", borderTop: `1px solid ${C.line}`, paddingTop: 14,
      display: "flex", gap: 18, justifyContent: "center" }}>
      <button onClick={doExport} style={{ background: "none", border: "none", color: C.faint, fontSize: 12.5, cursor: "pointer" }}>export data</button>
      <button onClick={() => fileRef.current?.click()} style={{ background: "none", border: "none", color: C.faint, fontSize: 12.5, cursor: "pointer" }}>import data</button>
      <input ref={fileRef} type="file" accept="application/json" onChange={doImport} style={{ display: "none" }} />
    </div>
  );
}

// --------------------------- Ledger tab ------------------------------------
function Ledger({ skills, setSkills, pointsLog, setPointsLog, rewards, setRewards, manage }) {
  const [skillId, setSkillId] = useState(skills[0]?.id);
  const [custom, setCustom] = useState("");
  const [customPts, setCustomPts] = useState(3);
  const [flash, setFlash] = useState(null);
  const [logMode, setLogMode] = useState("now");
  const [logWhen, setLogWhen] = useState("");

  const earned = pointsLog.reduce((s, p) => s + p.pts, 0);
  const spent = rewards.filter((r) => r.redeemed).reduce((s, r) => s + r.cost, 0);
  const bank = earned - spent;
  const wk = pointsLog.filter((p) => now() - p.ts < 7 * 864e5);
  const wkPts = wk.reduce((s, p) => s + p.pts, 0);

  const nextReward = rewards.filter((r) => !r.redeemed).sort((a, b) => a.cost - b.cost)
    .find((r) => r.cost > bank) || rewards.filter((r) => !r.redeemed).sort((a, b) => b.cost - a.cost)[0];
  const ringFrac = nextReward ? Math.min(1, bank / nextReward.cost) : 1;

  const skill = skills.find((s) => s.id === skillId) || skills[0];

  function earn(sk, repText, pts) {
    const ts = logMode === "set" && logWhen ? Date.parse(logWhen) : now();
    setPointsLog((l) => [...l, { id: uid(), skillId: sk.id, repText, pts, ts }]);
    sync.emit("points", repText, `+${pts} in ${sk.name}`, { pts, skill: sk.name });
    setFlash(`+${pts}`);
    setTimeout(() => setFlash(null), 900);
  }
  const undo = (id) => setPointsLog((l) => l.filter((p) => p.id !== id));
  const redeem = (r) => {
    if (sync.getState().space) {
      sync.emit("reward_request", r.name, `requested release (${r.cost} pts)`, { rewardId: r.id, cost: r.cost, status: "requested" });
      setRewards((rs) => rs.map((x) => x.id === r.id ? { ...x, awaiting: true } : x));
    } else {
      setRewards((rs) => rs.map((x) => x.id === r.id ? { ...x, redeemed: true, redeemedAt: now() } : x));
    }
  };
  const unredeem = (id) => setRewards((rs) => rs.map((r) => r.id === id ? { ...r, redeemed: false } : r));

  // manage helpers
  const patchReward = (id, patch) => setRewards((rs) => rs.map((r) => r.id === id ? { ...r, ...patch } : r));
  const addReward = () => setRewards((rs) => [...rs, { id: uid(), name: "New reward", cost: 50, redeemed: false }]);
  const delReward = (id) => setRewards((rs) => rs.filter((r) => r.id !== id));
  const patchRep = (sid, rid, patch) => setSkills((ss) => ss.map((s) => s.id === sid ? { ...s, reps: s.reps.map((r) => r.id === rid ? { ...r, ...patch } : r) } : s));
  const addRep = (sid) => setSkills((ss) => ss.map((s) => s.id === sid ? { ...s, reps: [...s.reps, { id: uid(), text: "New rep", pts: 1 }] } : s));
  const delRep = (sid, rid) => setSkills((ss) => ss.map((s) => s.id === sid ? { ...s, reps: s.reps.filter((r) => r.id !== rid) } : s));

  if (manage) {
    return (
      <div>
        <Label>Rewards · set with Kang</Label>
        {rewards.map((r) => (
          <div key={r.id} className="flex items-center" style={{ gap: 8, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10, padding: 10, marginBottom: 8 }}>
            <input value={r.name} onChange={(e) => patchReward(r.id, { name: e.target.value })} style={{ ...inputStyle, padding: "8px 10px" }} />
            <input value={r.cost} onChange={(e) => patchReward(r.id, { cost: Number(e.target.value.replace(/\D/g, "")) || 0 })} style={{ ...inputStyle, width: 64, flex: "none", padding: "8px 10px" }} />
            <button onClick={() => delReward(r.id)} style={{ background: "none", border: "none", color: C.faint, cursor: "pointer", fontSize: 17 }}>×</button>
          </div>
        ))}
        <button onClick={addReward} style={{ ...ghostBtn, padding: "9px 16px", marginBottom: 24 }}>+ add reward</button>

        <Label>Skills and point weights</Label>
        {skills.map((s) => (
          <div key={s.id} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 11, padding: 12, marginBottom: 10 }}>
            <div className="flex items-center" style={{ gap: 8, marginBottom: 10 }}>
              <span style={{ width: 9, height: 9, borderRadius: 99, background: s.color }} />
              <span style={{ fontFamily: serif, fontSize: 16 }}>{s.name}</span>
            </div>
            {s.reps.map((r) => (
              <div key={r.id} className="flex items-center" style={{ gap: 8, marginBottom: 7 }}>
                <input value={r.text} onChange={(e) => patchRep(s.id, r.id, { text: e.target.value })} style={{ ...inputStyle, padding: "7px 10px", fontSize: 13.5 }} />
                <select value={r.pts} onChange={(e) => patchRep(s.id, r.id, { pts: Number(e.target.value) })}
                  style={{ background: C.surface2, color: C.bone, border: `1px solid ${C.line}`, borderRadius: 8, padding: "7px 8px", fontSize: 13 }}>
                  {PT_TIERS.map((p) => <option key={p} value={p}>{p} pt</option>)}
                </select>
                <button onClick={() => delRep(s.id, r.id)} style={{ background: "none", border: "none", color: C.faint, cursor: "pointer", fontSize: 16 }}>×</button>
              </div>
            ))}
            <button onClick={() => addRep(s.id)} style={{ background: "none", border: "none", color: C.muted, fontSize: 12.5, cursor: "pointer", marginTop: 2 }}>+ add rep</button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col items-center" style={{ marginBottom: 22 }}>
        <div style={{ position: "relative" }}>
          <Ring taskFrac={ringFrac} timeFrac={null} center={
            <foreignObject x="0" y="0" width="240" height="240">
              <div style={{ width: 240, height: 240, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontFamily: serif, fontSize: 54, color: C.bone, lineHeight: 1 }}>{bank}</div>
                <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>in the bank</div>
              </div>
            </foreignObject>} />
          {flash && <div style={{ position: "absolute", top: 28, left: 0, right: 0, textAlign: "center",
            color: C.amber, fontFamily: serif, fontSize: 22 }}>{flash}</div>}
        </div>
        <div style={{ color: C.muted, fontSize: 13, marginTop: 8 }}>
          +{wkPts} this week{nextReward ? ` · ${Math.max(0, nextReward.cost - bank)} to ${nextReward.name.toLowerCase()}` : ""}
        </div>
      </div>

      <Label>Earn</Label>
      <div className="flex flex-wrap" style={{ gap: 6, marginBottom: 12 }}>
        {skills.map((s) => <Chip key={s.id} small active={skillId === s.id} color={s.color} onClick={() => setSkillId(s.id)}>{s.name}</Chip>)}
      </div>
      {skill?.desc && <div style={{ color: C.faint, fontSize: 12.5, marginBottom: 12, lineHeight: 1.5 }}>{skill.desc}</div>}
      <div className="flex flex-wrap items-center" style={{ gap: 6, marginBottom: 12 }}>
        <span style={{ color: C.faint, fontSize: 12.5, marginRight: 2 }}>logging for</span>
        <Chip small active={logMode === "now"} onClick={() => setLogMode("now")}>now</Chip>
        <Chip small active={logMode === "set"} onClick={() => setLogMode("set")}>set time</Chip>
        {logMode === "set" && (
          <input type="datetime-local" value={logWhen} onChange={(e) => setLogWhen(e.target.value)}
            style={{ ...inputStyle, width: "100%", marginTop: 8, colorScheme: "dark" }} />
        )}
      </div>
      <div style={{ marginBottom: 8 }}>
        {skill?.reps.map((r) => (
          <button key={r.id} onClick={() => earn(skill, r.text, r.pts)} className="flex items-center justify-between"
            style={{ width: "100%", textAlign: "left", gap: 10, background: C.surface, border: `1px solid ${C.line}`,
              borderRadius: 11, padding: "12px 14px", marginBottom: 7, cursor: "pointer", transition: "all 160ms" }}>
            <span style={{ fontSize: 14.5, color: C.bone }}>{r.text}</span>
            <span style={{ flexShrink: 0, color: skill.color, fontFamily: serif, fontSize: 16 }}>+{r.pts}</span>
          </button>
        ))}
      </div>
      <div className="flex" style={{ gap: 8, marginBottom: 26 }}>
        <input value={custom} onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && custom.trim()) { earn(skill, custom.trim(), customPts); setCustom(""); } }}
          placeholder="custom rep" style={{ ...inputStyle, fontSize: 14 }} />
        <select value={customPts} onChange={(e) => setCustomPts(Number(e.target.value))}
          style={{ background: C.surface2, color: C.bone, border: `1px solid ${C.line}`, borderRadius: 10, padding: "0 8px", fontSize: 13 }}>
          {PT_TIERS.map((p) => <option key={p} value={p}>{p} pt</option>)}
        </select>
        <button onClick={() => { if (custom.trim()) { earn(skill, custom.trim(), customPts); setCustom(""); } }} style={ghostBtn}>+</button>
      </div>

      <Label>Rewards</Label>
      {rewards.map((r) => {
        const ready = bank >= r.cost;
        const frac = Math.min(1, bank / r.cost);
        return (
          <div key={r.id} style={{ background: C.surface, border: `1px solid ${r.redeemed ? C.moss : C.line}`, borderRadius: 11, padding: "12px 14px", marginBottom: 8, opacity: r.redeemed ? 0.7 : 1 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 9 }}>
              <span style={{ fontSize: 14.5 }}>{r.name}</span>
              <span style={{ color: C.muted, fontSize: 13 }}>{r.redeemed ? "claimed" : r.awaiting ? "awaiting Kang" : `${bank}/${r.cost}`}</span>
            </div>
            {!r.redeemed && (
              <div style={{ height: 5, borderRadius: 99, background: C.surface2, marginBottom: 10, overflow: "hidden" }}>
                <div style={{ width: `${frac * 100}%`, height: "100%", background: ready ? C.amber : C.faint, transition: "width 500ms" }} />
              </div>
            )}
            {r.redeemed ? (
              <button onClick={() => unredeem(r.id)} style={{ background: "none", border: "none", color: C.faint, fontSize: 12.5, cursor: "pointer" }}>undo</button>
            ) : (
              <button onClick={() => redeem(r)} disabled={!ready || r.awaiting} style={{
                border: "none", borderRadius: 9, padding: "8px 16px", fontSize: 13.5, fontFamily: serif, fontWeight: 600,
                background: (ready && !r.awaiting) ? C.amber : C.surface2, color: (ready && !r.awaiting) ? "#241c08" : C.faint, cursor: (ready && !r.awaiting) ? "pointer" : "default" }}>
                {r.awaiting ? "awaiting Kang" : ready ? "redeem with Kang" : "keep earning"}
              </button>
            )}
          </div>
        );
      })}

      <div style={{ marginTop: 26, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
        <Label>This week by skill</Label>
        {wk.length === 0 ? <div style={{ color: C.faint, fontSize: 12.5 }}>Points you bank will show here.</div> : (
          skills.map((s) => {
            const p = wk.filter((x) => x.skillId === s.id).reduce((a, b) => a + b.pts, 0);
            if (!p) return null;
            return (
              <div key={s.id} className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.muted, fontSize: 13.5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: s.color }} />{s.name}
                </span>
                <span style={{ color: C.bone, fontSize: 13.5 }}>+{p}</span>
              </div>
            );
          })
        )}
        {pointsLog.length > 0 && (
          <>
            <div style={{ color: C.faint, fontSize: 12, marginTop: 14, marginBottom: 6 }}>recent</div>
            {pointsLog.slice(-6).reverse().map((p) => (
              <div key={p.id} className="flex items-center justify-between" style={{ padding: "5px 0", borderBottom: `1px solid ${C.line}` }}>
                <span style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ color: C.muted, fontSize: 13 }}>{p.repText}</span>
                  <span style={{ color: C.faint, fontSize: 11 }}>{whenStamp(p.ts)}</span>
                </span>
                <span className="flex items-center" style={{ gap: 10 }}>
                  <span style={{ color: C.amber, fontSize: 13 }}>+{p.pts}</span>
                  <button onClick={() => undo(p.id)} style={{ background: "none", border: "none", color: C.faint, cursor: "pointer", fontSize: 14 }}>×</button>
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  );
}

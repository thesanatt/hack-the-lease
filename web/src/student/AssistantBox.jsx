// "Tell Quorum": type a change in your own words ("I have a club meeting Thursday 2 to 3 at the Union",
// "drop MATH 216", "book a tour of Broadway on Friday at 5"). With Ollama running on this laptop, the local
// model proposes changes, student/assistant.js checks them, and they are applied with an Undo. Without it,
// the text goes to the rule-based reader as before. Files are attached here too.
import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/index.js';
import { assistantStatus, warmUp } from './assistant.js';
import { applyAssistant } from './applyAssistant.js';

export default function AssistantBox({ api, P, T, saved, pick, msg, askShare = async () => true }) {
  const [ai, setAi] = useState(null);       // null checking, { ok, model }
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState(null);     // { reply, changes: [string], notes: [string], undo }
  const [model, setModel] = useState(null);
  const [secs, setSecs] = useState(0);
  const abortRef = useRef(null);
  const historyRef = useRef([]);   // this conversation, kept while the page is open
  useEffect(() => {
    let live = true;
    assistantStatus().then((s) => { if (!live) return; setAi(s); if (s.ok) { setModel(s.model); warmUp(s.model); } });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!busy) return undefined;
    setSecs(0);
    const t = setInterval(() => setSecs((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);
  const cancel = () => { abortRef.current?.abort(); };

  const run = async () => {
    const t = text.trim();
    if (!t) return;
    if (!(await askShare({ items: [t.length > 80 ? `${t.slice(0, 77)}...` : t] }))) return;
    if (!ai?.ok) { P.addSource('text', t.length > 48 ? `${t.slice(0, 45).trim()}...` : t, t); setText(''); setOut(null); return; }
    setBusy(true); setOut(null);
    try {
      abortRef.current = new AbortController();
      const res = await applyAssistant({ api, P, T, saved, text: t, model: model || ai.model, signal: abortRef.current.signal, history: historyRef.current });
      historyRef.current = [...historyRef.current, res.turn].slice(-6);
      P.addSource('text', t.length > 48 ? `${t.slice(0, 45).trim()}...` : t, t, { viaAI: true });
      setOut(res);
      setText('');
    } catch (e) {
      const msg = e?.name === 'AbortError' ? 'Stopped.' : /timeout/.test(String(e?.message)) ? 'The local model took too long. Try the smaller model (llama3.2:1b) or a shorter request.' : String(e.message || e);
      setOut({ reply: '', changes: [], notes: [msg], undo: null });
    }
    setBusy(false);
  };
  const undo = () => { if (!out?.undo) return; P.replaceEdits(out.undo.edits); T.replace(out.undo.tours); setOut({ ...out, changes: [], notes: ['Undone.'], undo: null }); };

  return (
    <div className="st-card pf-add">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>Tell Quorum</h2>
        <span className={`st-pill ${ai?.ok ? 'mine' : 'typ'}`} title={ai?.ok ? `Running ${ai.model} in Ollama on this laptop` : 'Start Ollama to change your calendar in your own words'}>
          {ai == null ? 'Checking...' : ai.ok ? `Local AI: ${model || ai.model}` : 'Local AI off'}
        </span>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Tell Quorum"
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run(); }}
        placeholder={ai?.ok ? 'Add a meeting, move a class, drop a course, book a tour... e.g. "club meeting Thursday 2 to 3 at the Union"' : 'Anything else: a job, where you study, your budget, links...'} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button variant="primary" small onClick={run} disabled={!text.trim() || busy}>{busy ? `Thinking... ${secs} s` : ai?.ok ? 'Do it' : 'Add'}</Button>
        {busy ? <Button small onClick={cancel}>Cancel</Button> : <Button small onClick={pick}>Attach a file</Button>}
        {ai?.ok && ai.models?.length > 1 && !busy && (
          <select className="st-select" value={model || ''} onChange={(e) => { setModel(e.target.value); warmUp(e.target.value); }} aria-label="Local model">
            {ai.models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
      </div>
      {msg && <p className={`pf-msg${msg.bad ? ' bad' : ''}`}>{msg.text}</p>}
      {ai && !ai.ok && <p className="st-sub">Rules read this box now. For changes in your own words, run Ollama on this laptop (see README).</p>}
      {busy && secs >= 8 && <p className="st-sub">The first answer is slow while the model loads; later ones are faster.</p>}
      {out && (
        <div className="as-out">
          {historyRef.current.length > 1 && <p className="st-sub">You: {historyRef.current[historyRef.current.length - 1].user}</p>}
          {out.reply && <p>{out.reply}</p>}
          {out.changes.length > 0 && <ul>{out.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>}
          {out.notes.map((n, i) => <p key={i} className="st-sub">{n}</p>)}
          {out.undo && out.changes.length > 0 && <button type="button" className="pf-x" onClick={undo}>Undo</button>}
        </div>
      )}
    </div>
  );
}

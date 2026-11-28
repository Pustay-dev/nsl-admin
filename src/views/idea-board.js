import htm from '../../vendor/htm.mjs';
import { h, Icon, useEffect, useRef, useState } from '../ui.js';
import { rpc } from '../api.js';

const html = htm.bind(h);
const kinds = { idea: 'Nápad', task: 'Úkol' };
const priorities = ['Nízká', 'Běžná', 'Vysoká'];
const newCard = { title: '', note: '', kind: 'idea', priority: 1 };

function Priority({ value, onChange, label, disabled, saved }) {
  return html`<select aria-label=${label} value=${value} disabled=${disabled}
    onChange=${e => {
      const next = Number(e.currentTarget.value);
      if (saved) e.currentTarget.value = String(value);
      onChange(next);
    }}>
    ${priorities.map((name, index) => html`<option key=${name} value=${index}>${name}</option>`)}
  </select>`;
}

function Cards({ items, busy, update }) {
  return html`<ul class="idea-cards">${items.map(item => html`
    <li key=${item.id} class="idea-card" data-priority=${item.priority} data-done=${String(item.done)}>
      <div class="idea-card-head">
        <input type="checkbox" checked=${item.done} disabled=${busy}
          aria-label=${(item.done ? 'Znovu otevřít: ' : 'Označit jako hotové: ') + item.title}
          onChange=${event => {
            event.currentTarget.checked = item.done;
            update(item.id, { p_done: !item.done });
          }}/>
        <span class="idea-kind" data-kind=${item.kind}>${kinds[item.kind]}</span>
      </div>
      <h3>${item.title}</h3>
      ${item.note && html`<p>${item.note}</p>`}
      <label class="idea-card-priority">Priorita
        <${Priority} value=${item.priority} disabled=${busy} saved=${true} label=${'Priorita: ' + item.title}
          onChange=${priority => update(item.id, { p_priority: priority })}/>
      </label>
    </li>`)}</ul>`;
}

export function IdeaBoard() {
  const [items, setItems] = useState(null);
  const [draft, setDraft] = useState(newCard);
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const running = useRef(false);
  const requestId = useRef(null);
  const titleInput = useRef(null);

  async function run(action, failure) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      await action();
      return true;
    } catch {
      setError(failure);
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  const load = () => run(async () => setItems(await rpc('admin_idea_board_list')),
    'Nástěnku se nepodařilo načíst. Zkuste ji obnovit.');
  useEffect(() => { load(); }, []);

  const change = (field, value) => {
    requestId.current = null;
    setDraft(previous => ({ ...previous, [field]: value }));
  };
  const put = card => setItems(previous => [...previous.filter(item => item.id !== card.id), card]);
  const add = async event => {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title || items === null) return;
    const saved = await run(async () => {
      requestId.current ??= crypto.randomUUID();
      put(await rpc('admin_idea_board_add', {
        p_id: requestId.current, p_title: title, p_note: draft.note.trim(),
        p_kind: draft.kind, p_priority: draft.priority,
      }));
      requestId.current = null;
      setDraft(previous => ({ ...previous, title: '', note: '' }));
      setFilter('all');
      setFeedback('Přidáno na nástěnku.');
    }, 'Kartu se nepodařilo uložit. Text zůstal ve formuláři.');
    if (saved) requestAnimationFrame(() => titleInput.current?.focus());
  };
  const update = (id, changes) => run(async () => {
    put(await rpc('admin_idea_board_update', { p_id: id, ...changes }));
    setFeedback(changes.p_done === true ? 'Hotovo!' : changes.p_done === false ? 'Karta je znovu otevřená.' : 'Priorita uložena.');
  }, 'Změnu se nepodařilo uložit. Zkuste to znovu.');

  const visible = (items || []).filter(item => filter === 'all' || item.kind === filter);
  const active = visible.filter(item => !item.done).sort((a, b) => b.priority - a.priority || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  const done = visible.filter(item => item.done).sort((a, b) => b.completed_at.localeCompare(a.completed_at) || b.id.localeCompare(a.id));

  return html`<div class="page idea-board" lang="cs">
    <header class="idea-board-header">
      <div><a class="idea-back" href="#/overview">← Přehled</a><h1>Nástěnka nápadů</h1>
        <p class="dim">Co zkusit, co udělat a co už máme hotové.</p></div>
      <button type="button" class="btn sm" disabled=${busy} onClick=${load}><${Icon} n="refresh" s="14"/>Obnovit</button>
    </header>

    <form class="card idea-compose" onSubmit=${add}>
      <fieldset disabled=${busy || items === null}>
        <legend>Připnout na nástěnku</legend>
        <label for="idea-title">Název</label>
        <input id="idea-title" ref=${titleInput} value=${draft.title} maxlength="120" required
          placeholder="Co tě napadlo?" onInput=${e => change('title', e.currentTarget.value)}/>
        <label for="idea-note">Poznámka <span class="dim">(volitelně)</span></label>
        <textarea id="idea-note" rows="2" maxlength="1000" value=${draft.note}
          onInput=${e => change('note', e.currentTarget.value)}></textarea>
        <div class="idea-compose-actions">
          <label>Typ<select aria-label="Typ karty" value=${draft.kind} onChange=${e => change('kind', e.currentTarget.value)}>
            <option value="idea">Nápad</option><option value="task">Úkol</option>
          </select></label>
          <label>Priorita<${Priority} value=${draft.priority} label="Priorita nové karty" onChange=${value => change('priority', value)}/></label>
          <button class="btn primary" type="submit" disabled=${!draft.title.trim()}><${Icon} n="plus"/>Přidat kartu</button>
        </div>
      </fieldset>
    </form>

    ${error && html`<p class="idea-message" role="alert">${error}</p>`}
    <div class="idea-feedback" role="status">${feedback || (busy && items === null ? 'Načítám nástěnku…' : '')}</div>

    ${items !== null && html`<section aria-labelledby="idea-active">
      <div class="idea-section-head"><h2 id="idea-active">Otevřené <span>${active.length}</span></h2>
        <div class="seg" role="group" aria-label="Filtrovat karty">
          ${Object.entries({ all: 'Vše', idea: 'Nápady', task: 'Úkoly' }).map(([key, label]) => html`
            <button type="button" key=${key} aria-pressed=${filter === key} onClick=${() => setFilter(key)}>${label}</button>`)}
        </div>
      </div>
      ${active.length ? html`<${Cards} items=${active} busy=${busy} update=${update}/>`
        : html`<p class="idea-empty dim">${filter === 'all' ? 'Je tu místo pro první otevřenou kartu.' : 'V této skupině nejsou žádné otevřené karty.'}</p>`}
      <details class="idea-completed">
        <summary>Hotovo <span>${done.length}</span></summary>
        ${done.length ? html`<${Cards} items=${done} busy=${busy} update=${update}/>`
          : html`<p class="idea-empty dim">Odškrtnuté karty se objeví tady.</p>`}
      </details>
    </section>`}
  </div>`;
}

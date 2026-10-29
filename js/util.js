// Utilidades compartidas: DOM, fechas, formato y hojas inferiores.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---------- Fechas ----------
const pad = n => String(n).padStart(2, '0');
export const toISODate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hoyISO = () => toISODate(new Date());
export function parseISODate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(iso, n) { const d = parseISODate(iso); d.setDate(d.getDate() + n); return toISODate(d); }
// Lunes = 0 … Domingo = 6
export const weekday = iso => (parseISODate(iso).getDay() + 6) % 7;
export const weekStart = iso => addDays(iso, -weekday(iso));
export const weekDates = iso => { const s = weekStart(iso); return [0, 1, 2, 3, 4, 5, 6].map(i => addDays(s, i)); };
export const monthKey = iso => iso.slice(0, 7);
export function daysInMonth(mk) { const [y, m] = mk.split('-').map(Number); return new Date(y, m, 0).getDate(); }
export function prevMonthKey(mk, n = 1) { const [y, m] = mk.split('-').map(Number); const d = new Date(y, m - 1 - n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
export function diasEntre(a, b) { return Math.round((parseISODate(b) - parseISODate(a)) / 86400000); }

export const toMin = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export const toHHMM = min => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
export const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const DIAS_CORTO = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export function fmtFecha(iso, opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
  const s = parseISODate(iso).toLocaleDateString('es-ES', opts);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ISO con zona horaria local, que Atajos interpreta sin ambigüedad.
export function isoLocal(fechaISO, hhmm) {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const dt = new Date(y, m - 1, d, h, mi);
  const off = -dt.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return `${fechaISO}T${pad(h)}:${pad(mi)}:00${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
}

// ---------- Formato ----------
const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
const eur0 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
export const fmtEur = (n, redondo = false) => (redondo ? eur0 : eur).format(n || 0);
export const fmtHoras = min => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`; };
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export const sum = (arr, f = x => x) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);

// ---------- UI ----------
// Pide a la app que vuelva a pintar la pantalla actual.
export const refrescar = () => window.dispatchEvent(new Event('refrescar'));

export function toast(msg, ms = 2600) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}

// Hoja inferior estilo iOS. Devuelve { el, close }.
export function sheet(titulo, html, { onClose } = {}) {
  const back = document.createElement('div');
  back.className = 'sheet-back';
  back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">
    <div class="sheet-head"><h2>${esc(titulo)}</h2>
    <button class="btn-icon sheet-close" aria-label="Cerrar">✕</button></div>
    <div class="sheet-body">${html}</div></div>`;
  document.body.appendChild(back);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => back.classList.add('open'));
  let cerrada = false;
  const close = () => {
    if (cerrada) return;
    cerrada = true;
    back.classList.remove('open');
    if (document.querySelectorAll('.sheet-back').length <= 1) document.body.classList.remove('no-scroll');
    setTimeout(() => back.remove(), 250);
    onClose?.();
  };
  back.addEventListener('click', e => { if (e.target === back) close(); });
  back.querySelector('.sheet-close').addEventListener('click', close);
  return { el: back.querySelector('.sheet-body'), close };
}

export function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'number') o[el.name] = el.value === '' ? null : Number(el.value);
    else o[el.name] = el.value.trim();
  }
  return o;
}

export const opciones = (lista, sel) => lista.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(t)}</option>`).join('');

// Markdown mínimo para la guía (títulos, listas, negrita, código, citas, párrafos).
export function miniMarkdown(md) {
  const inline = s => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  let html = '';
  const pila = []; // listas abiertas: { tipo, sangria }
  const cima = () => pila[pila.length - 1];
  const cerrarLista = () => { html += `</li></${pila.pop().tipo}>`; };
  const cerrarTodo = () => { while (pila.length) cerrarLista(); };
  for (const raw of md.split('\n')) {
    const l = raw.trimEnd();
    let m;
    if ((m = l.match(/^(\s*)(\d+\.|[-*])\s+(.*)/))) {
      const sangria = m[1].length, tipo = /\d/.test(m[2]) ? 'ol' : 'ul';
      while (pila.length && cima().sangria > sangria) cerrarLista();
      if (pila.length && cima().sangria === sangria && cima().tipo === tipo) html += '</li>';
      else {
        if (pila.length && cima().sangria === sangria) cerrarLista();
        html += `<${tipo}>`;
        pila.push({ tipo, sangria });
      }
      html += `<li>${inline(m[3])}`;
    }
    else if ((m = l.match(/^(#{1,4})\s+(.*)/))) { cerrarTodo(); const n = Math.min(m[1].length + 1, 4); html += `<h${n}>${inline(m[2])}</h${n}>`; }
    else if (l.startsWith('>')) { cerrarTodo(); html += `<p class="nota">${inline(l.replace(/^>\s?/, ''))}</p>`; }
    else if (l === '') cerrarTodo();
    else { cerrarTodo(); html += `<p>${inline(l)}</p>`; }
  }
  cerrarTodo();
  return html;
}

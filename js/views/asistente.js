// Pantalla «Asistente»: chat con el asistente propio (sin IA). Ejecuta órdenes al momento y se pueden deshacer.
import { db } from '../db.js';
import { esc, toast, uid, miniMarkdown, $ } from '../util.js';
import { entender, ejecutar, deshacer, mensajesProactivos } from '../agente.js';

const SUGERENCIAS = [
  ['📅 ¿Qué me toca hoy?', '¿Qué me toca hoy?'], ['✅ Ya lo he hecho', 'Ya lo he hecho'], ['😮‍💨 Hoy no puedo', 'Hoy no puedo'],
  ['📈 ¿Cómo voy?', '¿Cómo voy?'], ['😴 No tengo ganas', 'No tengo ganas'], ['❓ Ayuda', 'ayuda'],
];
const MAX_MENSAJES = 80;

async function historial() {
  const todos = (await db.all('chat')).sort((a, b) => a.ts - b.ts);
  // Los mensajes del antiguo coach con Gemini se borran: ahora el chat es del asistente.
  const viejos = todos.filter(m => !m.agente);
  if (viejos.length) await db.delMany('chat', viejos.map(m => m.id));
  const propios = todos.filter(m => m.agente);
  if (propios.length > MAX_MENSAJES) await db.delMany('chat', propios.slice(0, propios.length - MAX_MENSAJES).map(m => m.id));
  return propios.slice(-MAX_MENSAJES);
}

const guardar = m => db.put('chat', { agente: true, ts: Date.now(), ...m, id: m.id || uid() });

/** Responde a un texto escrito por el usuario. Devuelve el mensaje del asistente (ya guardado). */
export async function responder(texto) {
  await guardar({ rol: 'user', texto });
  return responderOrden(entender(texto));
}

async function responderOrden(orden) {
  let r;
  try { r = await ejecutar(orden); } catch (e) { console.error(e); r = { texto: `Algo ha fallado al hacerlo: ${e.message}` }; }
  const m = { id: uid(), rol: 'agente', texto: r.texto, botones: r.botones || [], ops: r.ops, ts: Date.now() };
  await guardar(m);
  return m;
}

export function mensajeHTML(m) {
  if (m.rol === 'user') return `<div class="msg user">${esc(m.texto)}</div>`;
  const botones = !m.botonesUsados && m.botones?.length
    ? `<div class="acciones">${m.botones.map((b, i) => `<button class="btn sec chico" data-boton="${i}">${esc(b.etiqueta)}</button>`).join('')}</div>` : '';
  const undo = m.ops && !m.deshecho ? '<button class="btn-deshacer" data-deshacer>↩️ Deshacer</button>' : m.deshecho ? '<span class="mini">↩️ Deshecho</span>' : '';
  return `<div class="msg model" data-msg="${m.id}">${miniMarkdown(m.texto)}${botones}${undo ? `<div style="margin-top:6px">${undo}</div>` : ''}</div>`;
}

/**
 * Conecta botones y «Deshacer» de los mensajes dentro de `cont`.
 * alResponder recibe cada respuesta nueva; alDeshacer se llama tras deshacer (para repintar otra pantalla).
 */
export function conectarMensajes(cont, mensajes, alResponder, alDeshacer = null) {
  cont.querySelectorAll('[data-msg]').forEach(div => {
    if (div.dataset.conectado) return;
    div.dataset.conectado = '1';
    const m = mensajes.find(x => x.id === div.dataset.msg);
    if (!m) return;
    div.querySelectorAll('[data-boton]').forEach(btn => btn.addEventListener('click', async () => {
      const { orden } = m.botones[btn.dataset.boton];
      m.botonesUsados = true;
      await db.put('chat', m);
      div.outerHTML = mensajeHTML(m);
      conectarMensajes(cont, mensajes, alResponder, alDeshacer);
      if (orden.tipo === 'ir') { location.hash = orden.destino; return; }
      alResponder(await responderOrden({ texto: '', ...orden }));
    }));
    div.querySelector('[data-deshacer]')?.addEventListener('click', async () => {
      await deshacer(m.ops);
      m.deshecho = true;
      await db.put('chat', m);
      div.outerHTML = mensajeHTML(m);
      conectarMensajes(cont, mensajes, alResponder, alDeshacer);
      toast('↩️ Deshecho');
      alDeshacer?.();
    });
  });
}

let ocupado = false;

export async function render(root) {
  const mensajes = await historial();
  root.innerHTML = `
    <div class="chat" id="chat">${mensajes.map(mensajeHTML).join('')}</div>
    <div class="entrada">
      <div class="chips">${SUGERENCIAS.map(([t], i) => `<button class="chip" data-sug="${i}">${t}</button>`).join('')}</div>
      <form id="form"><textarea name="texto" rows="1" placeholder="Escríbeme: «pásalo a mañana», «he gastado 5 € en café»…" enterkeyhint="send"></textarea>
        <button class="btn" aria-label="Enviar">↑</button></form>
    </div>`;
  const chat = $('#chat', root), form = $('#form', root), ta = form.texto;
  const bajar = () => requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
  const anadir = m => { mensajes.push(m); chat.insertAdjacentHTML('beforeend', mensajeHTML(m)); conectarMensajes(chat, mensajes, anadir); bajar(); };
  conectarMensajes(chat, mensajes, anadir);

  // Lo que el asistente cuenta solo al abrirlo: el plan del día, lo que quedó sin hacer y el resumen de la noche.
  for (const r of await mensajesProactivos()) {
    const m = { id: uid(), rol: 'agente', texto: r.texto, botones: r.botones || [], ts: Date.now() };
    await guardar(m);
    anadir(m);
  }
  if (!mensajes.length) anadir(await responderOrden({ tipo: 'ayuda', texto: '' }));
  bajar();

  async function enviar(texto) {
    texto = texto.trim();
    if (!texto || ocupado) return;
    ocupado = true;
    try {
      anadir({ id: uid(), rol: 'user', texto });
      const m = await responder(texto);
      anadir(m);
    } finally { ocupado = false; }
  }
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', e => { e.preventDefault(); enviar(ta.value); ta.value = ''; ta.style.height = 'auto'; });
  root.querySelectorAll('[data-sug]').forEach(b => b.addEventListener('click', () => enviar(SUGERENCIAS[b.dataset.sug][1])));

  // Texto que llega desde otra pantalla (#asistente?texto=…): se deja escrito para revisarlo y enviarlo.
  const previo = new URLSearchParams(location.hash.split('?')[1] || '').get('texto');
  if (previo) { history.replaceState(null, '', '#asistente'); ta.value = previo; }
}

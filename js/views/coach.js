// Pantalla «Coach»: chat con Gemini, con acciones que el usuario confirma.
import { db } from '../db.js';
import { getSettings, getProfile } from '../datos.js';
import { esc, toast, uid, miniMarkdown, $ } from '../util.js';
import { chatStream, describirAccion, aplicarAccion, ErrorIA } from '../coach.js';
import { abrirPeticionHorario } from './horario.js';

const SUGERENCIAS = [
  ['🤔 No sé por dónde empezar', 'No sé por dónde empezar hoy. ¿Qué hago primero?'],
  ['😮‍💨 Hoy no tengo ganas', 'Hoy no tengo nada de ganas. Ayúdame a arrancar aunque sea con algo pequeño.'],
  ['📋 Revisa mi semana', 'Revisa mi semana: ¿cómo voy con mis objetivos y qué debería ajustar?'],
  ['⏱️ Tengo 1 h libre', 'Tengo 1 hora libre ahora mismo. ¿Qué es lo mejor que puedo hacer con ella?'],
  ['📅 Hazme el horario', null],
  ['💰 ¿Cómo ahorro más?', '¿Cómo puedo ahorrar más este mes según mis datos?'],
];

let enCurso = null;

export async function render(root) {
  const [settings, perfil, mensajes] = await Promise.all([getSettings(), getProfile(), db.all('chat')]);
  mensajes.sort((a, b) => a.ts - b.ts);

  if (!settings.apiKey) {
    root.innerHTML = `<div class="card vacio"><span class="ico">🤖</span>
      <b>Activa tu coach</b><p class="sub" style="margin-top:6px">Para hablar con tu coach necesitas tu API key gratuita de Gemini. Pégala en Ajustes y listo.</p>
      <div class="acciones" style="justify-content:center"><a class="btn" href="#perfil">Ir a Ajustes</a></div></div>`;
    return;
  }

  root.innerHTML = `
    ${mensajes.length ? '<div style="text-align:right;margin-bottom:8px"><button class="btn gris chico" id="limpiar">🧹 Borrar conversación</button></div>' : ''}
    <div class="chat" id="chat">
      <div class="msg model">¡Hola${perfil.nombre ? `, ${esc(perfil.nombre)}` : ''}! 👋 Soy tu coach. Conozco tus objetivos, tu horario y tu ahorro.
      Cuéntame qué necesitas: cómo empezar algo, organizar tu día, motivación o cómo ahorrar más.</div>
      ${mensajes.map(mensajeHTML).join('')}
    </div>
    <div class="entrada">
      <div class="chips">${SUGERENCIAS.map(([t], i) => `<button class="chip" data-sug="${i}">${t}</button>`).join('')}</div>
      <form id="form"><textarea name="texto" rows="1" placeholder="Escribe a tu coach…" enterkeyhint="send"></textarea>
        <button class="btn" aria-label="Enviar">↑</button></form>
    </div>`;

  const chat = $('#chat', root), form = $('#form', root), ta = form.texto;
  conectarAcciones(chat, mensajes);
  bajar();

  // Texto que llega desde otra pantalla (#coach?texto=…): se deja escrito para que lo revises y lo envíes.
  const previo = new URLSearchParams(location.hash.split('?')[1] || '').get('texto');
  if (previo) {
    history.replaceState(null, '', '#coach');
    ta.value = previo;
    requestAnimationFrame(() => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; });
  }

  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', e => { e.preventDefault(); enviar(ta.value); ta.value = ''; ta.style.height = 'auto'; });
  root.querySelectorAll('[data-sug]').forEach(b => b.addEventListener('click', () => {
    const [, texto] = SUGERENCIAS[b.dataset.sug];
    if (texto) enviar(texto); else abrirPeticionHorario();
  }));
  $('#limpiar', root)?.addEventListener('click', async () => {
    if (!confirm('¿Borrar toda la conversación con el coach?')) return;
    await db.clear('chat');
    render(root);
  });

  async function enviar(texto) {
    texto = texto.trim();
    if (!texto || enCurso) return;
    const msgUser = { id: uid(), rol: 'user', texto, ts: Date.now() };
    await db.put('chat', msgUser);
    mensajes.push(msgUser);
    chat.insertAdjacentHTML('beforeend', mensajeHTML(msgUser));
    const burbuja = document.createElement('div');
    burbuja.className = 'msg model';
    burbuja.innerHTML = '<span class="escribiendo"><span></span><span></span><span></span></span>';
    chat.appendChild(burbuja);
    bajar();

    enCurso = new AbortController();
    try {
      const { texto: resp, acciones } = await chatStream(mensajes, {
        signal: enCurso.signal,
        onTexto: t => { burbuja.innerHTML = miniMarkdown(t); bajar(); },
      });
      const msgModel = { id: uid(), rol: 'model', texto: resp, acciones, ts: Date.now() };
      await db.put('chat', msgModel);
      mensajes.push(msgModel);
      burbuja.outerHTML = mensajeHTML(msgModel);
      conectarAcciones(chat, mensajes);
      bajar();
    } catch (e) {
      burbuja.className = 'msg error';
      burbuja.textContent = e instanceof ErrorIA ? e.message : 'No se pudo obtener respuesta. Revisa tu conexión e inténtalo de nuevo.';
      console.error(e);
    } finally {
      enCurso = null;
    }
  }
}

function bajar() { requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })); }

function mensajeHTML(m) {
  if (m.rol === 'user') return `<div class="msg user">${esc(m.texto)}</div>`;
  return `<div class="msg model" data-msg="${m.id}">${m.texto ? miniMarkdown(m.texto) : ''}
    ${(m.acciones || []).map(accionHTML).join('')}</div>`;
}

function accionHTML(a) {
  return `<div class="accion ${a.estado}" data-accion="${a.id}">
    <div>${esc(describirAccion(a))}</div>
    ${a.estado === 'pendiente' ? `<div class="acciones"><button class="btn verde chico" data-aplicar>Aplicar</button><button class="btn gris chico" data-descartar>Descartar</button></div>`
      : `<div class="mini">${a.estado === 'aplicada' ? '✓ Aplicada' : a.estado === 'error' ? `⚠️ ${esc(a.error || 'No se pudo aplicar')}` : 'Descartada'}</div>`}
  </div>`;
}

function conectarAcciones(chat, mensajes) {
  chat.querySelectorAll('.accion.pendiente').forEach(div => {
    if (div.dataset.conectado) return;
    div.dataset.conectado = '1';
    const msgId = div.closest('[data-msg]').dataset.msg;
    const resolver = async aplicar => {
      const m = mensajes.find(x => x.id === msgId);
      const a = m.acciones.find(x => x.id === div.dataset.accion);
      if (aplicar) {
        try { await aplicarAccion(a); a.estado = 'aplicada'; toast('✓ Hecho'); }
        catch (e) { a.estado = 'error'; a.error = e.message; }
      } else a.estado = 'descartada';
      await db.put('chat', m);
      div.outerHTML = accionHTML(a);
    };
    div.querySelector('[data-aplicar]').addEventListener('click', () => resolver(true));
    div.querySelector('[data-descartar]').addEventListener('click', () => resolver(false));
  });
}

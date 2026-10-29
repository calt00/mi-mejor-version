// Piezas compartidas entre pantallas: bloques, editor, envío al iPhone, rachas y datos de ahorro.
import { db, kvGet } from '../db.js';
import { getIngresos, areaColor, getSettings } from '../datos.js';
import { esc, sheet, formData, toast, refrescar, hoyISO, addDays, toMin, toHHMM, nowMin, fmtFecha, uid, opciones } from '../util.js';
import { prepararEnvio, abrirAtajo } from '../iphone.js';
import { esImportante } from '../scheduler.js';

export const duracionMin = b => toMin(b.fin) - toMin(b.inicio);

export function racha(h, hoy = hoyISO()) {
  let n = 0, d = h.registros.includes(hoy) ? hoy : addDays(hoy, -1);
  while (h.registros.includes(d)) { n++; d = addDays(d, -1); }
  return n;
}

export async function datosFinanzas() {
  const [ingresos, fixed, expenses, savingsGoals, contributions, reto, sobrantesRepartidos, inicioApp] = await Promise.all([
    getIngresos(), db.all('fixedExpenses'), db.all('expenses'), db.all('savingsGoals'), db.all('contributions'),
    kvGet('reto'), kvGet('sobrantesRepartidos', []), kvGet('inicioApp'),
  ]);
  return { hoy: hoyISO(), ingresos, fixed, expenses, savingsGoals, contributions, reto, sobrantesRepartidos, inicioApp };
}

// Estado del bloque respecto a la hora actual: 'pasado' | 'ahora' | 'futuro'.
export function momentoBloque(b) {
  const hoy = hoyISO();
  if (b.fecha < hoy) return 'pasado';
  if (b.fecha > hoy) return 'futuro';
  const n = nowMin();
  if (n >= toMin(b.fin)) return 'pasado';
  if (n >= toMin(b.inicio)) return 'ahora';
  return 'futuro';
}

export function bloqueHTML(b, goalsById = {}) {
  const g = goalsById[b.goalId];
  const m = momentoBloque(b);
  return `<div class="bloque ${b.hecho ? 'hecho' : ''} ${m === 'ahora' && !b.hecho ? 'ahora' : ''}" data-bloque="${b.id}" style="--c:${g ? areaColor(g.area) : 'var(--text3)'}">
    <div class="hora"><b>${b.inicio}</b>${b.fin}</div>
    <div class="grow">
      ${m === 'ahora' && !b.hecho ? '<div class="etiqueta-ahora">Ahora</div>' : ''}
      <div class="t">${esc(b.titulo)}</div>
      ${b.frase ? `<div class="frase">«${esc(b.frase)}»</div>` : ''}
      ${b.importante || b.fijado ? `<div class="tags">${b.importante ? '<span class="badge naranja">⏰ Alarma</span>' : ''}${b.fijado ? '<span class="badge">📌 Fijado</span>' : ''}</div>` : ''}
    </div>
    <button class="check ${b.hecho ? 'on' : ''}" data-hecho="${b.id}" aria-label="${b.hecho ? 'Marcar como pendiente' : 'Marcar como hecho'}">${b.hecho ? '✓' : ''}</button>
  </div>`;
}

// Conecta los clics de una lista de bloques (marcar hecho / abrir editor).
export function conectarBloques(root, bloques) {
  root.querySelectorAll('[data-hecho]').forEach(btn => btn.addEventListener('click', async e => {
    e.stopPropagation();
    const b = bloques.find(x => x.id === btn.dataset.hecho);
    await db.put('blocks', { ...b, hecho: !b.hecho });
    if (!b.hecho) { navigator.vibrate?.(30); toast('¡Hecho! Un paso más. 💪'); }
    refrescar();
  }));
  root.querySelectorAll('[data-bloque]').forEach(el => el.addEventListener('click', () => {
    abrirEditorBloque(bloques.find(x => x.id === el.dataset.bloque));
  }));
}

export async function abrirEditorBloque(b, { fecha } = {}) {
  const goals = (await db.all('goals')).filter(g => !g.archivado);
  const settings = await getSettings();
  const nuevo = !b;
  const base = b || { fecha: fecha || hoyISO(), inicio: toHHMM(Math.min(Math.ceil((nowMin() + 1) / 30) * 30, 1380)), fin: '', titulo: '', goalId: '', importante: false, fijado: true, hecho: false };
  if (!base.fin) base.fin = toHHMM(Math.min(toMin(base.inicio) + 60, 1439));
  const { el, close } = sheet(nuevo ? 'Nuevo bloque' : 'Editar bloque', `
    <form>
      <label class="campo"><span>Qué vas a hacer</span><input name="titulo" required value="${esc(base.titulo)}" placeholder="Ej.: Estudiar inglés"></label>
      <label class="campo"><span>Objetivo</span><select name="goalId"><option value="">— Ninguno —</option>${opciones(goals.map(g => [g.id, g.titulo]), base.goalId)}</select></label>
      <label class="campo"><span>Día</span><input type="date" name="fecha" required value="${base.fecha}"></label>
      <div class="grid2">
        <label class="campo"><span>Inicio</span><input type="time" name="inicio" required value="${base.inicio}"></label>
        <label class="campo"><span>Fin</span><input type="time" name="fin" required value="${base.fin}"></label>
      </div>
      <label class="switch"><span>⏰ Alarma sonora (importante)</span><input type="checkbox" name="importante" ${base.importante ? 'checked' : ''}></label>
      <label class="switch"><span>📌 Fijado (no se mueve al regenerar)</span><input type="checkbox" name="fijado" ${base.fijado ? 'checked' : ''}></label>
      ${!nuevo ? `<label class="switch"><span>✅ Hecho</span><input type="checkbox" name="hecho" ${base.hecho ? 'checked' : ''}></label>` : ''}
      ${b?.frase ? `<p class="nota">«${esc(b.frase)}»</p>` : ''}
      <button class="btn ancho" type="submit">${nuevo ? 'Añadir bloque' : 'Guardar cambios'}</button>
      ${!nuevo ? `<div class="acciones">
        <button type="button" class="btn gris chico" data-pos="30">+30 min</button>
        <button type="button" class="btn gris chico" data-pos="60">+1 h</button>
        <button type="button" class="btn gris chico" data-manana>Pasar a mañana</button>
        <button type="button" class="btn peligro chico" data-borrar>Borrar</button>
      </div>` : ''}
    </form>`);
  const form = el.querySelector('form');
  form.goalId.addEventListener('change', () => {
    const g = goals.find(x => x.id === form.goalId.value);
    if (g && !form.titulo.value) form.titulo.value = g.titulo;
    if (g && nuevo) form.importante.checked = esImportante(g, settings);
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const d = formData(form);
    if (toMin(d.fin) <= toMin(d.inicio)) return toast('La hora de fin debe ser posterior al inicio.');
    await db.put('blocks', { ...base, ...d, id: base.id || uid(), goalId: d.goalId || null, origen: base.origen || 'manual', hecho: nuevo ? false : d.hecho, frase: base.frase || '' });
    close(); refrescar();
  });
  el.querySelectorAll('[data-pos]').forEach(btn => btn.addEventListener('click', async () => {
    const mins = Number(btn.dataset.pos);
    const ini = toMin(b.inicio) + mins, fin = toMin(b.fin) + mins;
    if (fin > 1439) return toast('No cabe hoy. Pásalo a mañana.');
    await db.put('blocks', { ...b, inicio: toHHMM(ini), fin: toHHMM(fin), fijado: true });
    close(); refrescar(); toast(`Pospuesto ${mins === 60 ? '1 h' : '30 min'}`);
  }));
  el.querySelector('[data-manana]')?.addEventListener('click', async () => {
    await db.put('blocks', { ...b, fecha: addDays(b.fecha, 1), fijado: true });
    close(); refrescar(); toast('Movido a mañana');
  });
  el.querySelector('[data-borrar]')?.addEventListener('click', async () => {
    if (!confirm('¿Borrar este bloque?')) return;
    await db.del('blocks', b.id);
    close(); refrescar();
  });
}

// Ventana para enviar el horario a Recordatorios/Alarmas mediante el Atajo.
export function abrirEnvioIphone(tipoInicial = 'hoy') {
  const { el } = sheet('Enviar al iPhone', `
    <div class="seg" role="tablist">
      <button data-tipo="hoy">Hoy</button><button data-tipo="manana">Mañana</button><button data-tipo="semana">7 días</button>
    </div>
    <div id="envio"></div>
    <p class="mini centro" style="margin-top:12px">¿Primera vez? Crea antes el Atajo: <a href="#perfil" data-guia>ver guía paso a paso</a>.</p>`);
  const zona = el.querySelector('#envio');
  el.querySelector('[data-guia]').addEventListener('click', () => el.closest('.sheet-back').querySelector('.sheet-close').click());

  async function cargar(tipo) {
    el.querySelectorAll('[data-tipo]').forEach(b => b.classList.toggle('activa', b.dataset.tipo === tipo));
    zona.innerHTML = '<div class="cargando"><span class="spinner"></span>Preparando frases motivadoras…</div>';
    const envio = await prepararEnvio(tipo);
    if (!envio.bloques.length) {
      zona.innerHTML = '<div class="vacio"><span class="ico">🗓️</span>No hay bloques pendientes en ese periodo.</div>';
      return;
    }
    const alarmas = envio.bloques.filter(b => b.importante).length;
    zona.innerHTML = `
      <div class="card plano"><ul class="lista">${envio.bloques.map(b => `
        <li><div class="grow"><div class="t">${b.importante ? '⏰' : '🔔'} ${esc(b.titulo)}</div>
        <div class="mini">${fmtFecha(b.fecha, { weekday: 'short', day: 'numeric' })} · ${b.inicio}</div>
        ${b.frase ? `<div class="mini"><em>«${esc(b.frase)}»</em></div>` : ''}</div></li>`).join('')}
      </ul></div>
      <p class="sub centro">${envio.bloques.length} ${envio.bloques.length === 1 ? 'recordatorio' : 'recordatorios'}${alarmas ? ` y ${alarmas} ${alarmas === 1 ? 'alarma' : 'alarmas'}` : ''} en la lista «Mi Mejor Versión».</p>
      <button class="btn ancho" id="abrir-atajo">📲 Crear en Recordatorios y Alarmas</button>`;
    zona.querySelector('#abrir-atajo').addEventListener('click', () => abrirAtajo(envio));
  }
  el.querySelectorAll('[data-tipo]').forEach(b => b.addEventListener('click', () => cargar(b.dataset.tipo)));
  cargar(tipoInicial);
}

export function cargando(texto = 'Cargando…') {
  return `<div class="cargando"><span class="spinner"></span>${esc(texto)}</div>`;
}

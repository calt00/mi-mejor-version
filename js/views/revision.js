// Revisiones: la de cada noche (qué salió bien y qué no) y la semanal (números + 3 ideas). Calculadas por la app, sin IA.
import { db, kvGet, kvSet } from '../db.js';
import { esc, sheet, fmtFecha, fmtEur, miniMarkdown, hoyISO, weekStart, weekday, refrescar, addDays } from '../util.js';
import { resumenSemana, ideasSemana, resumenDia, ideasDia } from '../progreso.js';
import { tipoTurno } from '../interprete.js';
import { acostarObjetivo } from '../sueno.js';

const MAX_REVISIONES = 52;
const MAX_REVISIONES_DIA = 60;

async function datosSemana() {
  const [goals, blocks, habits, tasks, expenses, contributions, inicioApp] = await Promise.all([
    db.all('goals'), db.all('blocks'), db.all('habits'), db.all('tasks'), db.all('expenses'), db.all('contributions'), kvGet('inicioApp', hoyISO()),
  ]);
  return { hoy: hoyISO(), goals, blocks, habits, tasks, expenses, contributions, inicioApp };
}

async function guardar(rev) {
  const lista = (await kvGet('revisiones', [])).filter(r => r.semana !== rev.semana);
  lista.push(rev);
  lista.sort((a, b) => a.semana.localeCompare(b.semana));
  await kvSet('revisiones', lista.slice(-MAX_REVISIONES));
}

const fechaCorta = f => fmtFecha(f, { day: 'numeric', month: 'short' });

function numerosHTML(n) {
  return `
    <div class="regla" style="margin-bottom:12px">
      <div><b>${n.pct ?? '–'}${n.pct != null ? ' %' : ''}</b><span class="mini">cumplido</span></div>
      <div><b>${n.bloques.hechos}/${n.bloques.total}</b><span class="mini">bloques</span></div>
      <div><b>${n.tareas}</b><span class="mini">tareas</span></div>
    </div>
    ${n.mejorDia ? `<p class="sub">⭐ Tu mejor día: <b>${esc(fmtFecha(n.mejorDia.fecha, { weekday: 'long' }))}</b> (${n.mejorDia.pct} %)${n.diasPerfectos ? ` · ${n.diasPerfectos} ${n.diasPerfectos === 1 ? 'día perfecto' : 'días perfectos'}` : ''}</p>` : ''}
    ${n.objetivos.length ? `<div class="card plano" style="margin-top:8px"><ul class="lista">${n.objetivos.map(o => `
      <li><div class="grow"><div class="t">🎯 ${esc(o.titulo)}</div></div>
      <span class="mini ${o.horasObjetivo && o.horasHechas >= o.horasObjetivo ? 'verde' : ''}">${o.horasHechas} h${o.horasObjetivo ? ` de ${o.horasObjetivo} h` : ''}</span></li>`).join('')}</ul></div>` : ''}
    ${n.habitos.length ? `<div class="card plano"><ul class="lista">${n.habitos.map(h => `
      <li><span style="font-size:20px">${esc(h.emoji || '✨')}</span><div class="grow">${esc(h.titulo)}</div>
      <span class="mini ${h.dias === 7 ? 'verde' : ''}">${h.dias}/7 días</span></li>`).join('')}</ul></div>` : ''}
    <div class="grid2" style="margin-bottom:12px">
      <div class="card" style="margin:0;text-align:center"><div class="mini">💸 Gastado</div><b>${fmtEur(n.gastado)}</b></div>
      <div class="card" style="margin:0;text-align:center"><div class="mini">🐷 Ahorrado</div><b>${fmtEur(n.ahorrado)}</b></div>
    </div>`;
}

function ideasHTML(rev) {
  return `<div class="card">
    <b>💬 Tu semana en resumen</b>
    <div style="margin-top:6px">${miniMarkdown(rev.texto)}</div>
    <h3 style="margin:12px 0 6px;font-size:16px">3 ideas para la semana que viene</h3>
    <ol style="padding-left:20px;margin:0">${rev.ideas.map(i => `<li style="margin-bottom:10px"><b>${esc(i.titulo)}</b><br>
      <span class="sub">${esc(i.detalle)}</span></li>`).join('')}</ol>
  </div>`;
}

/** Abre (y guarda) la revisión de la semana que empieza en `lunes`. */
export async function abrirRevision(lunes) {
  const guardada = (await kvGet('revisiones', [])).find(r => r.semana === lunes);
  // Los números se congelan cuando la semana ya ha terminado.
  const n = guardada && guardada.numeros.domingo < hoyISO() ? guardada.numeros : resumenSemana(await datosSemana(), lunes);
  const rev = { semana: lunes, fecha: hoyISO(), ...guardada, numeros: n, ...ideasSemana(n) };
  await guardar(rev);
  sheet(`Tu semana · ${fechaCorta(n.lunes)} – ${fechaCorta(n.domingo)}`, `${numerosHTML(n)}${ideasHTML(rev)}`);
}

const lista = (items, vacio) => items.length ? `<ul class="lista">${items.join('')}</ul>` : `<p class="sub" style="margin:4px 0">${vacio}</p>`;

function suenoHTML(s) {
  if (!s) return '';
  const texto = s.pendiente ? `Tu plan de sueño empieza el ${fmtFecha(s.inicio, { day: 'numeric', month: 'long' })}. Hasta entonces, tus horas de siempre.`
    : s.alDia ? `Mantén tu hora: acuéstate sobre las <b>${s.acostar}</b>.`
    : `Acuéstate a las <b>${s.acostar}</b> y mañana levántate a las <b>${s.levantar}</b> (semana ${s.semana} de ${s.total} de tu plan de sueño). Pantallas fuera un rato antes.`;
  return `<div class="card"><b>😴 Esta noche</b><div class="sub" style="margin-top:4px">${texto}</div></div>`;
}

function diaHTML(n, r, sueno) {
  const bien = [
    ...n.bien.bloques.map(t => `<li><span>✅</span><div class="grow">${esc(t)}</div></li>`),
    ...n.bien.habitos.map(h => `<li><span>${esc(h.emoji || '✨')}</span><div class="grow">${esc(h.titulo)}</div></li>`),
    ...(n.bien.tareas ? [`<li><span>☑️</span><div class="grow">${n.bien.tareas} ${n.bien.tareas === 1 ? 'tarea completada' : 'tareas completadas'}</div></li>`] : []),
  ];
  const mal = [
    ...n.mal.bloques.map(b => `<li><span>${b.importante ? '⏰' : '⬜'}</span><div class="grow">${esc(b.titulo)}</div></li>`),
    ...n.mal.habitos.map(h => `<li><span>${esc(h.emoji || '✨')}</span><div class="grow">${esc(h.titulo)} <span class="mini">sin marcar</span></div></li>`),
  ];
  return `
    <div class="card"><div class="fila">
      <div class="anillo" style="--p:${n.pct ?? 0}"><span>${n.pct ?? '–'}${n.pct != null ? '%' : ''}</span></div>
      <div class="grow" style="flex:1">${esc(r.texto)}</div></div></div>
    <div class="seccion"><h2>👍 Lo que has hecho bien</h2></div>
    <div class="card plano">${lista(bien, 'Hoy no marcaste nada como hecho.')}</div>
    <div class="seccion"><h2>🔧 Lo que mejorar</h2></div>
    <div class="card plano">${lista(mal, '¡Nada pendiente! 🎉')}</div>
    ${n.gastado || n.ahorrado ? `<div class="grid2" style="margin-bottom:12px">
      <div class="card" style="margin:0;text-align:center"><div class="mini">💸 Gastado hoy</div><b>${fmtEur(n.gastado)}</b></div>
      <div class="card" style="margin:0;text-align:center"><div class="mini">🐷 Ahorrado hoy</div><b>${fmtEur(n.ahorrado)}</b></div></div>` : ''}
    ${suenoHTML(sueno)}
    <div class="card"><b>🌙 Para mañana</b>
      <ol style="padding-left:20px;margin:8px 0 0">${r.consejos.map(i => `<li style="margin-bottom:10px"><b>${esc(i.titulo)}</b><br><span class="sub">${esc(i.detalle)}</span></li>`).join('')}</ol></div>`;
}

/** Abre (y guarda) la revisión de la noche del día `fecha`. En domingo ofrece seguir con la semanal. */
export async function abrirRevisionDiaria(fecha = hoyISO()) {
  const [goals, blocks, habits, tasks, expenses, contributions, inicioApp, guardadas] = await Promise.all([
    db.all('goals'), db.all('blocks'), db.all('habits'), db.all('tasks'), db.all('expenses'), db.all('contributions'),
    kvGet('inicioApp', fecha), kvGet('revisionesDia', []),
  ]);
  const [planSueno, turnos] = await Promise.all([kvGet('planSueno'), kvGet('turnos')]);
  // La hora de acostarse depende del turno de mañana, que es el que marca cuándo toca madrugar.
  const claveSueno = turnos ? tipoTurno(turnos, addDays(fecha, 1)) : 'general';
  const sueno = acostarObjetivo(planSueno, claveSueno, fecha);
  const n = resumenDia({ goals, blocks, habits, tasks, expenses, contributions, inicioApp }, fecha);
  const r = ideasDia(n);
  const historial = guardadas.filter(x => x.fecha !== fecha);
  historial.push({ fecha, pct: n.pct, texto: r.texto });
  historial.sort((a, b) => a.fecha.localeCompare(b.fecha));
  await kvSet('revisionesDia', historial.slice(-MAX_REVISIONES_DIA));

  const domingo = weekday(fecha) === 6;
  const { el, close } = sheet(`Tu día · ${fmtFecha(fecha, { weekday: 'long', day: 'numeric', month: 'short' })}`, `${diaHTML(n, r, sueno)}
    <div class="acciones">${domingo ? '<button class="btn" id="ver-semana">📋 Ver mi semana</button>' : ''}<button class="btn ${domingo ? 'gris' : ''}" id="buenas-noches">Buenas noches 🌙</button></div>`,
    { onClose: refrescar });
  el.querySelector('#buenas-noches').addEventListener('click', close);
  el.querySelector('#ver-semana')?.addEventListener('click', () => { close(); abrirRevision(weekStart(fecha)); });
}

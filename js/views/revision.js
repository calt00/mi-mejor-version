// Revisión semanal: números de la semana + resumen y 3 ideas (calculadas por la app, sin IA). Se guarda en el historial.
import { db, kvGet, kvSet } from '../db.js';
import { esc, sheet, fmtFecha, fmtEur, miniMarkdown, hoyISO } from '../util.js';
import { resumenSemana, ideasSemana } from '../progreso.js';

const MAX_REVISIONES = 52;

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

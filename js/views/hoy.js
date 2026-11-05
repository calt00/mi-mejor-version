// Pantalla «Hoy»: un círculo grande que se llena con lo que haces y, debajo, el horario del día.
// Lo demás (hábitos, ahorro, asistente, progreso) vive en su propia pestaña.
import { db, kvGet, kvSet } from '../db.js';
import { getProfile } from '../datos.js';
import { esc, hoyISO, fmtFecha, refrescar, addDays, diasEntre, nowMin } from '../util.js';
import { diaHTML, conectarBloques, abrirEditorBloque, abrirEnvioIphone, datosFinanzas, momentoBloque, cargarCompromisos } from './comun.js';
import { abrirDiaLibre } from './diaLibre.js';
import { quitarDiaLibre, MOTIVO_TXT } from '../diasLibres.js';
import { progresoDiario, semanaPendiente, diaPendiente } from '../progreso.js';
import { comprobarLogros } from '../logros.js';
import { abrirRevision, abrirRevisionDiaria } from './revision.js';
import { exportar } from './perfil.js';
import { filaHabitosHTML, conectarFilaHabitos } from './habitos.js';
import { huevoCentroHTML, conectarHuevo, comprobarEclosion, getHuevo, aplicarReaccion, calcularEstadoHuevo } from './huevo.js';

const DIAS_ENTRE_COPIAS = 7;

// Aviso si hay datos y hace más de una semana que no se hace copia.
function tocaCopia({ hoy, ultimaCopia, copiaPospuesta, inicioApp, hayDatos }) {
  if (!hayDatos || (copiaPospuesta && copiaPospuesta > hoy)) return null;
  const dias = diasEntre(ultimaCopia || inicioApp, hoy);
  return dias >= DIAS_ENTRE_COPIAS ? { dias, nunca: !ultimaCopia } : null;
}

function saludo(nombre) {
  const h = new Date().getHours();
  const s = h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
  return nombre ? `${s}, ${nombre}` : s;
}

// Aviso pequeño de una línea (solo aparece cuando toca).
const aviso = (id, icono, texto, boton, extra = '') =>
  `<div class="aviso-linea"><span class="ico">${icono}</span><span class="grow">${texto}</span>${extra}<button class="btn chico" id="${id}">${boton}</button></div>`;

export async function render(root) {
  const hoy = hoyISO();
  const [perfil, goals, blocks, habits, tasks, fin, revisiones, revisionesDia, ultimaCopia, copiaPospuesta, comp, huevo] = await Promise.all([
    getProfile(), db.all('goals'), db.all('blocks'), db.all('habits'), db.all('tasks'), datosFinanzas(),
    kvGet('revisiones', []), kvGet('revisionesDia', []), kvGet('ultimaCopia'), kvGet('copiaPospuesta'), cargarCompromisos(), getHuevo(),
  ]);
  const libreHoy = comp.libres[hoy] || null;
  const descansando = libreHoy?.modo === 'libre'; // día libre de verdad: no cuenta en las estadísticas
  const inicioApp = fin.inicioApp || hoy;
  const lunesRevision = semanaPendiente(hoy, revisiones, inicioApp);
  const revisarNoche = diaPendiente(hoy, nowMin(), revisionesDia);
  const hayDatos = goals.length + blocks.length + habits.length + fin.expenses.length + fin.savingsGoals.length > 0;
  const copia = tocaCopia({ hoy, ultimaCopia, copiaPospuesta, inicioApp, hayDatos });
  const goalsById = Object.fromEntries(goals.map(g => [g.id, g]));
  const deHoy = blocks.filter(b => b.fecha === hoy).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const compHoy = comp.de(hoy);
  const sinHora = habits.filter(h => !h.goalId); // hábitos que aún no están en el horario: se marcan aquí

  // Lo hecho hoy: bloques, hábitos sin hora y tareas terminadas (que suman sin penalizar).
  const [dia] = progresoDiario({ blocks, habits, tasks, desde: hoy, hasta: hoy, inicioApp, libres: comp.libres });
  // En un día libre, el círculo solo se llena con las sugerencias que se hagan (si las hay).
  const extras = deHoy.filter(b => b.extra);
  const pct = descansando ? (extras.length ? Math.round(extras.filter(b => b.hecho).length / extras.length * 100) : 0) : dia.pct ?? 0;
  // Tu huevo (o tu compañero): se calienta con los días buenos desde que lo elegiste.
  const estadoH = calcularEstadoHuevo({ huevo, blocks, habits, tasks, goals, inicioApp, libres: comp.libres, compDe: comp.de, hoy });
  const actual = deHoy.find(b => momentoBloque(b) === 'ahora' && !b.hecho);
  const siguiente = deHoy.find(b => momentoBloque(b) === 'futuro' && !b.hecho);

  let estado = 'Tu día está libre.';
  if (actual) estado = `Ahora: <b>${esc(actual.titulo)}</b> hasta las ${actual.fin}`;
  else if (siguiente) estado = `Siguiente: <b>${esc(siguiente.titulo)}</b> a las ${siguiente.inicio}`;
  else if (descansando && !extras.length) estado = 'Hoy descansas. ¡Disfrútalo!';
  else if ((dia.planificados || extras.length) && pct >= 100) estado = '¡Has completado todo lo de hoy!';
  else if (dia.planificados) estado = 'No quedan bloques pendientes por hoy.';

  root.innerHTML = `
    <p class="sub centro" style="margin:0 0 6px">${fmtFecha(hoy)} · ${esc(saludo(perfil.nombre))}</p>

    <div class="hero-dia">
      <div class="anillo-grande ${pct >= 100 ? 'completo' : ''}" id="anillo" data-p="${pct}" style="--p:0">
        <div class="interior">
          ${huevoCentroHTML(estadoH, { completo: pct >= 100 && !descansando })}
          <a class="pct-mini" href="#progreso" aria-label="Ver mi progreso">${descansando ? `🏖️ Día libre${extras.length ? ` · ${extras.filter(b => b.hecho).length} de ${extras.length}` : ''}`
            : `<b>${pct}%</b> · ${dia.planificados ? `${dia.hechos + dia.tareas} de ${dia.planificados}` : 'nada planificado'}`}</a>
        </div>
      </div>
    </div>
    <p class="estado-dia">${estado}</p>

    ${libreHoy ? aviso('quitar-libre', '🏖️', `<b>Hoy es tu día libre</b> <span class="mini">(${esc(MOTIVO_TXT[libreHoy.motivo])}${libreHoy.modo === 'rutina' ? ' · haces tu rutina' : ''})</span>`, 'Quitar') : ''}
    ${revisarNoche ? aviso('revision-dia', '🌙', '<b>Revisa tu día</b>', 'Revisar') : ''}
    ${lunesRevision ? aviso('revision', '📋', '<b>Tu revisión semanal está lista</b>', 'Ver') : ''}
    ${copia ? aviso('copia', '💾', copia.nunca ? '<b>Aún no has hecho copia de seguridad</b>' : `<b>Hace ${copia.dias} días de tu última copia</b>`, 'Copiar', '<button class="btn-icon" id="copia-luego" aria-label="Más tarde">✕</button>') : ''}

    <div class="seccion"><h2>Tu horario</h2><span class="fila" style="gap:6px"><button class="btn sec chico" id="dia-libre">🏖️ Día libre</button><button class="btn sec chico" id="nuevo-bloque">+ Bloque</button></span></div>
    ${deHoy.length || compHoy.length ? `<div class="bloques">${diaHTML(deHoy, compHoy, goalsById)}</div>` : ''}
    ${deHoy.length ? '<button class="btn gris ancho" id="enviar" style="margin-top:12px">📲 Enviar al iPhone</button>' : !compHoy.length || compHoy.every(c => c.tipo === 'despertar') ? `
      <div class="card vacio" style="margin-top:8px"><span class="ico">${libreHoy ? '🏖️' : '🗓️'}</span>${libreHoy ? 'Hoy no hay nada planificado: es tu día libre.' : 'No tienes nada planificado para hoy.'}
        ${libreHoy ? '' : '<div class="acciones" style="justify-content:center"><a class="btn chico" href="#horario">Crear mi horario</a></div>'}</div>` : ''}

    ${sinHora.length ? `<div class="seccion"><h2>Hábitos de hoy</h2></div>${filaHabitosHTML(sinHora, hoy)}` : ''}`;

  // El círculo se rellena con una animación suave al entrar.
  const anillo = root.querySelector('#anillo');
  requestAnimationFrame(() => requestAnimationFrame(() => anillo.style.setProperty('--p', anillo.dataset.p)));

  conectarBloques(root, deHoy);
  conectarFilaHabitos(root, sinHora, hoy);
  root.querySelector('#enviar')?.addEventListener('click', () => abrirEnvioIphone('hoy'));
  root.querySelector('#nuevo-bloque').addEventListener('click', () => abrirEditorBloque(null, { fecha: hoy }));
  root.querySelector('#dia-libre').addEventListener('click', () => abrirDiaLibre(hoy));
  root.querySelector('#quitar-libre')?.addEventListener('click', async () => { await quitarDiaLibre(hoy); refrescar(); });
  root.querySelector('#revision-dia')?.addEventListener('click', () => abrirRevisionDiaria(hoy));
  root.querySelector('#revision')?.addEventListener('click', () => abrirRevision(lunesRevision).then(() => setTimeout(refrescar, 300)));
  root.querySelector('#copia')?.addEventListener('click', async () => { if (await exportar()) refrescar(); });
  root.querySelector('#copia-luego')?.addEventListener('click', async () => { await kvSet('copiaPospuesta', addDays(hoy, 2)); refrescar(); });

  conectarHuevo(root, estadoH);
  aplicarReaccion(root, estadoH, { completo: pct >= 100 && !descansando });
  comprobarEclosion(estadoH).catch(e => console.warn('Huevo:', e));
  comprobarLogros().catch(e => console.warn('Logros:', e));
}

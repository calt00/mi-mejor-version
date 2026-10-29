// Generador de horario determinista y validación de horarios propuestos por la IA.
import { toMin, toHHMM, weekday, weekDates, nowMin, hoyISO, uid, fmtHoras } from './util.js';
import { VENTANA_MOMENTO } from './datos.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const duracion = b => toMin(b.fin) - toMin(b.inicio);
export const ordenarBloques = arr => [...arr].sort((a, b) => (a.fecha + a.inicio).localeCompare(b.fecha + b.inicio));

// Resta el intervalo [a, b) de una lista de intervalos.
function recortar(intervalos, [a, b]) {
  const out = [];
  for (const [s, e] of intervalos) {
    if (b <= s || a >= e) { out.push([s, e]); continue; }
    if (a > s) out.push([s, a]);
    if (b < e) out.push([b, e]);
  }
  return out;
}

export function franjasDia(fecha, disponibilidad) {
  return (disponibilidad[weekday(fecha)] || []).map(f => [toMin(f.inicio), toMin(f.fin)]).filter(([a, b]) => b > a);
}

function huecosDia(fecha, disponibilidad, ocupados, descanso) {
  let libres = franjasDia(fecha, disponibilidad);
  if (fecha === hoyISO()) libres = recortar(libres, [0, Math.ceil((nowMin() + 10) / 15) * 15]);
  for (const b of ocupados) libres = recortar(libres, [toMin(b.inicio) - descanso, toMin(b.fin) + descanso]);
  return libres;
}

// Un bloque se conserva al regenerar si está fijado, hecho o ya pasó.
export function seConserva(b) {
  const hoy = hoyISO();
  return b.fijado || b.hecho || b.fecha < hoy || (b.fecha === hoy && toMin(b.inicio) < nowMin());
}

export function esImportante(goal, settings) {
  if (settings.importantes === 'todos') return true;
  if (settings.importantes === 'alta') return Number(goal?.prioridad) === 3;
  return false;
}

/**
 * Genera los bloques de una semana.
 * Devuelve { nuevos, borrar (ids de bloques reemplazados), avisos }.
 */
export function generarSemana({ fecha, goals, blocks, disponibilidad, prefs, settings }) {
  const fechas = weekDates(fecha).filter(f => f >= hoyISO());
  const semana = new Set(weekDates(fecha));
  const enSemana = blocks.filter(b => semana.has(b.fecha));
  const conservados = enSemana.filter(seConserva);
  const borrar = enSemana.filter(b => !seConserva(b)).map(b => b.id);
  const descanso = prefs.descansoMin || 0;
  const maxDia = (prefs.maxHorasDia || 24) * 60;

  const activos = goals.filter(g => !g.archivado && Number(g.horasSemana) > 0)
    .sort((a, b) => (b.prioridad - a.prioridad) || (a.fechaLimite || '9999').localeCompare(b.fechaLimite || '9999'));

  const resto = {};
  for (const g of activos) resto[g.id] = g.horasSemana * 60 - conservados.filter(b => b.goalId === g.id).reduce((a, b) => a + duracion(b), 0);

  const dias = fechas.map(f => {
    const ocupados = conservados.filter(b => b.fecha === f);
    return {
      fecha: f,
      libres: huecosDia(f, disponibilidad, ocupados, descanso),
      carga: ocupados.filter(b => b.goalId).reduce((a, b) => a + duracion(b), 0),
      porGoal: Object.fromEntries(ocupados.filter(b => b.goalId).map(b => [b.goalId, 1])),
    };
  });

  function mejorHueco(g, L) {
    const win = VENTANA_MOMENTO[g.momento];
    let mejor = null;
    dias.forEach((d, idx) => {
      if (d.carga + L > maxDia) return;
      for (const [s, e] of d.libres) {
        if (e - s < L) continue;
        // También al final del hueco, para no partirlo en trozos que luego no sirvan a otro objetivo.
        const inicios = [s, e - L];
        if (win) { const ws = Math.max(s, win[0]); if (ws + L <= e) inicios.push(ws); }
        for (const ini of new Set(inicios)) {
          const enVentana = !win || (ini >= win[0] && ini + L <= win[1]);
          const enBorde = ini === s || ini + L === e;
          const score = [d.porGoal[g.id] ? 1 : 0, enVentana ? 0 : 1, d.carga, idx, enBorde ? 0 : 1, ini];
          if (!mejor || menor(score, mejor.score)) mejor = { d, ini, score };
        }
      }
    });
    return mejor;
  }

  const nuevos = [];
  let progreso = true;
  while (progreso) {
    progreso = false;
    for (const g of activos) {
      if (resto[g.id] < 15) continue;
      const base = Math.min(g.sesionMin || prefs.sesionMin || 60, resto[g.id]);
      let hueco = null, L = base;
      for (const prueba of [base, Math.max(30, Math.round(base / 2 / 15) * 15)]) {
        if (prueba > resto[g.id] && prueba !== base) continue;
        hueco = mejorHueco(g, prueba);
        if (hueco) { L = prueba; break; }
      }
      if (!hueco) continue;
      const { d, ini } = hueco;
      nuevos.push({
        id: uid(), fecha: d.fecha, inicio: toHHMM(ini), fin: toHHMM(ini + L), titulo: g.titulo, goalId: g.id,
        fijado: false, hecho: false, importante: esImportante(g, settings), frase: '', origen: 'auto',
      });
      d.libres = recortar(d.libres, [ini - descanso, ini + L + descanso]);
      d.carga += L;
      d.porGoal[g.id] = 1;
      resto[g.id] -= L;
      progreso = true;
    }
  }

  const avisos = activos.filter(g => resto[g.id] >= 15)
    .map(g => `No caben ${fmtHoras(resto[g.id])} de «${g.titulo}» esta semana. Amplía tu disponibilidad o reduce sus horas.`);
  if (!activos.length) avisos.push('Añade objetivos con horas por semana para poder generar el horario.');
  return { nuevos: ordenarBloques(nuevos), borrar, avisos };
}

function menor(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

/**
 * Valida bloques propuestos (p. ej. por la IA): formato, sin solapes entre sí ni con los fijos.
 * Los que salen de la disponibilidad se aceptan con aviso (la petición puede cambiarla).
 */
export function validarBloques(propuestos, fijos, disponibilidad) {
  const validos = [], avisos = [];
  const ocupados = [...fijos];
  for (const p of ordenarBloques(propuestos)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.fecha || '') || !HHMM.test(p.inicio || '') || !HHMM.test(p.fin || '') || toMin(p.fin) <= toMin(p.inicio)) {
      avisos.push(`Descartado «${p.titulo || 'bloque'}»: hora no válida.`);
      continue;
    }
    const choque = ocupados.find(o => o.fecha === p.fecha && toMin(p.inicio) < toMin(o.fin) && toMin(o.inicio) < toMin(p.fin));
    if (choque) { avisos.push(`Descartado «${p.titulo}» (${p.inicio}): se solapa con «${choque.titulo}».`); continue; }
    const dentro = franjasDia(p.fecha, disponibilidad).some(([s, e]) => toMin(p.inicio) >= s && toMin(p.fin) <= e);
    if (!dentro) avisos.push(`«${p.titulo}» (${p.inicio}–${p.fin}) queda fuera de tu disponibilidad habitual.`);
    validos.push(p);
    ocupados.push(p);
  }
  return { validos, avisos };
}

// Cálculos de progreso: % del día cumplido, medias, rachas y resumen semanal (sin IA).
import { addDays, toMin, weekDates, weekStart, weekday, sum } from './util.js';

const minutos = b => toMin(b.fin) - toMin(b.inicio);

// Día desde el que cuenta un hábito (los antiguos no guardaban fecha de creación).
export const inicioHabito = (h, inicioApp) => [h.creado, ...h.registros].filter(Boolean).sort()[0] || inicioApp || '0000-01-01';

/**
 * Progreso de cada día entre `desde` y `hasta` (incluidos).
 * Cuenta bloques del horario y hábitos; las tareas terminadas ese día suman sin penalizar.
 * Días sin nada planificado → pct null (hueco en la gráfica).
 */
export function progresoDiario({ blocks = [], habits = [], tasks = [], desde, hasta, inicioApp }) {
  const porFecha = {};
  for (const b of blocks) if (b.fecha >= desde && b.fecha <= hasta) (porFecha[b.fecha] ||= []).push(b);
  const tareasPorFecha = {};
  for (const t of tasks) if (t.hecho && t.hechoEn) tareasPorFecha[t.hechoEn] = (tareasPorFecha[t.hechoEn] || 0) + 1;
  const hs = habits.map(h => ({ inicio: inicioHabito(h, inicioApp), registros: new Set(h.registros) }));

  const out = [];
  for (let f = desde; f <= hasta; f = addDays(f, 1)) {
    const bs = porFecha[f] || [];
    const activos = hs.filter(h => h.inicio <= f);
    const planificados = bs.length + activos.length;
    const hechos = bs.filter(b => b.hecho).length + activos.filter(h => h.registros.has(f)).length;
    const tareas = tareasPorFecha[f] || 0;
    const pct = planificados ? Math.min(100, Math.round((hechos + tareas) / planificados * 100)) : tareas ? 100 : null;
    out.push({ fecha: f, planificados, hechos, tareas, pct });
  }
  return out;
}

// Media de los últimos n días con datos (ignora los huecos).
export function mediaMovil(serie, n = 7) {
  return serie.map((_, i) => {
    const v = serie.slice(Math.max(0, i - n + 1), i + 1).map(d => d.pct).filter(p => p != null);
    return v.length ? Math.round(sum(v) / v.length) : null;
  });
}

export function mediaSerie(serie) {
  const v = serie.map(d => d.pct).filter(p => p != null);
  return v.length ? Math.round(sum(v) / v.length) : null;
}

// Minutos hechos por objetivo entre dos fechas, con el objetivo proporcional a esos días.
export function horasPorObjetivo(goals, blocks, desde, hasta, dias) {
  return goals.filter(g => !g.archivado).map(g => ({
    goal: g,
    hechoMin: sum(blocks.filter(b => b.goalId === g.id && b.hecho && b.fecha >= desde && b.fecha <= hasta), minutos),
    objetivoMin: Math.round((g.horasSemana || 0) * 60 * dias / 7),
  })).filter(x => x.hechoMin || x.objetivoMin).sort((a, b) => b.hechoMin - a.hechoMin);
}

export function mejorRacha(h) {
  const dias = [...new Set(h.registros)].sort();
  let mejor = 0, actual = 0;
  dias.forEach((d, i) => {
    actual = i && addDays(dias[i - 1], 1) === d ? actual + 1 : 1;
    mejor = Math.max(mejor, actual);
  });
  return mejor;
}

/**
 * Números de la semana que empieza en `lunes`, para la revisión semanal.
 * Si la semana no ha terminado (d.hoy), los días que faltan no cuentan como no cumplidos.
 */
export function resumenSemana(d, lunes) {
  const dias = weekDates(lunes), domingo = dias[6];
  const hasta = d.hoy && d.hoy < domingo ? d.hoy : domingo;
  const serie = progresoDiario({ ...d, desde: lunes, hasta });
  const conDatos = serie.filter(x => x.pct != null);
  const mejor = conDatos.reduce((a, x) => (!a || x.pct > a.pct ? x : a), null);
  const bs = d.blocks.filter(b => b.fecha >= lunes && b.fecha <= hasta);
  const enSemana = x => x.fecha >= lunes && x.fecha <= domingo;
  return {
    lunes, domingo,
    pct: mediaSerie(serie),
    diasPerfectos: conDatos.filter(x => x.pct === 100).length,
    mejorDia: mejor ? { fecha: mejor.fecha, pct: mejor.pct } : null,
    bloques: { hechos: bs.filter(b => b.hecho).length, total: bs.length },
    objetivos: horasPorObjetivo(d.goals, d.blocks, lunes, domingo, 7)
      .map(x => ({ titulo: x.goal.titulo, horasHechas: +(x.hechoMin / 60).toFixed(1), horasObjetivo: +(x.objetivoMin / 60).toFixed(1) })),
    habitos: d.habits.map(h => ({ titulo: h.titulo, emoji: h.emoji, dias: dias.filter(f => h.registros.includes(f)).length })),
    tareas: d.tasks.filter(t => t.hecho && t.hechoEn >= lunes && t.hechoEn <= domingo).length,
    gastado: +sum((d.expenses || []).filter(enSemana), e => e.importe).toFixed(2),
    ahorrado: +sum((d.contributions || []).filter(enSemana), c => c.importe).toFixed(2),
  };
}

/**
 * Semana cuya revisión toca hacer hoy (su lunes), o null.
 * El domingo se revisa la semana en curso; de lunes a miércoles, la anterior si no se hizo.
 */
export function semanaPendiente(hoy, revisiones = [], inicioApp = hoy) {
  const wd = weekday(hoy);
  const lunes = wd === 6 ? weekStart(hoy) : wd <= 2 ? addDays(weekStart(hoy), -7) : null;
  if (!lunes || addDays(lunes, 6) < inicioApp) return null;
  return revisiones.some(r => r.semana === lunes) ? null : lunes;
}

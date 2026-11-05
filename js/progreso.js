// Cálculos de progreso: % del día cumplido, medias, rachas y resumen semanal (sin IA).
import { addDays, toMin, weekDates, weekStart, weekday, sum, fmtEur } from './util.js';

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

/** Resumen y 3 ideas para la semana siguiente a partir de los números de resumenSemana() (sin IA). */
export function ideasSemana(n) {
  const l = [];
  if (n.pct == null) l.push('Esta semana no había nada planificado.');
  else l.push(`Esta semana has cumplido el ${n.pct} % de lo que tenías planificado${n.pct >= 80 ? '. ¡Muy bien! 🌟' : n.pct >= 50 ? '. Vas por buen camino. 💪' : '. Ha costado, pero cada paso cuenta. 🌱'}`);
  const cumplidos = n.objetivos.filter(o => o.horasObjetivo && o.horasHechas >= o.horasObjetivo);
  if (cumplidos.length) l.push(`Has llegado a tus horas en ${cumplidos.map(o => `«${o.titulo}»`).join(', ')}.`);
  if (n.diasPerfectos) l.push(`Tuviste ${n.diasPerfectos} ${n.diasPerfectos === 1 ? 'día perfecto' : 'días perfectos'}.`);

  const ideas = [];
  const flojo = n.objetivos.filter(o => o.horasObjetivo && o.horasHechas < o.horasObjetivo / 2).sort((a, b) => a.horasHechas / a.horasObjetivo - b.horasHechas / b.horasObjetivo)[0];
  const habito = n.habitos.filter(h => h.dias < 4).sort((a, b) => a.dias - b.dias)[0];
  if (n.pct != null && n.pct < 50) ideas.push({ titulo: 'Hazlo más pequeño', detalle: 'Baja un poco las horas o usa sesiones de 15–30 minutos: es mejor poco cada día que mucho un día suelto.' });
  if (flojo) ideas.push({ titulo: `Dale un hueco fijo a «${flojo.titulo}»`, detalle: `Hiciste ${flojo.horasHechas} de ${flojo.horasObjetivo} h. Ponlo siempre a la misma hora: cuando es rutina, cuesta mucho menos.` });
  if (habito) ideas.push({ titulo: `Ata «${habito.titulo}» a algo que ya haces`, detalle: `Lo cumpliste ${habito.dias} de 7 días. Hazlo justo después de algo fijo (desayunar, llegar a casa…) para no depender de acordarte.` });
  if (n.gastado > 0 && n.ahorrado <= 0) ideas.push({ titulo: 'Págate a ti primero', detalle: `Gastaste ${fmtEur(n.gastado)} y no apartaste nada. El día que cobres, aparta una cantidad fija antes de gastar.` });
  if (!n.tareas) ideas.push({ titulo: 'Tacha una tarea', detalle: 'No completaste ninguna tarea de tus objetivos. Elige la más pequeña y hazla el primer día de la semana.' });
  if (n.pct != null && n.pct >= 80) ideas.push({ titulo: 'Sube un poquito el reto', detalle: 'Vas muy bien: prueba a añadir 30 minutos más a tu objetivo principal.' });
  ideas.push({ titulo: 'Prepara la semana en 5 minutos', detalle: 'Mira tu horario el domingo y mueve lo que no te cuadre antes de que empiece.' });
  return { texto: l.join(' '), ideas: ideas.slice(0, 3) };
}

/** Hora (en minutos) a partir de la cual toca la revisión de la noche. */
export const HORA_REVISION = 20 * 60;

/** Números de un día para la revisión nocturna: qué salió bien y qué quedó sin hacer. */
export function resumenDia(d, fecha) {
  const bs = d.blocks.filter(b => b.fecha === fecha).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const activos = d.habits.filter(h => inicioHabito(h, d.inicioApp) <= fecha);
  const dia = progresoDiario({ ...d, desde: fecha, hasta: fecha })[0];
  const horas = d.goals.map(g => ({ titulo: g.titulo, min: sum(bs.filter(b => b.goalId === g.id && b.hecho), minutos) })).filter(x => x.min);
  const tareas = d.tasks.filter(t => t.hecho && t.hechoEn === fecha).length;
  return {
    fecha, pct: dia.pct,
    bien: {
      bloques: bs.filter(b => b.hecho).map(b => b.titulo),
      habitos: activos.filter(h => h.registros.includes(fecha)).map(h => ({ titulo: h.titulo, emoji: h.emoji })),
      tareas, horas,
    },
    mal: {
      bloques: bs.filter(b => !b.hecho).map(b => ({ titulo: b.titulo, importante: Boolean(b.importante) })),
      habitos: activos.filter(h => !h.registros.includes(fecha)).map(h => ({ titulo: h.titulo, emoji: h.emoji })),
    },
    gastado: +sum((d.expenses || []).filter(e => e.fecha === fecha), e => e.importe).toFixed(2),
    ahorrado: +sum((d.contributions || []).filter(c => c.fecha === fecha), c => c.importe).toFixed(2),
    bloquesManana: d.blocks.filter(b => b.fecha === addDays(fecha, 1)).length,
  };
}

/** Resumen y hasta 2 consejos para mañana a partir de resumenDia() (sin IA). */
export function ideasDia(n) {
  const nada = !n.bien.bloques.length && !n.mal.bloques.length && !n.bien.habitos.length && !n.mal.habitos.length && !n.bien.tareas;
  let texto;
  if (n.pct == null || nada) texto = 'Hoy no tenías nada planificado. Un día libre también cuenta. 😌';
  else if (n.pct >= 80) texto = `Hoy has cumplido el ${n.pct} % de lo planificado. ¡Gran día! 🌟`;
  else if (n.pct >= 50) texto = `Hoy has cumplido el ${n.pct} % de lo planificado. Buen ritmo, sigue así. 💪`;
  else texto = `Hoy has cumplido el ${n.pct} % de lo planificado. No pasa nada: mañana es una página en blanco. 🌱`;

  const c = [];
  const importantes = n.mal.bloques.filter(b => b.importante);
  if (importantes.length) c.push({ titulo: `Dale prioridad a «${importantes[0].titulo}»`, detalle: 'Era importante y se quedó sin hacer. Muévelo a mañana a primera hora, antes de que el día se complique.' });
  else if (n.mal.bloques.length >= 3) c.push({ titulo: 'Planifica menos, cumple más', detalle: `Se quedaron ${n.mal.bloques.length} bloques sin hacer. Mañana deja solo lo imprescindible: mejor 2 bloques hechos que 5 a medias.` });
  else if (n.mal.bloques.length) c.push({ titulo: `Retoma «${n.mal.bloques[0].titulo}»`, detalle: 'Se quedó pendiente. Si sigue siendo importante, ponlo mañana en un hueco concreto.' });
  if (n.mal.habitos.length) c.push({ titulo: `No rompas la racha de «${n.mal.habitos[0].titulo}»`, detalle: 'Hoy no lo marcaste. Si aún estás a tiempo, hazlo ahora aunque sea en versión mínima (2 minutos).' });
  if (!n.bloquesManana) c.push({ titulo: 'Mañana no tienes nada planificado', detalle: 'Antes de dormir, añade 1 o 2 bloques. Despertar con el día decidido cuesta mucho menos.' });
  if (n.pct != null && n.pct >= 80 && c.length < 2) c.push({ titulo: 'Repite lo que ha funcionado', detalle: 'Hoy te salió redondo. Acuéstate a una hora razonable y empieza mañana igual.' });
  if (!c.length) c.push({ titulo: 'Descansa bien', detalle: 'Dormir bien es parte del plan: mañana rendirás mejor.' });
  return { texto, consejos: c.slice(0, 2) };
}

/** ¿Toca hacer hoy la revisión de la noche? (a partir de las 20:00 y si aún no se hizo) */
export function diaPendiente(hoy, ahora, revisionesDia = []) {
  return ahora >= HORA_REVISION && !revisionesDia.some(r => r.fecha === hoy);
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

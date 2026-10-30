// Hábitos en el horario: cada hábito tiene un objetivo asociado (cada día o X días por semana, a la hora
// del día elegida) para que el horario le reserve su momento. Marcar el hábito marca su bloque y al revés.
import { db } from './db.js';
import { getPrefs, getSettings, dispPorFecha } from './datos.js';
import { hoyISO, addDays, weekStart, uid } from './util.js';
import { generarSemana } from './scheduler.js';
import { habitoNuevo, habitoPorId, frasesDeHabito } from './habitos.js';

const AREA = { mover: 'salud', comer: 'salud', agua: 'salud', dormir: 'salud', cuidarte: 'salud', mente: 'personal', pantallas: 'personal', social: 'relaciones', aprender: 'estudio', orden: 'hogar' };
const TODOS_LOS_DIAS = [0, 1, 2, 3, 4, 5, 6];

// Por defecto se escribe directamente; el asistente pasa su registro para poder deshacer.
const directo = { put: (s, o) => db.put(s, o), del: (s, id) => db.del(s, id) };

/** Objetivo del horario para un hábito. */
export function objetivoDeHabito(h) {
  const cat = habitoPorId(h.catalogo)?.cat;
  const veces = h.veces || 7;
  return {
    id: uid(), titulo: `${h.emoji || '✨'} ${h.titulo}`, area: AREA[cat] || 'personal', prioridad: 2,
    horasSemana: Math.round(((h.min || 10) * veces) / 60 * 100) / 100, sesionMin: h.min || 10, momento: h.momento || 'cualquiera',
    dias: veces === 7 ? [...TODOS_LOS_DIAS] : [], esHabito: true, habitoId: h.id,
    porque: '', fechaLimite: '', creado: hoyISO(), archivado: false,
  };
}

/**
 * Coloca un solo objetivo en esta semana (desde hoy) y la siguiente sin mover nada de lo que ya hay.
 * Devuelve los bloques nuevos.
 */
export async function colocarObjetivo(goal, ops = directo) {
  const hoy = hoyISO();
  const [disponibilidad, prefs, settings] = await Promise.all([dispPorFecha(), getPrefs(), getSettings()]);
  const nuevos = [];
  for (const fecha of [hoy, addDays(weekStart(hoy), 7)]) {
    // Todo lo que ya está en el horario se respeta tal cual (como si estuviera fijado).
    const blocks = (await db.all('blocks')).map(b => ({ ...b, fijado: true }));
    const r = generarSemana({ fecha, goals: [goal], blocks, disponibilidad, prefs: { ...prefs, maxHorasDia: 24 }, settings });
    const frases = goal.habitoId ? frasesDeHabito(await db.get('habits', goal.habitoId) || {}) : [];
    for (const [i, b] of r.nuevos.entries()) {
      const bloque = { ...b, frase: frases.length ? frases[i % frases.length] : '' };
      await ops.put('blocks', bloque);
      nuevos.push(bloque);
    }
  }
  return nuevos;
}

/**
 * Crea un hábito (del catálogo o escrito por el usuario) con su objetivo y sus bloques en el horario.
 * def: alternativa del catálogo o { titulo, emoji, min, veces }. momento: 'manana' | 'tarde' | 'noche'.
 */
export async function crearHabito(def, momento, ops = directo) {
  const habito = habitoNuevo(def, hoyISO(), momento);
  const goal = objetivoDeHabito(habito);
  habito.goalId = goal.id;
  await ops.put('habits', habito);
  await ops.put('goals', goal);
  const bloques = await colocarObjetivo(goal, ops);
  return { habito, goal, bloques };
}

/** Pone en el horario un hábito que aún no estaba (los creados antes de esta función). */
export async function ponerEnHorario(habito, momento, ops = directo) {
  if (habito.goalId) return []; // ya está en el horario
  const h = { ...habito, momento, min: habito.min || habitoPorId(habito.catalogo)?.min || 10, veces: habito.veces || habitoPorId(habito.catalogo)?.veces || 7 };
  const goal = objetivoDeHabito(h);
  await ops.put('habits', { ...h, goalId: goal.id });
  await ops.put('goals', goal);
  return colocarObjetivo(goal, ops);
}

/** Borra un hábito: su objetivo se archiva y se quitan sus bloques pendientes. */
export async function borrarHabito(habito, ops = directo) {
  await ops.del('habits', habito.id);
  if (!habito.goalId) return;
  const goal = await db.get('goals', habito.goalId);
  if (goal) await ops.put('goals', { ...goal, archivado: true });
  const hoy = hoyISO();
  for (const b of await db.all('blocks')) if (b.goalId === habito.goalId && !b.hecho && b.fecha >= hoy) await ops.del('blocks', b.id);
}

/** Marca (o desmarca) un bloque y, si es de un hábito, también el hábito ese día. */
export async function marcarBloque(bloque, hecho, ops = directo) {
  await ops.put('blocks', { ...bloque, hecho });
  const goal = bloque.goalId ? await db.get('goals', bloque.goalId) : null;
  if (!goal?.habitoId) return;
  const h = await db.get('habits', goal.habitoId);
  if (h) await ops.put('habits', { ...h, registros: conFecha(h.registros, bloque.fecha, hecho) });
}

/** Marca (o desmarca) un hábito un día y, si tiene bloque ese día, también el bloque. */
export async function marcarHabito(habito, fecha, hecho, ops = directo) {
  await ops.put('habits', { ...habito, registros: conFecha(habito.registros, fecha, hecho) });
  if (!habito.goalId) return;
  const bloque = (await db.all('blocks')).find(b => b.goalId === habito.goalId && b.fecha === fecha);
  if (bloque && bloque.hecho !== hecho) await ops.put('blocks', { ...bloque, hecho });
}

const conFecha = (registros, fecha, hecho) => (hecho ? [...new Set([...registros, fecha])].sort() : registros.filter(d => d !== fecha));

export const MOMENTOS_HABITO = [['manana', '☀️ Por la mañana'], ['tarde', '🌆 Por la tarde'], ['noche', '🌙 Por la noche']];

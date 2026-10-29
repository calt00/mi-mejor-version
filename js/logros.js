// Logros y medallas: se desbloquean solos al cumplir cada condición.
import { db, kvGet, kvSet } from './db.js';
import { hoyISO, toast, sum } from './util.js';
import { estadoMeta } from './finanzas.js';
import { progresoDiario, mejorRacha } from './progreso.js';

const bloquesHechos = d => d.blocks.filter(b => b.hecho).length;
const ahorrado = d => sum(d.contributions, c => c.importe);
const rachaMax = d => Math.max(0, ...d.habits.map(mejorRacha));

// d = { blocks, habits, tasks, goals, savingsGoals, contributions, revisiones, serie, hoy }
export const LOGROS = [
  { id: 'primer-paso', icono: '👣', titulo: 'Primer paso', desc: 'Completa tu primer bloque', cumple: d => bloquesHechos(d) >= 1 },
  { id: 'bloques-10', icono: '🔟', titulo: 'En marcha', desc: 'Completa 10 bloques', cumple: d => bloquesHechos(d) >= 10 },
  { id: 'bloques-50', icono: '💪', titulo: 'Constante', desc: 'Completa 50 bloques', cumple: d => bloquesHechos(d) >= 50 },
  { id: 'bloques-100', icono: '🚀', titulo: 'Imparable', desc: 'Completa 100 bloques', cumple: d => bloquesHechos(d) >= 100 },
  { id: 'dia-perfecto', icono: '⭐', titulo: 'Día perfecto', desc: 'Cumple el 100 % de un día (con 2 cosas o más)', cumple: d => d.serie.some(x => x.pct === 100 && x.planificados >= 2) },
  { id: 'semana-perfecta', icono: '🌟', titulo: 'Semana de oro', desc: '7 días seguidos al 80 % o más', cumple: d => {
    let n = 0;
    for (const x of d.serie) { n = x.pct >= 80 ? n + 1 : 0; if (n >= 7) return true; }
    return false;
  } },
  { id: 'racha-7', icono: '🔥', titulo: 'Racha de 7', desc: 'Cumple un hábito 7 días seguidos', cumple: d => rachaMax(d) >= 7 },
  { id: 'racha-30', icono: '🏆', titulo: 'Racha de 30', desc: 'Cumple un hábito 30 días seguidos', cumple: d => rachaMax(d) >= 30 },
  { id: 'tareas-25', icono: '✅', titulo: 'Tachando', desc: 'Completa 25 tareas', cumple: d => d.tasks.filter(t => t.hecho).length >= 25 },
  { id: 'objetivo-completo', icono: '🎯', titulo: 'Misión cumplida', desc: 'Termina todas las tareas de un objetivo (3 o más)', cumple: d => d.goals.some(g => {
    const ts = d.tasks.filter(t => t.goalId === g.id);
    return ts.length >= 3 && ts.every(t => t.hecho);
  }) },
  { id: 'ahorro-100', icono: '🐷', titulo: 'Primera hucha', desc: 'Ahorra 100 € en tus metas', cumple: d => ahorrado(d) >= 100 },
  { id: 'ahorro-500', icono: '💰', titulo: 'Buen ahorrador', desc: 'Ahorra 500 € en tus metas', cumple: d => ahorrado(d) >= 500 },
  { id: 'ahorro-1000', icono: '💎', titulo: 'Mil euros', desc: 'Ahorra 1.000 € en tus metas', cumple: d => ahorrado(d) >= 1000 },
  { id: 'meta-cumplida', icono: '🏁', titulo: 'Meta alcanzada', desc: 'Completa una meta de ahorro', cumple: d => d.savingsGoals.some(m => estadoMeta(m, d.contributions, d.hoy).pct >= 1) },
  { id: 'revisiones-4', icono: '🧭', titulo: 'Con rumbo', desc: 'Haz 4 revisiones semanales', cumple: d => d.revisiones.length >= 4 },
];

export const logrosCumplidos = d => LOGROS.filter(l => l.cumple(d)).map(l => l.id);

export async function datosLogros() {
  const hoy = hoyISO();
  const [blocks, habits, tasks, goals, savingsGoals, contributions, revisiones, inicioApp] = await Promise.all([
    db.all('blocks'), db.all('habits'), db.all('tasks'), db.all('goals'), db.all('savingsGoals'), db.all('contributions'),
    kvGet('revisiones', []), kvGet('inicioApp', hoy),
  ]);
  const serie = progresoDiario({ blocks, habits, tasks, desde: inicioApp, hasta: hoy, inicioApp });
  return { hoy, blocks, habits, tasks, goals, savingsGoals, contributions, revisiones, serie };
}

// Guarda los logros nuevos (con su fecha) y los celebra.
export async function comprobarLogros() {
  const conseguidos = await kvGet('logros', {});
  const nuevos = logrosCumplidos(await datosLogros()).filter(id => !conseguidos[id]);
  if (!nuevos.length) return;
  const hoy = hoyISO();
  for (const id of nuevos) conseguidos[id] = hoy;
  await kvSet('logros', conseguidos);
  const l = LOGROS.find(x => x.id === nuevos[0]);
  toast(nuevos.length > 1 ? `🏅 ¡${nuevos.length} logros nuevos! Míralos en Progreso` : `🏅 Nuevo logro: ${l.icono} ${l.titulo}`, 3500);
  navigator.vibrate?.([30, 60, 30]);
}

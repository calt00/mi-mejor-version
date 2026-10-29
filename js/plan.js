// Plan a partir de tu texto: limpia y valida lo que propone la IA antes de guardarlo (sin IA ni base de datos).
import { toMin, toHHMM } from './util.js';
import { AREAS, CATEGORIAS } from './datos.js';

const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const AREAS_OK = new Set(AREAS.map(a => a[0]));
const MOMENTOS_OK = new Set(['cualquiera', 'manana', 'tarde', 'noche']);
const num = (v, min, max, def) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
const texto = (v, max = 400) => String(v ?? '').trim().slice(0, max);
const hora = h => (HHMM.test(String(h || '').trim()) ? toHHMM(toMin(String(h).trim())) : null);
const clave = s => texto(s).toLowerCase();

// Une franjas que se solapan o se tocan y las ordena.
export function unirFranjas(franjas) {
  const ord = franjas.map(f => [toMin(f.inicio), toMin(f.fin)]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of ord) {
    const ult = out[out.length - 1];
    if (ult && a <= ult[1]) ult[1] = Math.max(ult[1], b);
    else out.push([a, b]);
  }
  return out.map(([a, b]) => ({ inicio: toHHMM(a), fin: toHHMM(b) }));
}

/** Convierte la respuesta de la IA en un plan válido. */
export function normalizarPlan(raw = {}) {
  const p = raw.perfil || {};
  const perfil = {};
  for (const k of ['nombre', 'sobreMi', 'rutina', 'fortalezas', 'debilidades', 'motivacion']) {
    const v = texto(p[k], k === 'nombre' ? 40 : 600);
    if (v) perfil[k] = v;
  }

  const dias = Array.from({ length: 7 }, () => []);
  for (const f of raw.disponibilidad || []) {
    const d = Number(f.dia), inicio = hora(f.inicio), fin = hora(f.fin);
    if (Number.isInteger(d) && d >= 0 && d <= 6 && inicio && fin && toMin(fin) > toMin(inicio)) dias[d].push({ inicio, fin });
  }
  const disponibilidad = dias.some(d => d.length) ? dias.map(unirFranjas) : null;

  const pr = raw.preferencias || {};
  const preferencias = {
    sesionMin: Math.round(num(pr.sesionMin, 15, 240, 60) / 15) * 15,
    descansoMin: Math.round(num(pr.descansoMin, 0, 60, 10) / 5) * 5,
    maxHorasDia: num(pr.maxHorasDia, 0.5, 16, 3),
  };

  const vistos = new Set();
  const objetivos = (raw.objetivos || []).map(o => ({
    titulo: texto(o.titulo, 80),
    porque: texto(o.porque, 300),
    area: AREAS_OK.has(o.area) ? o.area : 'personal',
    prioridad: Math.round(num(o.prioridad, 1, 3, 2)),
    horasSemana: Math.round(num(o.horasSemana, 0, 40, 2) * 2) / 2,
    momento: MOMENTOS_OK.has(o.momento) ? o.momento : 'cualquiera',
    sesionMin: o.sesionMin ? Math.round(num(o.sesionMin, 15, 240, 60) / 15) * 15 : null,
    fechaLimite: FECHA.test(o.fechaLimite || '') ? o.fechaLimite : '',
    tareas: (o.tareas || []).map(t => texto(t, 120)).filter(Boolean).slice(0, 7),
  })).filter(o => o.titulo && !vistos.has(clave(o.titulo)) && vistos.add(clave(o.titulo)));

  const habitos = (raw.habitos || []).map(h => ({ titulo: texto(h.titulo, 60), emoji: texto(h.emoji, 4) || '✨' })).filter(h => h.titulo);

  const ing = raw.ingresos || {};
  const ingresos = Number(ing.nomina) > 0 ? { nomina: num(ing.nomina, 0, 1e6, 0), diaCobro: Math.round(num(ing.diaCobro, 1, 31, 1)), extras: num(ing.extras, 0, 1e6, 0) } : null;

  const gastosFijos = (raw.gastosFijos || []).map(g => ({
    nombre: texto(g.nombre, 60), importe: num(g.importe, 0, 1e6, 0),
    categoria: CATEGORIAS[g.categoria] ? g.categoria : 'otros', dia: g.dia ? Math.round(num(g.dia, 1, 31, 1)) : null,
    suscripcion: g.categoria === 'suscripciones',
  })).filter(g => g.nombre && g.importe > 0);

  const metasAhorro = (raw.metasAhorro || []).map(m => ({
    nombre: texto(m.nombre, 60), emoji: texto(m.emoji, 4) || '🐷', meta: Math.round(num(m.meta, 0, 1e7, 0)),
    fechaLimite: FECHA.test(m.fechaLimite || '') ? m.fechaLimite : '', prioridad: Math.round(num(m.prioridad, 1, 3, 2)),
  })).filter(m => m.nombre && m.meta > 0);

  return { resumen: texto(raw.resumen, 1200), perfil, disponibilidad, preferencias, objetivos, habitos, ingresos, gastosFijos, metasAhorro };
}

const TIPOS_TURNO = new Set(['manana', 'tarde', 'noche']);

/** Valida los turnos rotativos que devuelve el intérprete. null si no hay o no son válidos. */
export function normalizarTurnos(t) {
  if (!t?.rotativo || !Array.isArray(t.patron)) return null;
  const patron = t.patron.filter(x => TIPOS_TURNO.has(x)).slice(0, 12);
  const tipos = [...new Set(patron)];
  if (tipos.length < 2 && patron.length < 2) return null;
  if (!FECHA.test(t.referencia || '')) return null;
  const disponibilidad = {}, horarios = {};
  for (const tipo of tipos) {
    const dias = t.disponibilidad?.[tipo];
    if (!Array.isArray(dias) || dias.length !== 7) return null;
    disponibilidad[tipo] = dias.map(fr => unirFranjas((fr || []).filter(f => hora(f.inicio) && hora(f.fin))));
    const h = t.horarios?.[tipo];
    if (h && hora(h.inicio) && hora(h.fin)) horarios[tipo] = { inicio: hora(h.inicio), fin: hora(h.fin) };
  }
  return { rotativo: true, patron, referencia: t.referencia, inicioCiclo: Math.round(num(t.inicioCiclo, 0, 6, 0)), horarios, disponibilidad };
}

/** Marca qué elementos del plan ya existen (mismo título), para actualizarlos en vez de duplicarlos. */
export function cruzarConExistentes(plan, { goals = [], habits = [], savingsGoals = [], fixedExpenses = [] }) {
  const por = (lista, campo) => new Map(lista.map(x => [clave(x[campo]), x]));
  const g = por(goals.filter(x => !x.archivado), 'titulo'), h = por(habits, 'titulo'), m = por(savingsGoals, 'nombre'), f = por(fixedExpenses, 'nombre');
  return {
    ...plan,
    objetivos: plan.objetivos.map(o => ({ ...o, existente: g.get(clave(o.titulo))?.id || null })),
    habitos: plan.habitos.map(x => ({ ...x, existente: h.get(clave(x.titulo))?.id || null })),
    metasAhorro: plan.metasAhorro.map(x => ({ ...x, existente: m.get(clave(x.nombre))?.id || null })),
    gastosFijos: plan.gastosFijos.map(x => ({ ...x, existente: f.get(clave(x.nombre))?.id || null })),
  };
}

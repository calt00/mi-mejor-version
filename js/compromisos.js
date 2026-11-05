// Compromisos fijos de cada día (levantarte, trabajo, clases y trayectos), sacados de las respuestas del cuestionario.
// No se guardan como bloques: se calculan al pintar, así un día libre los quita sin dejar rastro.
import { weekday, addDays, toHHMM, toMin } from './util.js';
import { trabajosDe, estadoInicial } from './configuracion.js';
import { tipoTurno } from './interprete.js';
import { acostarObjetivo } from './sueno.js';

const NOMBRE = { trabajo: 'Trabajo', estudio: 'Estudios' };
const IR = { trabajo: 'Ir al trabajo', estudio: 'Ir a clase' };

/**
 * A qué hora te levantas ese día. Por orden: la de tu plan de sueño (si ya ha empezado), la de tu turno o la de siempre;
 * y si entras pronto a trabajar o a clase, se adelanta lo justo para llegar con tiempo (como hace el cálculo de horas libres).
 */
export function horaLevantarse({ e, turnos, fecha, plan, items }) {
  const turno = e.tipoHorario === 'turnos' && turnos?.rotativo ? tipoTurno(turnos, fecha) : null;
  const o = acostarObjetivo(plan, turno || 'general', fecha);
  if (o && !o.alDia) return o.levantar;
  const trabajaConTurno = turno && e.suenoTurnos?.[turno] && items.some(c => c.que === 'trabajo' && c.turno === turno);
  let levantar = toMin(trabajaConTurno ? e.suenoTurnos[turno].levantar : e.levantar);
  const primero = items.length ? items.reduce((a, c) => (c.ini < a.ini ? c : a)) : null;
  if (primero && levantar > primero.ini - (primero.trayecto || 0) - 20) levantar = Math.max(0, primero.ini - (primero.trayecto || 0) - 50);
  return toHHMM(levantar);
}

/**
 * Lo que tienes ese día: levantarte, ir, trabajar o estudiar y volver. `libres` es el mapa de días libres:
 * ese día no hay trabajo ni clase (aunque sí la vuelta a casa de un turno de noche que empezó el día anterior).
 */
export function compromisosDelDia({ config, turnos, fecha, libres = {}, plan = null }) {
  if (!config) return [];
  const e = { ...estadoInicial(), ...config };
  const trabajos = trabajosDe(e);
  const turnoDe = f => (e.tipoHorario === 'turnos' && turnos?.rotativo ? tipoTurno(turnos, f) : null);
  const aplica = (c, f) => c.dias.has(weekday(f)) && (!c.turno || c.turno === turnoDe(f));
  const out = [];
  const poner = (c, tipo, titulo, ini, fin, sentido = null) => out.push({
    id: `c-${fecha}-${out.length}`, compromiso: true, tipo, que: c.que, sentido, fecha, titulo, inicio: toHHMM(Math.max(0, ini)), fin: toHHMM(fin),
  });
  const ayer = addDays(fecha, -1);
  const hoyAplican = libres[fecha] ? [] : trabajos.filter(c => aplica(c, fecha));
  for (const c of trabajos) {
    if (hoyAplican.includes(c)) {
      if (c.trayecto) poner(c, 'trayecto', IR[c.que], c.ini - c.trayecto, c.ini, 'ida');
      poner(c, c.que, NOMBRE[c.que], c.ini, c.fin);
      if (c.trayecto && c.fin + c.trayecto <= 1440) poner(c, 'trayecto', 'Volver a casa', c.fin, c.fin + c.trayecto, 'vuelta');
    }
    // Un turno de noche que acabó esta madrugada: la vuelta a casa cae hoy.
    if (c.fin > 1440 && c.trayecto && !libres[ayer] && aplica(c, ayer)) poner(c, 'trayecto', 'Volver a casa', c.fin - 1440, c.fin - 1440 + c.trayecto, 'vuelta');
  }
  const hora = horaLevantarse({ e, turnos, fecha, plan, items: hoyAplican });
  out.push({ id: `c-${fecha}-despertar`, compromiso: true, tipo: 'despertar', que: null, sentido: null, fecha, titulo: 'Levantarte', inicio: hora, fin: hora });
  return out.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

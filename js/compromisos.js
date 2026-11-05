// Compromisos fijos de cada día (trabajo, clases y trayectos), sacados de las respuestas del cuestionario.
// No se guardan como bloques: se calculan al pintar, así un día libre los quita sin dejar rastro.
import { weekday, addDays, toHHMM } from './util.js';
import { trabajosDe, estadoInicial } from './configuracion.js';
import { tipoTurno } from './interprete.js';

const NOMBRE = { trabajo: 'Trabajo', estudio: 'Estudios' };
const IR = { trabajo: 'Ir al trabajo', estudio: 'Ir a clase' };

/**
 * Lo que tienes ese día: ir, trabajar o estudiar y volver. `libres` es el mapa de días libres:
 * ese día no hay nada (aunque sí la vuelta a casa de un turno de noche que empezó el día anterior).
 */
export function compromisosDelDia({ config, turnos, fecha, libres = {} }) {
  if (!config) return [];
  const e = { ...estadoInicial(), ...config };
  const trabajos = trabajosDe(e);
  if (!trabajos.length) return [];
  const turnoDe = f => (e.tipoHorario === 'turnos' && turnos?.rotativo ? tipoTurno(turnos, f) : null);
  const aplica = (c, f) => c.dias.has(weekday(f)) && (!c.turno || c.turno === turnoDe(f));
  const out = [];
  const poner = (c, tipo, titulo, ini, fin, sentido = null) => out.push({
    id: `c-${fecha}-${out.length}`, compromiso: true, tipo, que: c.que, sentido, fecha, titulo, inicio: toHHMM(Math.max(0, ini)), fin: toHHMM(fin),
  });
  const ayer = addDays(fecha, -1);
  for (const c of trabajos) {
    if (!libres[fecha] && aplica(c, fecha)) {
      if (c.trayecto) poner(c, 'trayecto', IR[c.que], c.ini - c.trayecto, c.ini, 'ida');
      poner(c, c.que, NOMBRE[c.que], c.ini, c.fin);
      if (c.trayecto && c.fin + c.trayecto <= 1440) poner(c, 'trayecto', 'Volver a casa', c.fin, c.fin + c.trayecto, 'vuelta');
    }
    // Un turno de noche que acabó esta madrugada: la vuelta a casa cae hoy.
    if (c.fin > 1440 && c.trayecto && !libres[ayer] && aplica(c, ayer)) poner(c, 'trayecto', 'Volver a casa', c.fin - 1440, c.fin - 1440 + c.trayecto, 'vuelta');
  }
  return out.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

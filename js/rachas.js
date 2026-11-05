// Rachas de hábitos. Un día libre «de verdad» no las rompe: se salta, sin sumar ni restar.
import { addDays, hoyISO } from './util.js';

// Los días libres (mapa fecha → { modo }) se fijan al arrancar la app y al cambiarlos; así cualquier pantalla los respeta.
let libresGlobal = {};
export const fijarDiasLibres = mapa => { libresGlobal = mapa || {}; };

const esLibre = (f, libres) => libres[f]?.modo === 'libre';

/** Días seguidos hasta hoy (o hasta ayer si hoy aún no está marcado), saltándose los días libres. */
export function rachaActual(registros, hoy = hoyISO(), libres = libresGlobal) {
  let n = 0, d = registros.includes(hoy) ? hoy : addDays(hoy, -1);
  for (let guarda = 0; guarda < 4000; guarda++) {
    if (registros.includes(d)) n++;
    else if (!esLibre(d, libres)) break;
    d = addDays(d, -1);
  }
  return n;
}

// ¿Todos los días entre a y b (sin incluirlos) son libres? Entonces a y b cuentan como seguidos.
const unidos = (a, b, libres) => {
  for (let d = addDays(a, 1); d < b; d = addDays(d, 1)) if (!esLibre(d, libres)) return false;
  return true;
};

/** La racha más larga de todas, saltándose los días libres. */
export function mejorRachaDe(registros, libres = libresGlobal) {
  const dias = [...new Set(registros)].sort();
  let mejor = 0, actual = 0;
  dias.forEach((d, i) => {
    actual = i && unidos(dias[i - 1], d, libres) ? actual + 1 : 1;
    mejor = Math.max(mejor, actual);
  });
  return mejor;
}

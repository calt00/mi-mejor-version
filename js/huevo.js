// Tu huevo y tu compañero: cuánto se calienta, cuándo eclosiona y cómo crece. Sin pantallas: se prueba solo.
// La idea es premiar la constancia: cada día que cumples lo suficiente lo calientas, encadenar días buenos
// lo calienta más y un día flojo lo enfría un poco. Los días libres no cuentan ni restan.

/**
 * Los cinco huevos. Cuanto más difícil, más días buenos hacen falta y más exigente es lo que cuenta como bueno
 * (`umbral` = % del día que hay que cumplir). Los nombres no dicen qué hay dentro.
 */
export const HUEVOS = [
  { id: 'ascua', nombre: 'Ascua', dificultad: 1, requisito: 7, umbral: 50, frase: 'Tibio y tranquilo. Perfecto para empezar.' },
  { id: 'rocio', nombre: 'Rocío', dificultad: 2, requisito: 14, umbral: 60, frase: 'Húmedo y brillante. Le gusta la constancia suave.' },
  { id: 'niebla', nombre: 'Niebla', dificultad: 3, requisito: 21, umbral: 65, frase: 'Frío y callado. Tarda en abrirse, pero merece la pena.' },
  { id: 'eclipse', nombre: 'Eclipse', dificultad: 4, requisito: 30, umbral: 75, frase: 'Oscuro y exigente. Solo responde a los días buenos.' },
  { id: 'aurora', nombre: 'Aurora', dificultad: 5, requisito: 45, umbral: 80, frase: 'Una leyenda. Lo pide casi todo y lo devuelve con creces.' },
];
export const huevoPorId = id => HUEVOS.find(h => h.id === id);

const redondear = n => Math.round(n * 100) / 100;

/**
 * Calor acumulado a partir del % cumplido de cada día (la salida de progresoDiario).
 *  · día bueno (≥ umbral): +1, y +0,25 por cada día bueno seguido (hasta +1 extra: una buena racha da el doble).
 *  · día flojo (< umbral): −0,5 (nunca baja de 0). El día de hoy no resta hasta que acaba.
 *  · sin nada planificado o día libre (pct nulo): no cuenta.
 */
export function calorHuevo(serie, { umbral, hoy }) {
  let calor = 0, racha = 0, buenos = 0, malos = 0;
  for (const d of serie) {
    if (d.pct == null) continue;
    if (d.pct >= umbral) { racha++; buenos++; calor += 1 + Math.min(1, 0.25 * (racha - 1)); }
    else if (d.fecha < hoy) { racha = 0; malos++; calor = Math.max(0, calor - 0.5); }
  }
  return { calor: redondear(calor), racha, buenos, malos };
}

/** Cómo se ve el huevo según lo caliente que está: 0 (nada) … 4 (a punto de abrirse). */
export function etapaHuevo(fraccion) {
  if (fraccion < 0.15) return 0;
  if (fraccion < 0.4) return 1;
  if (fraccion < 0.7) return 2;
  if (fraccion < 0.9) return 3;
  return 4;
}

/** Etapa de la criatura según el calor más alto que ha llegado a tener (nunca retrocede): 1 cría, 2 joven, 3 adulta. */
export const etapaCriatura = (pico, requisito) => (pico >= requisito * 4 ? 3 : pico >= requisito * 2 ? 2 : 1);

/** Lo que falta para la siguiente etapa: { desde, hasta } en calor, o null si ya es adulta. */
export function tramoSiguiente(pico, requisito) {
  const etapa = etapaCriatura(pico, requisito);
  if (etapa >= 3) return null;
  return { desde: requisito * (etapa === 1 ? 1 : 2), hasta: requisito * (etapa === 1 ? 2 : 4), etapa };
}

/** Días que faltan si sigues así: se calcula con el calor que ganas un día bueno (1 más lo que da tu racha). */
export function diasHastaEclosion(calor, requisito, racha = 0) {
  const resto = Math.max(0, requisito - calor);
  const gana = 1 + Math.min(1, 0.25 * Math.max(0, racha));
  return Math.ceil(resto / gana);
}

/** Estado de ánimo de la criatura según cómo te han ido los últimos días (sin contar hoy): feliz | normal | dormido. */
export function humorCriatura(serie, hoy) {
  const recientes = serie.filter(d => d.fecha < hoy && d.pct != null).slice(-3);
  if (!recientes.length) return 'normal';
  const media = recientes.reduce((a, d) => a + d.pct, 0) / recientes.length;
  return media >= 65 ? 'feliz' : media < 30 ? 'dormido' : 'normal';
}

/** Todo junto: lo que necesita la pantalla. `huevo` es lo guardado ({ id, inicio, eclosion, nombre, pico }). */
export function estadoHuevo({ huevo, serie, hoy }) {
  if (!huevo) return null;
  const def = huevoPorId(huevo.id);
  if (!def) return null;
  const c = calorHuevo(serie, { umbral: def.umbral, hoy });
  const pico = Math.max(huevo.pico || 0, c.calor);
  const eclosionado = Boolean(huevo.eclosion);
  const fraccion = Math.min(1, c.calor / def.requisito);
  return {
    def, ...c, pico, eclosionado, fraccion, nombre: huevo.nombre || '', eclosion: huevo.eclosion || null,
    listo: !eclosionado && c.calor >= def.requisito, // toca eclosionar
    etapaHuevo: etapaHuevo(fraccion),
    etapaCriatura: etapaCriatura(pico, def.requisito),
    humor: humorCriatura(serie, hoy),
    siguiente: eclosionado ? tramoSiguiente(pico, def.requisito) : null,
    faltan: eclosionado ? 0 : diasHastaEclosion(c.calor, def.requisito, c.racha),
  };
}

// Lo que dice al tocarlo: sin decir nunca qué es.
const FRASES_HUEVO = [
  ['Está quieto… por ahora.', 'No se oye nada. Sigue calentándolo.', 'Está esperando.'],
  ['Está un poco más calentito.', 'Algo se movió dentro.', 'Notas un latido muy suave.'],
  ['¡Se ha movido!', 'Late más fuerte.', 'Parece que te escucha.'],
  ['Hay una grieta… ¡y sigue creciendo!', 'Se oye un toc-toc.', 'Brilla un poquito por dentro.'],
  ['¡Está a punto de abrirse!', 'Tiembla de ganas de salir.', 'Un poco más y sale.'],
];
const FRASES_CRIATURA = {
  feliz: ['¡Está encantado!', 'Se acurruca contigo.', 'Hace un sonidito feliz.', 'Te mira con ojos brillantes.'],
  normal: ['Te mira con curiosidad.', 'Ladea la cabeza.', 'Está tranquilo.', 'Se estira un poco.'],
  dormido: ['Bosteza… tiene sueño.', 'Está medio dormido. Anímalo con un buen día.', 'Se hace una bolita.'],
};
export function fraseAlTocar(estado, n = Math.random()) {
  const lista = estado.eclosionado ? FRASES_CRIATURA[estado.humor] : FRASES_HUEVO[estado.etapaHuevo];
  return lista[Math.floor(n * lista.length) % lista.length];
}

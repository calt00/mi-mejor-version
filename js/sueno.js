// Sueño: cuánto duermes, a qué hora, si es lo mejor para ti y un plan gradual para mejorarlo. Sin IA y sin pantallas.
// Las pautas son las generales de los expertos (p. ej. la Academia Americana de Medicina del Sueño
// y la National Sleep Foundation): los adultos necesitan entre 7 y 9 horas, el reloj interno se ordena con
// la luz de la mañana y una hora de levantarse estable, y los cambios de horario funcionan mejor poco a poco
// (unos 15 minutos cada 2-3 días) que de golpe. No sustituye a un médico.
import { toMin, toHHMM, diasEntre } from './util.js';

export const MIN_RECOMENDADO = 420; // 7 h
export const MAX_RECOMENDADO = 540; // 9 h
export const OBJETIVO_MIN = 450;    // 7 h 30: un punto medio realista
export const RITMO_DURACION = 30;   // minutos por semana al ganar horas de sueño
export const RITMO_HORARIO = 45;    // minutos por semana al mover el horario (≈ 15 min cada 2-3 días)
const MAX_SEMANAS = 12;

/** Ajustes de los avisos y del horario: minutos de antelación, si suena como alarma y si el horario sigue el plan. */
export const AJUSTES_SUENO = { antelacion: 30, alarma: false, ajustarHorario: true, alarmaDespertar: true };

/** Hora de acostarse en minutos desde las 00:00 del día: de madrugada cuenta como «pasadas las 24:00». */
export const acostarAbs = hhmm => { const m = toMin(hhmm); return m < 360 ? m + 1440 : m; };

/** Quita de las franjas libres lo que cae dentro de la media hora previa a acostarte. */
export function recortarFranjas(franjas, acostar) {
  const tope = Math.min(acostar - 30, 1439);
  return franjas.map(f => ({ inicio: f.inicio, fin: toHHMM(Math.min(toMin(f.fin), tope)) }))
    .filter(f => toMin(f.fin) - toMin(f.inicio) >= 30);
}

const mod = m => ((m % 1440) + 1440) % 1440;
// Cuántos minutos hay que ADELANTAR `desde` para llegar a `hasta` (negativo: hay que retrasarlo). Siempre entre -12 h y 12 h.
const adelantar = (desde, hasta) => mod(desde - hasta + 720) - 720;
const redondear5 = m => Math.round(m / 5) * 5;

/** Minutos entre acostarte y levantarte (pasando por la medianoche si hace falta). */
export function dormirMin(acostar, levantar) {
  const d = toMin(levantar) - toMin(acostar);
  return d > 0 ? d : d + 1440;
}

export const horasTxt = min => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
};

/** ¿Cuántas horas? nivel: bien | justo | poco | mucho. */
export function valorarSueno(min) {
  if (min < 360) return { nivel: 'poco', icono: '🚨', titulo: 'Duermes muy poco', texto: 'Dormir menos de 6 horas de forma habitual se asocia a más cansancio, peor concentración y peor ánimo. Vamos a corregirlo poco a poco.' };
  if (min < MIN_RECOMENDADO) return { nivel: 'justo', icono: '⚠️', titulo: 'Duermes algo menos de lo recomendado', texto: 'Los expertos recomiendan entre 7 y 9 horas. Te falta un poco: con pequeños cambios lo consigues.' };
  if (min <= MAX_RECOMENDADO) return { nivel: 'bien', icono: '✅', titulo: 'Duermes las horas recomendadas', texto: 'Entre 7 y 9 horas es lo ideal. Lo mejor ahora es mantenerlo y levantarte siempre a una hora parecida.' };
  return { nivel: 'mucho', icono: '💤', titulo: 'Duermes más de lo habitual', texto: 'Pasar de 9 horas en cama de forma habitual puede ser una señal de sueño poco reparador. Si aun así te levantas cansado, consúltalo con tu médico.' };
}

/**
 * ¿Es buen horario para una vida de día? Dormir 8 horas de 4:00 a 12:00 cumple las horas, pero pierde la luz de la
 * mañana y descuadra tu reloj con el resto del mundo. En el turno de noche dormir de día es inevitable y en el de
 * mañana ya madrugas, así que solo se mira sin turnos y en el de tarde (que tolera acostarse y levantarse algo más tarde).
 */
export function valorarHorario(acostar, levantar, turno = null) {
  if (turno === 'noche' || turno === 'manana') return { retrasado: false };
  const [limiteCama, limiteAlba] = turno === 'tarde' ? [120, 660] : [90, 630]; // 02:00/11:00 con turno de tarde; 01:30/10:30 si no
  const cama = toMin(acostar), alba = toMin(levantar);
  const camaTarde = cama >= limiteCama && cama < 1080, albaTarde = alba >= limiteAlba && alba < 1080;
  if (!camaTarde && !albaTarde) return { retrasado: false };
  return {
    retrasado: true, icono: '🌙', titulo: 'Tu horario de sueño está desplazado',
    texto: 'Dormir las horas necesarias es bueno, pero acostarte de madrugada y levantarte a media mañana o más tarde te hace perder la luz de la mañana, desajusta tu reloj interno con la vida diaria (trabajo, comidas, familia) y suele notarse en el ánimo y la energía. Para una vida de día, lo más sano es acostarte entre las 22:00 y las 00:00 y levantarte temprano.',
  };
}

/**
 * Plan gradual para mejorar, que se mueve unos minutos cada semana:
 *  - Horario desplazado: acostarse y levantarse se adelantan juntos hasta unos 23:30 (00:00 con turno de tarde),
 *    manteniendo entre 7 h 30 y 8 h de sueño.
 *  - Pocas horas: la hora de levantarse se queda fija y la de acostarse se adelanta hasta llegar a 7 h 30.
 * Si no hay nada que mejorar, no hay pasos.
 */
export function planSueno(acostar, levantar, { turno = null } = {}) {
  const actual = dormirMin(acostar, levantar), horario = valorarHorario(acostar, levantar, turno);
  let destino, ritmo, tipo;
  if (horario.retrasado) {
    const cama = turno === 'tarde' ? 0 : 1410;
    const dur = Math.min(480, Math.max(OBJETIVO_MIN, actual));
    destino = { cama, alba: mod(cama + dur) }; ritmo = RITMO_HORARIO; tipo = 'horario';
  } else if (actual < MIN_RECOMENDADO) {
    destino = { cama: mod(toMin(acostar) - (OBJETIVO_MIN - actual)), alba: toMin(levantar) }; ritmo = RITMO_DURACION; tipo = 'duracion';
  } else return { actual, objetivo: actual, falta: 0, tipo: null, destino: null, pasos: [] };

  const dCama = adelantar(toMin(acostar), destino.cama), dAlba = adelantar(toMin(levantar), destino.alba);
  const mayor = Math.max(Math.abs(dCama), Math.abs(dAlba));
  const n = Math.min(MAX_SEMANAS, Math.max(1, Math.ceil(mayor / ritmo)));
  const pasos = Array.from({ length: n }, (_, i) => {
    const f = Math.min(1, ((i + 1) * ritmo) / Math.max(1, mayor));
    const cama = mod(redondear5(toMin(acostar) - f * dCama)), alba = mod(redondear5(toMin(levantar) - f * dAlba));
    return { semana: i + 1, acostar: toHHMM(cama), levantar: toHHMM(alba), durMin: dormirMin(toHHMM(cama), toHHMM(alba)) };
  });
  const ultimo = pasos.at(-1);
  return { actual, objetivo: ultimo.durMin, falta: Math.max(0, OBJETIVO_MIN - actual), tipo, destino: { acostar: toHHMM(destino.cama), levantar: toHHMM(destino.alba) }, pasos };
}

const CONSEJOS_BASE = [
  { emoji: '⏰', titulo: 'Levántate siempre a una hora parecida', detalle: 'Es lo que más ordena tu reloj interno. Intenta no variar más de una hora, ni siquiera tus días libres.' },
  { emoji: '🌅', titulo: 'Luz al despertar, penumbra al acostarte', detalle: 'Sal 10-15 minutos a la luz natural nada más levantarte. Por la noche, baja las luces una hora antes.' },
  { emoji: '📵', titulo: 'Pantallas fuera 30-60 minutos antes', detalle: 'La luz y las notificaciones te mantienen activo. Cambia el móvil por un libro o música tranquila.' },
  { emoji: '☕', titulo: 'Cafeína: no en las 6-8 horas previas a dormir', detalle: 'El café, el té fuerte y las bebidas energéticas siguen haciendo efecto durante horas.' },
  { emoji: '🛏️', titulo: 'Dormitorio oscuro, fresco y silencioso', detalle: 'Alrededor de 18-19 °C, sin luces ni ruidos. Usa antifaz o tapones si hace falta.' },
  { emoji: '🍽️', titulo: 'Cena ligera y sin alcohol', detalle: 'Cenar pesado o beber alcohol hace el sueño más superficial, aunque te duermas antes.' },
];

const CONSEJOS_HORARIO = [
  { emoji: '☀️', titulo: 'Mucha luz nada más levantarte', detalle: 'Es lo que más te ayuda a adelantar el reloj. Sal a la calle o ponte junto a una ventana 15-30 minutos, sin gafas de sol si puedes.' },
  { emoji: '🌑', titulo: 'Luz tenue por la noche', detalle: 'Desde dos horas antes de la hora nueva de acostarte, baja las luces y deja las pantallas. La luz fuerte de noche te retrasa el sueño.' },
  { emoji: '☕', titulo: 'Cafeína solo por la mañana', detalle: 'Evítala desde primera hora de la tarde mientras ajustas el horario.' },
  { emoji: '📆', titulo: 'Misma hora de levantarte todos los días', detalle: 'También el fin de semana. Si un día te desvías, que sea menos de una hora.' },
  { emoji: '🧪', titulo: 'Melatonina: solo con indicación médica', detalle: 'Puede ayudar a algunas personas, pero la dosis y el momento importan. Consúltalo antes con tu médico o farmacéutico.' },
];

const CONSEJOS_TURNO = {
  manana: [{ emoji: '🌙', titulo: 'Turno de mañana: acuéstate pronto', detalle: 'Como madrugas, la clave es la hora de acostarte. Prepara la cena y la ropa de antemano para no alargar la noche.' }],
  tarde: [{ emoji: '🌤️', titulo: 'Turno de tarde: protege la mañana', detalle: 'Aprovecha para dormir hasta que tu cuerpo lo pida y haz algo de luz y ejercicio suave antes de ir a trabajar.' }],
  noche: [
    { emoji: '🕶️', titulo: 'Turno de noche: evita la luz al volver', detalle: 'Usa gafas de sol de camino a casa y duerme en una habitación completamente a oscuras (persianas o antifaz).' },
    { emoji: '😴', titulo: 'Siesta antes del turno', detalle: 'Una siesta de 20-30 minutos antes de empezar ayuda a aguantar la noche. Evita la cafeína en la segunda mitad del turno.' },
  ],
};

/** Consejos según el turno y el nivel: más prácticos cuanto menos duermes o más desplazado está el horario. */
export function consejosSueno({ turno = null, nivel = 'bien', retrasado = false } = {}) {
  const extra = nivel === 'poco' || nivel === 'justo'
    ? [{ emoji: '💤', titulo: 'Si no puedes acostarte antes, haz una siesta corta', detalle: 'De 20 a 30 minutos y antes de las 16:00 (o antes del turno si trabajas de noche). Más larga puede dejarte aturdido y quitarte el sueño por la noche.' }]
    : [];
  const base = retrasado ? CONSEJOS_HORARIO : CONSEJOS_BASE.slice(0, nivel === 'bien' ? 3 : 6);
  return [...(CONSEJOS_TURNO[turno] || []), ...base, ...extra];
}

const ETIQUETA_TURNO = { manana: 'Turno de mañana', tarde: 'Turno de tarde', noche: 'Turno de noche' };

/**
 * Análisis del sueño según las respuestas del cuestionario: un perfil por turno activo
 * (o uno solo si el horario no es por turnos).
 */
export function analizarSueno(e) {
  const perfil = (clave, etiqueta, acostar, levantar, turno) => {
    const plan = planSueno(acostar, levantar, { turno }), v = valorarSueno(plan.actual), horario = valorarHorario(acostar, levantar, turno);
    return { clave, etiqueta, turno, acostar, levantar, ...v, horario, plan, consejos: consejosSueno({ turno, nivel: v.nivel, retrasado: horario.retrasado }) };
  };
  const turnos = e.trabaja && e.tipoHorario === 'turnos';
  if (!turnos) return [perfil('general', 'Tu sueño', e.acostar, e.levantar, null)];
  return Object.entries(e.turnos.tipos).filter(([, t]) => t.activo)
    .map(([k]) => perfil(k, ETIQUETA_TURNO[k], e.suenoTurnos[k].acostar, e.suenoTurnos[k].levantar, k));
}

/** Lo que se guarda: el plan arranca el día `inicio` (el que elija la persona). */
export const planParaGuardar = (perfiles, inicio) => ({ inicio, perfiles });

/**
 * Qué toca en `fecha` según el plan: acostarse y levantarse esa semana.
 * Antes de empezar el plan (`pendiente`) se mantienen las horas de ahora.
 */
export function acostarObjetivo(guardado, clave, fecha) {
  const p = guardado?.perfiles?.find(x => x.clave === clave);
  if (!p) return null;
  const total = p.plan.pasos.length;
  if (!total) return { acostar: p.acostar, levantar: p.levantar, semana: 0, total: 0, alDia: true };
  const dias = diasEntre(guardado.inicio, fecha);
  if (dias < 0) return { acostar: p.acostar, levantar: p.levantar, semana: 0, total, alDia: true, pendiente: true, inicio: guardado.inicio };
  const idx = Math.min(total - 1, Math.floor(dias / 7));
  const paso = p.plan.pasos[idx];
  return { acostar: paso.acostar, levantar: paso.levantar, semana: idx + 1, total, alDia: false, durMin: paso.durMin };
}

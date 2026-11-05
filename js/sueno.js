// Sueño: cuánto duermes, si es suficiente y un plan gradual para mejorarlo. Sin IA y sin pantallas.
// Las pautas son las generales de los expertos (p. ej. la Academia Americana de Medicina del Sueño
// y la National Sleep Foundation): los adultos necesitan entre 7 y 9 horas, y los cambios de horario
// funcionan mejor poco a poco que de golpe. No sustituye a un médico.
import { toMin, toHHMM, diasEntre } from './util.js';

export const MIN_RECOMENDADO = 420; // 7 h
export const MAX_RECOMENDADO = 540; // 9 h
export const OBJETIVO_MIN = 450;    // 7 h 30: un punto medio realista
const PASO_SEMANAL = 30;            // minutos que se adelanta la hora de acostarse cada semana (≈15 min cada 3-4 días)
const MAX_SEMANAS = 8;

/** Ajustes de los avisos y del horario: minutos de antelación, si suena como alarma y si el horario sigue el plan. */
export const AJUSTES_SUENO = { antelacion: 30, alarma: false, ajustarHorario: true };

/** Hora de acostarse en minutos desde las 00:00 del día: de madrugada cuenta como «pasadas las 24:00». */
export const acostarAbs = hhmm => { const m = toMin(hhmm); return m < 360 ? m + 1440 : m; };

/** Quita de las franjas libres lo que cae dentro de la media hora previa a acostarte. */
export function recortarFranjas(franjas, acostar) {
  const tope = Math.min(acostar - 30, 1439);
  return franjas.map(f => ({ inicio: f.inicio, fin: toHHMM(Math.min(toMin(f.fin), tope)) }))
    .filter(f => toMin(f.fin) - toMin(f.inicio) >= 30);
}

const mod = m => ((m % 1440) + 1440) % 1440;

/** Minutos entre acostarte y levantarte (pasando por la medianoche si hace falta). */
export function dormirMin(acostar, levantar) {
  const d = toMin(levantar) - toMin(acostar);
  return d > 0 ? d : d + 1440;
}

export const horasTxt = min => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
};

/** ¿Es suficiente? nivel: bien | justo | poco | mucho. */
export function valorarSueno(min) {
  if (min < 360) return { nivel: 'poco', icono: '🚨', titulo: 'Duermes muy poco', texto: 'Dormir menos de 6 horas de forma habitual se asocia a más cansancio, peor concentración y peor ánimo. Vamos a corregirlo poco a poco.' };
  if (min < MIN_RECOMENDADO) return { nivel: 'justo', icono: '⚠️', titulo: 'Duermes algo menos de lo recomendado', texto: 'Los expertos recomiendan entre 7 y 9 horas. Te falta un poco: con pequeños cambios lo consigues.' };
  if (min <= MAX_RECOMENDADO) return { nivel: 'bien', icono: '✅', titulo: 'Tu sueño está en el rango recomendado', texto: 'Entre 7 y 9 horas es lo ideal. Lo mejor ahora es mantenerlo y levantarte siempre a una hora parecida.' };
  return { nivel: 'mucho', icono: '💤', titulo: 'Duermes más de lo habitual', texto: 'Pasar de 9 horas en cama de forma habitual puede ser una señal de sueño poco reparador. Si aun así te levantas cansado, consúltalo con tu médico.' };
}

/**
 * Plan gradual: la hora de levantarte se queda fija y la de acostarte se adelanta 30 minutos cada semana
 * hasta llegar a 7 h 30 min. Si ya duermes 7 h o más, no hace falta plan.
 */
export function planSueno(acostar, levantar) {
  const actual = dormirMin(acostar, levantar);
  if (actual >= MIN_RECOMENDADO) return { actual, objetivo: actual, falta: 0, pasos: [] };
  const falta = OBJETIVO_MIN - actual;
  const n = Math.min(MAX_SEMANAS, Math.ceil(falta / PASO_SEMANAL));
  const pasos = Array.from({ length: n }, (_, i) => {
    const quita = Math.min(falta, PASO_SEMANAL * (i + 1));
    return { semana: i + 1, acostar: toHHMM(mod(toMin(acostar) - quita)), durMin: actual + quita };
  });
  return { actual, objetivo: pasos.at(-1).durMin, falta, pasos };
}

const CONSEJOS_BASE = [
  { emoji: '⏰', titulo: 'Levántate siempre a una hora parecida', detalle: 'Es lo que más ordena tu reloj interno. Intenta no variar más de una hora, ni siquiera tus días libres.' },
  { emoji: '🌅', titulo: 'Luz al despertar, penumbra al acostarte', detalle: 'Sal 10-15 minutos a la luz natural nada más levantarte. Por la noche, baja las luces una hora antes.' },
  { emoji: '📵', titulo: 'Pantallas fuera 30-60 minutos antes', detalle: 'La luz y las notificaciones te mantienen activo. Cambia el móvil por un libro o música tranquila.' },
  { emoji: '☕', titulo: 'Cafeína: no en las 6-8 horas previas a dormir', detalle: 'El café, el té fuerte y las bebidas energéticas siguen haciendo efecto durante horas.' },
  { emoji: '🛏️', titulo: 'Dormitorio oscuro, fresco y silencioso', detalle: 'Alrededor de 18-19 °C, sin luces ni ruidos. Usa antifaz o tapones si hace falta.' },
  { emoji: '🍽️', titulo: 'Cena ligera y sin alcohol', detalle: 'Cenar pesado o beber alcohol hace el sueño más superficial, aunque te duermas antes.' },
];

const CONSEJOS_TURNO = {
  manana: [{ emoji: '🌙', titulo: 'Turno de mañana: acuéstate pronto', detalle: 'Como madrugas, la clave es la hora de acostarte. Prepara la cena y la ropa de antemano para no alargar la noche.' }],
  tarde: [{ emoji: '🌤️', titulo: 'Turno de tarde: protege la mañana', detalle: 'Aprovecha para dormir hasta que tu cuerpo lo pida y haz algo de luz y ejercicio suave antes de ir a trabajar.' }],
  noche: [
    { emoji: '🕶️', titulo: 'Turno de noche: evita la luz al volver', detalle: 'Usa gafas de sol de camino a casa y duerme en una habitación completamente a oscuras (persianas o antifaz).' },
    { emoji: '😴', titulo: 'Siesta antes del turno', detalle: 'Una siesta de 20-30 minutos antes de empezar ayuda a aguantar la noche. Evita la cafeína en la segunda mitad del turno.' },
  ],
};

/** Consejos según el turno y el nivel: más prácticos cuanto menos duermes. */
export function consejosSueno({ turno = null, nivel = 'bien' } = {}) {
  const extra = nivel === 'poco' || nivel === 'justo'
    ? [{ emoji: '💤', titulo: 'Si no puedes acostarte antes, haz una siesta corta', detalle: 'De 20 a 30 minutos y antes de las 16:00 (o antes del turno si trabajas de noche). Más larga puede dejarte aturdido y quitarte el sueño por la noche.' }]
    : [];
  return [...(CONSEJOS_TURNO[turno] || []), ...CONSEJOS_BASE.slice(0, nivel === 'bien' ? 3 : 6), ...extra];
}

const ETIQUETA_TURNO = { manana: 'Turno de mañana', tarde: 'Turno de tarde', noche: 'Turno de noche' };

/**
 * Análisis del sueño según las respuestas del cuestionario: un perfil por turno activo
 * (o uno solo si el horario no es por turnos).
 */
export function analizarSueno(e) {
  const perfil = (clave, etiqueta, acostar, levantar, turno) => {
    const plan = planSueno(acostar, levantar), v = valorarSueno(plan.actual);
    return { clave, etiqueta, turno, acostar, levantar, ...v, plan, consejos: consejosSueno({ turno, nivel: v.nivel }) };
  };
  const turnos = e.trabaja && e.tipoHorario === 'turnos';
  if (!turnos) return [perfil('general', 'Tu sueño', e.acostar, e.levantar, null)];
  return Object.entries(e.turnos.tipos).filter(([, t]) => t.activo)
    .map(([k]) => perfil(k, ETIQUETA_TURNO[k], e.suenoTurnos[k].acostar, e.suenoTurnos[k].levantar, k));
}

/** Lo que se guarda: el plan arranca hoy. */
export const planParaGuardar = (perfiles, hoy) => ({ inicio: hoy, perfiles });

/** Hora a la que acostarse en `fecha` según el plan (la de esta semana del plan). */
export function acostarObjetivo(guardado, clave, fecha) {
  const p = guardado?.perfiles?.find(x => x.clave === clave);
  if (!p) return null;
  if (!p.plan.pasos.length) return { acostar: p.acostar, semana: 0, total: 0, alDia: true };
  const idx = Math.min(p.plan.pasos.length - 1, Math.max(0, Math.floor(diasEntre(guardado.inicio, fecha) / 7)));
  return { acostar: p.plan.pasos[idx].acostar, semana: idx + 1, total: p.plan.pasos.length, alDia: false };
}

// Días libres: festivos, vacaciones, días que te coges o enfermedad. Qué dicen los expertos, qué hacer ese día
// y cómo se apuntan (un día libre «de verdad» no cuenta en las estadísticas ni te penaliza).
import { db, kvGet, kvSet } from './db.js';
import { diasEntre, hoyISO, toMin, toHHMM, uid, weekday } from './util.js';
import { estadoInicial, libresDe } from './configuracion.js';

export const MOTIVOS = [['festivo', '🎉 Festivo'], ['vacaciones', '🏖️ Vacaciones'], ['libre', '🙋 Me lo cojo libre'], ['enfermo', '🤒 Estoy enfermo/a']];
export const MOTIVO_TXT = { festivo: 'festivo', vacaciones: 'vacaciones', libre: 'por tu cuenta', enfermo: 'enfermedad' };
export const VENTANA_DIAS = 30;

/** Cuántos días libres «por voluntad propia» te has cogido en los últimos 30 días (sin contar `fecha`). */
export function diasLibresRecientes(libres, fecha, dias = VENTANA_DIAS) {
  return Object.entries(libres || {}).filter(([f, d]) => d.motivo === 'libre' && f < fecha && diasEntre(f, fecha) <= dias).length;
}

/**
 * Opinión orientativa. Festivos y vacaciones son descanso merecido; el día que te coges tú se valora según cuántos
 * llevas en el último mes. No existe una cifra oficial: es una referencia general sobre prevenir el agotamiento.
 */
export function opinionDiaLibre(motivo, recientes = 0) {
  if (motivo === 'festivo') return { nivel: 'bien', icono: '🎉', titulo: 'Un festivo es para descansar', texto: 'Los festivos existen para desconectar. Los expertos recomiendan aprovecharlos para descansar de verdad y hacer algo que te recargue, no para ponerte al día con tareas pendientes.' };
  if (motivo === 'vacaciones') return { nivel: 'bien', icono: '🏖️', titulo: 'Las vacaciones son salud', texto: 'Desconectar del todo unos días baja el estrés y ayuda a prevenir el agotamiento (burnout). En la Unión Europea la ley garantiza al menos 4 semanas de vacaciones pagadas al año: disfrútalas.' };
  if (motivo === 'enfermo') return { nivel: 'bien', icono: '🤒', titulo: 'Descansa y recupérate', texto: 'Lo mejor es dormir, beber líquidos y no forzarte: volver demasiado pronto suele alargar la recuperación. Si los síntomas duran o empeoran, consulta con tu médico.' };
  const n = recientes + 1;
  if (recientes <= 1) return { nivel: 'bien', icono: '👍', titulo: 'Un día libre de vez en cuando es saludable', texto: `Parar de forma puntual ayuda a recuperar energía y a evitar el agotamiento. No hay una cifra oficial; como referencia general, uno o dos días libres al mes por voluntad propia se consideran razonables. Este sería el n.º ${n} de los últimos 30 días.` };
  if (recientes === 2) return { nivel: 'atencion', icono: '⚠️', titulo: 'Ya llevas 2 en el último mes', texto: `Este sería el tercero en 30 días. Sigue siendo razonable, pero vigila que no se vuelva costumbre. Si necesitas parar tanto, quizá convenga pensar qué te está agotando (carga, sueño, ánimo) y hablarlo.` };
  return { nivel: 'exceso', icono: '🚨', titulo: 'Te estás pasando un poco', texto: `Con ${recientes} días libres voluntarios en los últimos 30, estás por encima de lo habitual. Cuando se falta con frecuencia, suele ser señal de agotamiento, falta de motivación o sobrecarga: más que otro día libre, ayuda identificar la causa y hablarlo con alguien de confianza o con un profesional.` };
}

/** Cuánto te quieres esforzar en tu día libre. */
export const NIVELES_ESFUERZO = [
  ['suave', '😌', 'Tranquilo', 'Descansar y recargar, sin exigirte nada.'],
  ['medio', '🙂', 'Normal', 'Un poco de todo: aire libre, movimiento y algo de calma.'],
  ['activo', '💪', 'Activo', 'Aprovechar el día: moverte más y avanzar en cosas.'],
];

// Cada actividad dice, para cada nivel, cómo es (título y minutos); `null` = no se propone en ese nivel.
// `marcada`: en qué niveles viene marcada de entrada.
const ACTIVIDADES = [
  { id: 'levantarse', emoji: '☀️', hora: '09:00', porque: 'Mantener la hora de levantarte, aunque sea libre, protege tu reloj interno y tu sueño.', marcada: ['suave', 'medio', 'activo'],
    suave: ['Levántate a tu hora y desayuna con calma', 30], medio: ['Levántate a tu hora y desayuna con calma', 30], activo: ['Levántate a tu hora y desayuna con calma', 30] },
  { id: 'estirar', emoji: '🧘', hora: '09:45', porque: 'Empezar el día sin prisa baja el estrés y despierta el cuerpo.', marcada: ['suave', 'activo'],
    suave: ['Estirar o meditar 20 minutos', 20], medio: ['Estirar o meditar 15 minutos', 15], activo: ['Yoga o movilidad 30 minutos', 30] },
  { id: 'paseo', emoji: '🚶', hora: '10:30', porque: 'La luz natural y el movimiento mejoran el ánimo y la energía.', marcada: ['suave', 'medio', 'activo'],
    suave: ['Paseo tranquilo de 20-30 minutos', 30], medio: ['Paseo de 30-45 minutos al aire libre', 45], activo: ['Caminata larga o ruta de 1-1,5 horas', 90] },
  { id: 'ejercicio', emoji: '💪', hora: '12:15', porque: 'La OMS recomienda al menos 150 minutos de actividad moderada a la semana; un día libre es buen momento.', marcada: ['medio', 'activo'],
    suave: null, medio: ['Ejercicio que disfrutes', 45], activo: ['Entrenamiento completo (fuerza o cardio)', 75] },
  { id: 'cocinar', emoji: '🥗', hora: '13:30', porque: 'Comer bien sin prisas cuida tu cuerpo y es una forma de descansar con las manos.', marcada: ['medio', 'activo'],
    suave: ['Cocinar algo sencillo y saludable', 45], medio: ['Cocinar algo saludable con calma', 60], activo: ['Preparar comida para varios días', 90] },
  { id: 'siesta', emoji: '😴', hora: '15:00', porque: 'Una siesta corta antes de las 16:00 recarga sin quitarte el sueño de la noche.', marcada: ['suave'],
    suave: ['Siesta corta de 20 minutos', 20], medio: null, activo: null },
  { id: 'aficion', emoji: '🎨', hora: '16:00', porque: 'Hacer algo solo porque te gusta recarga más que cualquier otra cosa.', marcada: ['suave', 'activo'],
    suave: ['Dedícate a una afición, sin prisa', 60], medio: ['Dedícate a una afición', 60], activo: ['Avanza en un proyecto o afición', 90] },
  { id: 'social', emoji: '👥', hora: '17:30', porque: 'Las relaciones cercanas son uno de los mayores protectores del bienestar.', marcada: ['suave', 'medio'],
    suave: ['Quedar con alguien que te cuide', 90], medio: ['Quedar con alguien que te cuide', 90], activo: ['Quedar con alguien y hacer algo juntos', 120] },
  { id: 'ordenar', emoji: '🧺', hora: '19:00', porque: 'Dejar la casa y la semana listas evita la ansiedad del último momento.', marcada: ['medio', 'activo'],
    suave: null, medio: ['Ordenar y preparar la semana (20 min)', 20], activo: ['Ordenar la casa y planificar la semana', 45] },
  { id: 'pantallas', emoji: '📵', hora: '19:45', porque: 'Desconectar del móvil descansa la cabeza y mejora el sueño.', marcada: ['suave'],
    suave: ['Una hora sin pantallas', 60], medio: ['Una hora sin pantallas', 60], activo: null },
  { id: 'leer', emoji: '📖', hora: '21:00', porque: 'Leer relaja y es una buena forma de cerrar el día.', marcada: ['suave', 'medio', 'activo'],
    suave: ['Leer 30 minutos', 30], medio: ['Leer 30 minutos', 30], activo: ['Aprender algo nuevo (libro, curso o vídeo)', 45] },
];
const ACTIVIDADES_ENFERMO = [
  { id: 'descansar', emoji: '🛌', titulo: 'Descansar y dormir lo que pida el cuerpo', min: 120, hora: '10:00', porque: 'Dormir es cuando el cuerpo más se recupera.' },
  { id: 'agua', emoji: '🍵', titulo: 'Beber agua o infusiones a menudo', min: 10, hora: '12:00', porque: 'Mantenerte hidratado ayuda a sobrellevar casi cualquier malestar.' },
  { id: 'ligera', emoji: '🥣', titulo: 'Comer algo ligero', min: 30, hora: '14:00', porque: 'Las comidas ligeras se digieren mejor cuando no estás bien.' },
  { id: 'ventilar', emoji: '🪟', titulo: 'Ventilar la habitación 10 minutos', min: 10, hora: '17:00', porque: 'Aire fresco y renovado sienta mejor al descansar.' },
];

/**
 * La rutina propuesta para un día libre según cuánto te quieres esforzar. Cada elemento lleva su hora (que se
 * puede mover) y si viene marcado de entrada. Si estás enfermo no se pregunta el esfuerzo: solo cosas para recuperarte.
 */
export function rutinaPara(nivel = 'medio', motivo = 'libre') {
  if (motivo === 'enfermo') return ACTIVIDADES_ENFERMO.map(a => ({ ...a, marcada: a.id !== 'ventilar' }));
  return ACTIVIDADES.filter(a => a[nivel]).map(a => ({ id: a.id, emoji: a.emoji, titulo: a[nivel][0], min: a[nivel][1], hora: a.hora, porque: a.porque, marcada: a.marcada.includes(nivel) }));
}

/** Qué elementos de la rutina se pisan entre sí (por la hora que les ha puesto la persona). Devuelve { id: título_del_que_pisa }. */
export function solapes(items) {
  const orden = [...items].sort((a, b) => a.hora.localeCompare(b.hora));
  const out = {};
  orden.forEach((x, i) => {
    const anterior = orden[i - 1];
    if (anterior && toMin(x.hora) < toMin(anterior.hora) + anterior.min) out[x.id] = anterior.titulo;
  });
  return out;
}

/**
 * Convierte la rutina elegida en bloques del día, justo a la hora que ha puesto la persona.
 * Lo que acabaría pasadas las 23:59 se deja fuera.
 */
export function bloquesDeSugerencias(fecha, items) {
  return items.filter(x => toMin(x.hora) + x.min <= 1439).sort((a, b) => a.hora.localeCompare(b.hora)).map(x => ({
    id: uid(), fecha, inicio: toHHMM(toMin(x.hora)), fin: toHHMM(toMin(x.hora) + x.min), titulo: `${x.emoji} ${x.titulo}`, frase: x.porque,
    hecho: false, extra: true, origen: 'dia-libre', fijado: false, importante: false,
  }));
}

export const getDiasLibres = () => kvGet('diasLibres', {});

/**
 * Apunta un día libre.
 *  modo 'rutina': haces tu rutina igualmente, sin trabajar ni estudiar (cuenta en las estadísticas).
 *  modo 'libre': te tomas el día libre; se quitan los bloques pendientes del día y no cuenta en las estadísticas.
 * `items`: la rutina elegida, con las horas que haya puesto la persona (solo en modo 'libre'); `esfuerzo`: el nivel elegido.
 */
export async function marcarDiaLibre({ fecha, motivo, modo, items = [], esfuerzo = null }) {
  const libres = await getDiasLibres();
  const info = { motivo, modo, creado: hoyISO(), esfuerzo, extras: items.map(x => x.id) };
  const bloques = await db.all('blocks');
  // Si ya era libre y se vuelve a apuntar, se limpian las sugerencias anteriores que no se hicieron.
  const quitar = bloques.filter(b => b.fecha === fecha && !b.hecho && (modo === 'libre' || b.extra)).map(b => b.id);
  if (quitar.length) await db.delMany('blocks', quitar);
  if (modo === 'libre' && items.length) await db.putMany('blocks', bloquesDeSugerencias(fecha, items));
  // En modo «rutina» ese día no se trabaja: sus horas libres son las de alguien sin trabajo (para cuando se rehaga el horario).
  const dispExtra = await kvGet('dispExtra', {});
  if (modo === 'rutina') {
    const config = await kvGet('configuracion');
    if (config) {
      const e = { ...estadoInicial(), ...config, trabaja: false, estudia: false };
      dispExtra[fecha] = libresDe(e, fecha).disponibilidad[weekday(fecha)];
      info.dispExtra = true;
    }
  } else if (dispExtra[fecha] && libres[fecha]?.dispExtra) delete dispExtra[fecha];
  await kvSet('dispExtra', dispExtra);
  libres[fecha] = info;
  await kvSet('diasLibres', libres);
  return info;
}

/** Quita el día libre. Las sugerencias que no se hicieron se borran; el resto del día se rehace desde Horario. */
export async function quitarDiaLibre(fecha) {
  const libres = await getDiasLibres();
  const info = libres[fecha];
  if (!info) return;
  delete libres[fecha];
  await kvSet('diasLibres', libres);
  if (info.dispExtra) { const d = await kvGet('dispExtra', {}); delete d[fecha]; await kvSet('dispExtra', d); }
  const extras = (await db.all('blocks')).filter(b => b.fecha === fecha && b.extra && !b.hecho).map(b => b.id);
  if (extras.length) await db.delMany('blocks', extras);
}

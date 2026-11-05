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

/** Cosas provechosas para un día libre, con la hora a la que suelen encajar y por qué ayudan. */
export const SUGERENCIAS = [
  { id: 'levantarse', emoji: '☀️', titulo: 'Levántate a tu hora y desayuna con calma', min: 30, hora: '09:00', porque: 'Mantener la hora de levantarte, aunque sea libre, protege tu reloj interno y tu sueño.' },
  { id: 'estirar', emoji: '🧘', titulo: 'Estirar o meditar 15 minutos', min: 15, hora: '09:45', porque: 'Empezar el día sin prisa baja el estrés y despierta el cuerpo.' },
  { id: 'paseo', emoji: '🚶', titulo: 'Paseo de 30-45 minutos al aire libre', min: 45, hora: '10:30', porque: 'La luz natural y el movimiento mejoran el ánimo y la energía.' },
  { id: 'ejercicio', emoji: '💪', titulo: 'Ejercicio que disfrutes', min: 45, hora: '12:00', porque: 'La OMS recomienda al menos 150 minutos de actividad moderada a la semana; un día libre es buen momento.' },
  { id: 'cocinar', emoji: '🥗', titulo: 'Cocinar algo saludable con calma', min: 60, hora: '13:30', porque: 'Comer bien sin prisas cuida tu cuerpo y es una forma de descansar con las manos.' },
  { id: 'aficion', emoji: '🎨', titulo: 'Dedícate a una afición', min: 60, hora: '16:00', porque: 'Hacer algo solo porque te gusta recarga más que cualquier otra cosa.' },
  { id: 'social', emoji: '👥', titulo: 'Quedar con alguien que te cuide', min: 90, hora: '17:30', porque: 'Las relaciones cercanas son uno de los mayores protectores del bienestar.' },
  { id: 'ordenar', emoji: '🧺', titulo: 'Ordenar y preparar la semana (20 min)', min: 20, hora: '19:00', porque: 'Dejar la semana lista evita la ansiedad del último momento.' },
  { id: 'pantallas', emoji: '📵', titulo: 'Una hora sin pantallas', min: 60, hora: '19:45', porque: 'Desconectar del móvil descansa la cabeza y mejora el sueño.' },
  { id: 'leer', emoji: '📖', titulo: 'Leer 30 minutos', min: 30, hora: '21:00', porque: 'Leer relaja y es una buena forma de cerrar el día.' },
];
export const SUGERENCIAS_ENFERMO = [
  { id: 'descansar', emoji: '🛌', titulo: 'Descansar y dormir lo que pida el cuerpo', min: 120, hora: '10:00', porque: 'Dormir es cuando el cuerpo más se recupera.' },
  { id: 'agua', emoji: '🍵', titulo: 'Beber agua o infusiones a menudo', min: 10, hora: '12:00', porque: 'Mantenerte hidratado ayuda a sobrellevar casi cualquier malestar.' },
  { id: 'ligera', emoji: '🥣', titulo: 'Comer algo ligero', min: 30, hora: '14:00', porque: 'Las comidas ligeras se digieren mejor cuando no estás bien.' },
  { id: 'ventilar', emoji: '🪟', titulo: 'Ventilar la habitación 10 minutos', min: 10, hora: '17:00', porque: 'Aire fresco y renovado sienta mejor al descansar.' },
];
export const sugerenciasPara = motivo => (motivo === 'enfermo' ? SUGERENCIAS_ENFERMO : SUGERENCIAS);
/** Las que vienen marcadas de entrada: las que más suelen venir bien. */
export const PREMARCADAS = ['levantarse', 'paseo', 'cocinar', 'social', 'leer', 'descansar', 'agua', 'ligera'];

/**
 * Convierte las sugerencias elegidas en bloques del día, uno detrás de otro desde su hora habitual
 * (si una pisa a la anterior, se pone a continuación). Lo que no cabe antes de las 23:00 se deja fuera.
 */
export function bloquesDeSugerencias(fecha, ids, motivo = 'libre') {
  const lista = sugerenciasPara(motivo).filter(s => ids.includes(s.id)).sort((a, b) => a.hora.localeCompare(b.hora));
  let libre = 0;
  const out = [];
  for (const s of lista) {
    const ini = Math.max(toMin(s.hora), libre), fin = ini + s.min;
    if (fin > 23 * 60) continue;
    out.push({ id: uid(), fecha, inicio: toHHMM(ini), fin: toHHMM(fin), titulo: `${s.emoji} ${s.titulo}`, frase: s.porque, hecho: false, extra: true, origen: 'dia-libre', fijado: false, importante: false });
    libre = fin + 10;
  }
  return out;
}

export const getDiasLibres = () => kvGet('diasLibres', {});

/**
 * Apunta un día libre.
 *  modo 'rutina': haces tu rutina igualmente, sin trabajar ni estudiar (cuenta en las estadísticas).
 *  modo 'libre': te tomas el día libre; se quitan los bloques pendientes del día y no cuenta en las estadísticas.
 * `extras`: ids de las sugerencias aceptadas (solo en modo 'libre').
 */
export async function marcarDiaLibre({ fecha, motivo, modo, extras = [] }) {
  const libres = await getDiasLibres();
  const info = { motivo, modo, creado: hoyISO(), extras };
  const bloques = await db.all('blocks');
  // Si ya era libre y se vuelve a apuntar, se limpian las sugerencias anteriores que no se hicieron.
  const quitar = bloques.filter(b => b.fecha === fecha && !b.hecho && (modo === 'libre' || b.extra)).map(b => b.id);
  if (quitar.length) await db.delMany('blocks', quitar);
  if (modo === 'libre' && extras.length) await db.putMany('blocks', bloquesDeSugerencias(fecha, extras, motivo));
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

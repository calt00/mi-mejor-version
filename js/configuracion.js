// Configuración paso a paso: convierte las respuestas del cuestionario (trabajo, sueño y objetivos)
// en horas libres, turnos rotativos y objetivos listos para guardar. Sin IA y sin pantallas: se prueba sola.
import { addDays, weekday, toMin, uid } from './util.js';
import { calcularLibres, catalogoDe, normalizar, primerosPasos } from './interprete.js';

export const TIPOS_TURNO = [['manana', 'Mañana'], ['tarde', 'Tarde'], ['noche', 'Noche']];
export const TODOS_LOS_DIAS = [0, 1, 2, 3, 4, 5, 6];

export function estadoInicial() {
  return {
    trabaja: null,
    tipoHorario: 'fijo', // fijo | turnos | variable
    fijo: { dias: [0, 1, 2, 3, 4], tramos: [{ inicio: '09:00', fin: '17:00' }] },
    turnos: {
      dias: [0, 1, 2, 3, 4],
      tipos: {
        manana: { activo: true, inicio: '06:00', fin: '14:00', semanas: 1 },
        tarde: { activo: true, inicio: '14:00', fin: '22:00', semanas: 1 },
        noche: { activo: false, inicio: '22:00', fin: '06:00', semanas: 1 },
      },
      actual: 'manana',
      semanaActual: 1, // si el turno dura varias semanas, en cuál de ellas está ahora
    },
    variable: TODOS_LOS_DIAS.map(d => ({ activo: d < 5, inicio: '09:00', fin: '17:00' })),
    trayecto: 30,
    levantar: '08:00',
    acostar: '23:30',
    objetivos: [],
  };
}

export const objetivoVacio = () => ({ id: null, titulo: '', horasSemana: 3, dias: [0, 1, 2, 3, 4], momento: 'cualquiera' });

export const tiposActivos = e => TIPOS_TURNO.map(([k]) => k).filter(k => e.turnos.tipos[k].activo);

// Un tramo «de 22:00 a 06:00» acaba al día siguiente.
const tramo = (inicio, fin) => { const a = toMin(inicio), b = toMin(fin); return { ini: a, fin: b > a ? b : b + 1440 }; };
// «Me acuesto a la 1» es después de medianoche.
const acostarMin = h => { const m = toMin(h); return m < 360 ? m + 1440 : m; };

/** Horarios de trabajo (o estudio) según las respuestas. */
export function trabajosDe(e) {
  if (!e.trabaja) return [];
  const t = (r, dias, turno = null) => ({ ...tramo(r.inicio, r.fin), dias: new Set(dias), turno });
  if (e.tipoHorario === 'turnos') return tiposActivos(e).map(tp => t(e.turnos.tipos[tp], e.turnos.dias, tp));
  if (e.tipoHorario === 'variable') return e.variable.flatMap((d, i) => (d.activo ? [t(d, [i])] : []));
  return e.fijo.tramos.map(r => t(r, e.fijo.dias));
}

/** Primer día de la racha de trabajo: en «de viernes a martes» el ciclo de turnos empieza el viernes. */
export function inicioCiclo(dias) {
  const s = new Set(dias);
  if (!s.size || s.size === 7) return 0;
  return [...s].sort((a, b) => a - b).find(d => !s.has((d + 6) % 7)) ?? 0;
}

/**
 * Horas libres según las respuestas: { disponibilidad (7 días de esta semana), turnos (o null) }.
 * Con turnos rotativos, `turnos` lleva una plantilla por turno y en qué punto del ciclo está esta semana.
 */
export function libresDe(e, hoy) {
  const trabajos = trabajosDe(e);
  const base = { trabajos, trayecto: e.trabaja ? Number(e.trayecto) || 0 : 0, levantar: toMin(e.levantar), acostar: acostarMin(e.acostar), sinTrabajo: !e.trabaja };
  const tipos = e.trabaja && e.tipoHorario === 'turnos' ? tiposActivos(e) : [];
  if (!tipos.length) return { disponibilidad: calcularLibres(base), turnos: null };
  const porTurno = calcularLibres({ ...base, tipos });
  const patron = tipos.flatMap(tp => Array(Math.max(1, Number(e.turnos.tipos[tp].semanas) || 1)).fill(tp));
  const ic = inicioCiclo(e.turnos.dias);
  const inicio = addDays(hoy, -((weekday(hoy) - ic + 7) % 7));
  const actual = patron.includes(e.turnos.actual) ? e.turnos.actual : patron[0];
  const semana = Math.min(Math.max(1, Number(e.turnos.semanaActual) || 1), patron.filter(x => x === actual).length);
  return {
    disponibilidad: porTurno[actual],
    turnos: {
      rotativo: true, patron, inicioCiclo: ic, referencia: addDays(inicio, -7 * (patron.indexOf(actual) + semana - 1)),
      diasTrabajo: [...e.turnos.dias].sort((a, b) => a - b),
      horarios: Object.fromEntries(tipos.map(tp => [tp, { inicio: e.turnos.tipos[tp].inicio, fin: e.turnos.tipos[tp].fin }])),
      disponibilidad: porTurno,
    },
  };
}

const minutos = franjas => franjas.reduce((a, f) => a + toMin(f.fin) - toMin(f.inicio), 0);

/** Minutos libres de cada día de la semana. Con turnos, los del turno que menos deja (para no prometer de más). */
export function minutosLibresPorDia(libres) {
  const plantillas = libres.turnos ? Object.values(libres.turnos.disponibilidad) : [libres.disponibilidad];
  return TODOS_LOS_DIAS.map(d => Math.min(...plantillas.map(p => minutos(p[d] || []))));
}

/** Duración de cada sesión: las horas de la semana repartidas entre los días elegidos (redondeado a 5 min). */
export const sesionDe = (horas, dias) => Math.max(15, Math.min(240, Math.round((horas * 60) / Math.max(1, dias.length) / 5) * 5));

/**
 * ¿Cabe el objetivo? Devuelve { porDia, diasSinHueco } teniendo en cuenta lo que piden
 * los demás objetivos esos mismos días.
 */
export function encaje(o, objetivos, libresDia) {
  const porDia = sesionDe(o.horasSemana, o.dias);
  const diasSinHueco = o.dias.filter(d => {
    const pedido = objetivos.filter(x => x.dias.includes(d) && x.titulo.trim()).reduce((a, x) => a + sesionDe(x.horasSemana, x.dias) + 10, 0);
    return pedido > libresDia[d];
  });
  return { porDia, diasSinHueco };
}

/** Máximo de horas al día que hace falta permitir para que quepan todos los objetivos en sus días. */
export function maxHorasDiaDe(objetivos) {
  const porDia = TODOS_LOS_DIAS.map(d => objetivos.filter(o => o.dias.includes(d)).reduce((a, o) => a + sesionDe(o.horasSemana, o.dias), 0));
  return Math.max(1, Math.ceil(Math.max(...porDia) / 30) / 2);
}

/**
 * Objetivos para guardar a partir de las respuestas. Conserva los datos de los que ya existían;
 * los activos que se han quitado de la lista se archivan (no se borran).
 */
export function objetivosDe(e, existentes, hoy) {
  const porId = new Map(existentes.map(g => [g.id, g]));
  const validos = e.objetivos.filter(o => o.titulo.trim() && o.dias.length && o.horasSemana > 0);
  const guardar = validos.map((o, i) => {
    const previo = porId.get(o.id);
    const cat = catalogoDe(normalizar(o.titulo))[0];
    return {
      ...previo,
      id: previo?.id || uid(),
      titulo: o.titulo.trim(),
      horasSemana: Number(o.horasSemana),
      dias: [...o.dias].sort((a, b) => a - b),
      momento: o.momento || 'cualquiera',
      sesionMin: sesionDe(o.horasSemana, o.dias),
      area: previo?.area || cat?.area || 'personal',
      prioridad: previo?.prioridad || (i === 0 ? 3 : 2),
      porque: previo?.porque || '',
      fechaLimite: previo?.fechaLimite || '',
      creado: previo?.creado || hoy,
      archivado: false,
    };
  });
  const nuevos = guardar.filter(g => !porId.has(g.id));
  const tareas = nuevos.flatMap(g => primerosPasos(g.titulo).pasos.slice(0, 3).map((p, k) => ({ id: uid() + k, goalId: g.id, titulo: p.titulo, hecho: false, creado: Date.now() + k })));
  const archivar = existentes.filter(g => !g.archivado && !guardar.some(x => x.id === g.id)).map(g => ({ ...g, archivado: true }));
  return { guardar, archivar, tareas };
}

/** Respuestas guardadas + objetivos actuales (por si se han editado en la pestaña Objetivos). */
export function estadoDesde(guardado, goals) {
  const e = { ...estadoInicial(), ...guardado };
  const activos = goals.filter(g => !g.archivado);
  e.objetivos = activos.map(g => ({ id: g.id, titulo: g.titulo, horasSemana: Number(g.horasSemana) || 1, dias: g.dias?.length ? g.dias : [...TODOS_LOS_DIAS], momento: g.momento || 'cualquiera' }));
  return e;
}

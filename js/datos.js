// Valores por defecto y acceso a la configuración guardada.
import { kvGet, kvSet } from './db.js';
import { tipoTurno } from './interprete.js';
import { weekday } from './util.js';

export const AREAS = [
  ['salud', '💪 Salud y deporte'], ['estudio', '📚 Estudio'], ['trabajo', '💼 Trabajo'],
  ['finanzas', '💰 Finanzas'], ['personal', '🌱 Crecimiento personal'], ['relaciones', '❤️ Relaciones'],
  ['ocio', '🎨 Ocio y creatividad'], ['hogar', '🏠 Hogar'],
];
export const AREA_COLOR = {
  salud: '#34c759', estudio: '#5856d6', trabajo: '#007aff', finanzas: '#ff9f0a',
  personal: '#30b0c7', relaciones: '#ff375f', ocio: '#af52de', hogar: '#a2845e',
};
export const areaNombre = a => (AREAS.find(x => x[0] === a)?.[1] || '🎯 Objetivo');
export const areaColor = a => AREA_COLOR[a] || '#8e8e93';

export const MOMENTOS = [['cualquiera', 'Cualquier momento'], ['manana', 'Mañana (6–12 h)'], ['tarde', 'Tarde (12–19 h)'], ['noche', 'Noche (19–24 h)']];
export const VENTANA_MOMENTO = { manana: [360, 720], tarde: [720, 1140], noche: [1140, 1440] };

export const PRIORIDADES = [[3, 'Alta'], [2, 'Media'], [1, 'Baja']];

// tipo: necesidad | deseo (para la regla 50/30/20). pequeno: gasto pequeño que suele repetirse.
export const CATEGORIAS = {
  vivienda: { n: 'Vivienda', i: '🏠', tipo: 'necesidad' },
  supermercado: { n: 'Supermercado', i: '🛒', tipo: 'necesidad' },
  transporte: { n: 'Transporte', i: '🚌', tipo: 'necesidad' },
  facturas: { n: 'Luz, agua, móvil', i: '💡', tipo: 'necesidad' },
  salud: { n: 'Salud', i: '💊', tipo: 'necesidad' },
  seguros: { n: 'Seguros', i: '🛡️', tipo: 'necesidad' },
  deudas: { n: 'Deudas y préstamos', i: '💳', tipo: 'necesidad' },
  educacion: { n: 'Educación', i: '📚', tipo: 'necesidad' },
  restaurantes: { n: 'Restaurantes', i: '🍽️', tipo: 'deseo' },
  cafe: { n: 'Cafés y snacks', i: '☕', tipo: 'deseo', pequeno: true },
  delivery: { n: 'Comida a domicilio', i: '🛵', tipo: 'deseo', pequeno: true },
  ocio: { n: 'Ocio y salidas', i: '🎉', tipo: 'deseo' },
  compras: { n: 'Ropa y compras', i: '🛍️', tipo: 'deseo' },
  suscripciones: { n: 'Suscripciones', i: '📺', tipo: 'deseo' },
  deporte: { n: 'Deporte', i: '🏋️', tipo: 'deseo' },
  tecnologia: { n: 'Tecnología y apps', i: '📱', tipo: 'deseo', pequeno: true },
  regalos: { n: 'Regalos', i: '🎁', tipo: 'deseo' },
  viajes: { n: 'Viajes', i: '✈️', tipo: 'deseo' },
  otros: { n: 'Otros', i: '📦', tipo: 'deseo' },
};
export const catNombre = c => CATEGORIAS[c]?.n || 'Otros';
export const catIcono = c => CATEGORIAS[c]?.i || '📦';

const DEF_SETTINGS = {
  tema: 'auto',
  importantes: 'alta', // ninguno | alta | todos
  nombreAtajo: 'MMV Horario',
};
const DEF_PROFILE = { nombre: '', sobreMi: '', rutina: '', fortalezas: '', debilidades: '', motivacion: '' };
const DEF_PREFS = { sesionMin: 60, descansoMin: 10, maxHorasDia: 4 };
// Franjas libres por día (lunes = 0).
const DEF_DISPONIBILIDAD = [
  [{ inicio: '18:00', fin: '22:00' }], [{ inicio: '18:00', fin: '22:00' }], [{ inicio: '18:00', fin: '22:00' }],
  [{ inicio: '18:00', fin: '22:00' }], [{ inicio: '18:00', fin: '22:00' }],
  [{ inicio: '10:00', fin: '13:30' }, { inicio: '17:00', fin: '21:00' }],
  [{ inicio: '10:00', fin: '13:30' }, { inicio: '17:00', fin: '20:00' }],
];
const DEF_INGRESOS = { nomina: 0, diaCobro: 1, extras: 0 };

const getter = (key, def) => async () => ({ ...(Array.isArray(def) ? {} : def), ...(await kvGet(key, def)) });
export const getSettings = getter('settings', DEF_SETTINGS);
export const getProfile = getter('profile', DEF_PROFILE);
export const getPrefs = getter('prefs', DEF_PREFS);
export const getIngresos = getter('ingresos', DEF_INGRESOS);
export const getDisponibilidad = async () => kvGet('disponibilidad', DEF_DISPONIBILIDAD);

// Turnos rotativos: { rotativo, patron: ['manana','tarde',…], referencia, inicioCiclo, horarios, disponibilidad: { tipo: [7 días] } }.
export const getTurnos = () => kvGet('turnos', null);
export const saveTurnos = v => kvSet('turnos', v);

/**
 * Devuelve una función fecha → horas libres de los 7 días de esa semana: según el turno que toque
 * (si rotan) y con los cambios de un solo día que se le piden al asistente (kv «dispExtra»: { fecha: franjas }).
 */
export async function dispPorFecha() {
  const [base, turnos, extra] = await Promise.all([getDisponibilidad(), getTurnos(), kvGet('dispExtra', {})]);
  const semana = turnos?.rotativo ? fecha => turnos.disponibilidad?.[tipoTurno(turnos, fecha)] || base : () => base;
  return fecha => {
    const s = semana(fecha);
    if (!extra?.[fecha]) return s;
    const copia = [...s];
    copia[weekday(fecha)] = extra[fecha];
    return copia;
  };
}

export const saveSettings = v => kvSet('settings', v);
export const saveProfile = v => kvSet('profile', v);
export const savePrefs = v => kvSet('prefs', v);
export const saveIngresos = v => kvSet('ingresos', v);
export const saveDisponibilidad = v => kvSet('disponibilidad', v);

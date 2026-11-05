// Prepara el horario y lo envía al Atajo de iOS que crea Recordatorios y Alarmas.
import { db, kvGet } from './db.js';
import { getSettings, getIngresos, getAjustesSueno } from './datos.js';
import { hoyISO, addDays, isoLocal, nowMin, toMin, toHHMM, fmtEur, parseISODate, toISODate, daysInMonth } from './util.js';
import { ordenarBloques } from './scheduler.js';
import { frasesLocales } from './frases.js';
import { frasesDeHabito } from './habitos.js';
import { estadoMeta } from './finanzas.js';
import { acostarObjetivo, acostarAbs, AJUSTES_SUENO } from './sueno.js';
import { tipoTurno } from './interprete.js';
import { compromisosDelDia } from './compromisos.js';

export const LISTA_RECORDATORIOS = 'Mi Mejor Versión';

/** Una frase motivadora para cada bloque: los de un hábito, con los pensamientos que ayudan a cumplirlo. */
export async function frasesPara(bloques) {
  const [goals, habits] = await Promise.all([db.all('goals'), db.all('habits')]);
  const habitoDe = id => { const g = goals.find(x => x.id === id); return g?.habitoId ? habits.find(h => h.id === g.habitoId) : null; };
  const generales = await frasesLocales(bloques.length);
  return bloques.map((b, i) => {
    const h = habitoDe(b.goalId);
    if (!h) return generales[i];
    const propias = frasesDeHabito(h);
    return propias[(i + b.fecha.charCodeAt(9)) % propias.length];
  });
}

// Rellena la frase motivadora de los bloques que no la tienen.
export async function asignarFrases(bloques) {
  const sinFrase = bloques.filter(b => !b.frase);
  if (!sinFrase.length) return bloques;
  const frases = await frasesPara(sinFrase);
  sinFrase.forEach((b, i) => { b.frase = frases[i]; });
  await db.putMany('blocks', sinFrase);
  return bloques;
}

export function rango(tipo) {
  const hoy = hoyISO();
  if (tipo === 'manana') return [addDays(hoy, 1), addDays(hoy, 1)];
  if (tipo === 'semana') return [hoy, addDays(hoy, 6)];
  return [hoy, hoy];
}

async function avisoCobro(desde, hasta) {
  const ing = await getIngresos();
  if (!ing.nomina) return null;
  for (let f = desde; f <= hasta; f = addDays(f, 1)) {
    const d = parseISODate(f);
    const dia = Math.min(Number(ing.diaCobro) || 1, daysInMonth(f.slice(0, 7)));
    if (d.getDate() !== dia) continue;
    const [metas, aportes] = await Promise.all([db.all('savingsGoals'), db.all('contributions')]);
    const necesario = metas.map(m => estadoMeta(m, aportes, toISODate(d))).filter(e => e.estado !== 'completada').reduce((a, e) => a + (e.necesarioMes || 0), 0);
    const apartar = necesario || ing.nomina * 0.2;
    if (f === hoyISO() && nowMin() > toMin('09:00')) return null;
    return { fecha: f, inicio: '09:00', fin: '09:15', titulo: `💰 Hoy cobras: aparta ${fmtEur(apartar, true)} a tus huchas`, frase: '', importante: false, cobro: true };
  }
  return null;
}

/**
 * Un aviso cada noche, los minutos de antelación elegidos antes de la hora de acostarte que marca el plan de sueño.
 * La hora de acostarse depende del turno de mañana (el que manda cuándo hay que madrugar).
 * Si el aviso cae pasada la medianoche y fuera del rango que se envía, se adelanta a las 23:30 de ese día.
 */
export function avisosSueno({ plan, turnos, desde, hasta, hoy, ahora, antelacion = AJUSTES_SUENO.antelacion, alarma = false }) {
  if (!plan?.perfiles?.length) return [];
  const out = [];
  for (let f = desde; f <= hasta; f = addDays(f, 1)) {
    const clave = turnos ? tipoTurno(turnos, addDays(f, 1)) : 'general';
    const o = acostarObjetivo(plan, clave, f);
    if (!o || o.pendiente) continue; // antes de empezar el plan no se molesta
    // Minutos desde las 00:00 de `f`: acostarse de madrugada es «pasadas las 24:00»; en el turno de noche se duerme de día, ya en el día siguiente.
    const cama = clave === 'noche' ? toMin(o.acostar) + 1440 : acostarAbs(o.acostar);
    let aviso = cama - antelacion, fecha = addDays(f, Math.floor(aviso / 1440));
    if (fecha > hasta) { fecha = f; aviso = 23 * 60 + 30; }
    const inicio = aviso % 1440;
    if (fecha === hoy && inicio <= ahora) continue;
    out.push({
      fecha, inicio: toHHMM(inicio), fin: toHHMM(Math.min(inicio + 5, 1439)), importante: alarma, sueno: true,
      titulo: `😴 Prepárate para dormir: a las ${o.acostar} a la cama`,
      frase: o.alDia ? 'Pantallas fuera y luces bajas. Dormir bien es parte del plan.' : `Semana ${o.semana} de ${o.total} de tu plan de sueño. Mañana, a levantarte sobre las ${o.levantar}. Pantallas fuera y luces bajas.`,
    });
  }
  return out;
}

/**
 * Una alarma cada día a la hora de levantarte (la que se ve en el horario). Los días libres no suenan, y las de hoy
 * que ya han pasado se dejan fuera.
 */
export function avisosDespertar({ config, turnos, libres = {}, plan = null, desde, hasta, hoy, ahora }) {
  const out = [];
  if (!config) return out;
  for (let f = desde; f <= hasta; f = addDays(f, 1)) {
    if (libres[f]) continue;
    const c = compromisosDelDia({ config, turnos, fecha: f, libres, plan }).find(x => x.tipo === 'despertar');
    if (!c || (f === hoy && toMin(c.inicio) <= ahora)) continue;
    out.push({ fecha: f, inicio: c.inicio, fin: toHHMM(Math.min(toMin(c.inicio) + 5, 1439)), titulo: '☀️ Levántate', frase: 'Empieza el día con calma: un vaso de agua y luz natural.', importante: true, despertar: true });
  }
  return out;
}

// Bloques pendientes del rango (sin los que ya han pasado) + aviso de cobro.
export async function prepararEnvio(tipo) {
  const [desde, hasta] = rango(tipo);
  const hoy = hoyISO(), ahora = nowMin();
  const bloques = ordenarBloques((await db.all('blocks')).filter(b => b.fecha >= desde && b.fecha <= hasta && !b.hecho
    && !(b.fecha === hoy && toMin(b.inicio) <= ahora)));
  await asignarFrases(bloques);
  const cobro = await avisoCobro(desde, hasta);
  if (cobro) cobro.frase = (await frasesLocales(1))[0];
  const [plan, turnos, config, libres] = await Promise.all([kvGet('planSueno'), kvGet('turnos'), kvGet('configuracion'), kvGet('diasLibres', {})]);
  const ajustes = await getAjustesSueno();
  const despertar = ajustes.alarmaDespertar ? avisosDespertar({ config, turnos, libres, plan, desde, hasta, hoy, ahora }) : [];
  const sueno = avisosSueno({ plan, turnos, desde, hasta, hoy, ahora, antelacion: Number(ajustes.antelacion) || 30, alarma: Boolean(ajustes.alarma) });
  const { nombreAtajo } = await getSettings();
  return { desde, hasta, nombreAtajo, bloques: ordenarBloques([...bloques, ...(cobro ? [cobro] : []), ...sueno, ...despertar]) };
}

export function construirPayload({ desde, hasta, bloques }) {
  return {
    lista: LISTA_RECORDATORIOS,
    desde: isoLocal(desde, '00:00'),
    hasta: isoLocal(addDays(hasta, 1), '00:00'),
    bloques: bloques.map(b => ({
      titulo: b.sueno || b.despertar ? b.titulo : `⏰ ${b.titulo}`,
      frase: b.frase || '',
      inicio: isoLocal(b.fecha, b.inicio),
      fin: isoLocal(b.fecha, b.fin),
      importante: Boolean(b.importante),
      alarma: b.importante ? 'si' : 'no',
      etiquetaAlarma: `MMV · ${b.titulo} · ${b.frase || ''}`.slice(0, 60),
    })),
  };
}

// Síncrona a propósito: debe ejecutarse dentro del toque del usuario (Safari exige el gesto).
export function abrirAtajo(envio) {
  const json = JSON.stringify(construirPayload(envio));
  navigator.clipboard?.writeText(json).catch(() => {});
  location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(envio.nombreAtajo || 'MMV Horario')}&input=text&text=${encodeURIComponent(json)}`;
}

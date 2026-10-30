// Prepara el horario y lo envía al Atajo de iOS que crea Recordatorios y Alarmas.
import { db } from './db.js';
import { getSettings, getIngresos } from './datos.js';
import { hoyISO, addDays, isoLocal, nowMin, toMin, fmtEur, parseISODate, toISODate, daysInMonth } from './util.js';
import { ordenarBloques } from './scheduler.js';
import { frasesLocales } from './frases.js';
import { estadoMeta } from './finanzas.js';

export const LISTA_RECORDATORIOS = 'Mi Mejor Versión';

// Rellena la frase motivadora de los bloques que no la tienen.
export async function asignarFrases(bloques) {
  const sinFrase = bloques.filter(b => !b.frase);
  if (!sinFrase.length) return bloques;
  const frases = await frasesLocales(sinFrase.length);
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

// Bloques pendientes del rango (sin los que ya han pasado) + aviso de cobro.
export async function prepararEnvio(tipo) {
  const [desde, hasta] = rango(tipo);
  const hoy = hoyISO(), ahora = nowMin();
  const bloques = ordenarBloques((await db.all('blocks')).filter(b => b.fecha >= desde && b.fecha <= hasta && !b.hecho
    && !(b.fecha === hoy && toMin(b.inicio) <= ahora)));
  await asignarFrases(bloques);
  const cobro = await avisoCobro(desde, hasta);
  if (cobro) cobro.frase = (await frasesLocales(1))[0];
  const { nombreAtajo } = await getSettings();
  return { desde, hasta, nombreAtajo, bloques: cobro ? ordenarBloques([...bloques, cobro]) : bloques };
}

export function construirPayload({ desde, hasta, bloques }) {
  return {
    lista: LISTA_RECORDATORIOS,
    desde: isoLocal(desde, '00:00'),
    hasta: isoLocal(addDays(hasta, 1), '00:00'),
    bloques: bloques.map(b => ({
      titulo: `⏰ ${b.titulo}`,
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

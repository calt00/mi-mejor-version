// Asistente propio (sin IA ni internet): entiende órdenes sobre el día y las ejecuta.
// entender() solo lee el texto (y se prueba sin base de datos); ejecutar() hace los cambios
// y devuelve qué se ha hecho, botones para seguir y lo necesario para deshacerlo.
import { db, kvGet, kvSet } from './db.js';
import { getProfile, getPrefs, getSettings, getTurnos, dispPorFecha, CATEGORIAS } from './datos.js';
import { hoyISO, addDays, weekday, weekStart, toMin, toHHMM, nowMin, fmtFecha, fmtEur, fmtHoras, uid } from './util.js';
import { normalizar, rangos, horaSuelta, catalogoDe, interpretarTexto, tipoTurno, posicionEnPatron } from './interprete.js';
import { generarSemana, huecosDia, ordenarBloques } from './scheduler.js';
import { progresoDiario, mediaSerie, mejorRacha } from './progreso.js';
import { estadoMeta } from './finanzas.js';
import { frasesLocales } from './frases.js';

const TURNO_TXT = { manana: 'mañana', tarde: 'tarde', noche: 'noche' };
const DIA_RE = /\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/;
const NUM = { una: 1, un: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, media: 0.5 };
const numero = s => (s in NUM ? NUM[s] : Number(String(s).replace(',', '.')));
const NO_CUENTAN = new Set(['hecho', 'hecha', 'terminado', 'terminada', 'acabado', 'acabada', 'completado', 'manana', 'pasalo', 'pasala', 'mueve', 'muevelo', 'hoy', 'puedo', 'tarde', 'noche', 'ahora', 'luego', 'para', 'otro', 'otra', 'dia', 'hora', 'horas', 'minutos', 'semana', 'quiero', 'tengo', 'ganas', 'esta', 'este']);

// ---------- Entender ----------
// «mañana» es día siguiente salvo en «por la mañana», «de mañana», «turno de mañana»…
function esManana(t) {
  for (const m of t.matchAll(/\bmanana\b/g)) {
    const antes = t.slice(Math.max(0, m.index - 9), m.index);
    if (!/(la|las|de|por la|turno de|esta)\s*$/.test(antes) && !/pasado\s*$/.test(antes)) return true;
  }
  return false;
}

/** Fecha que menciona el texto (hoy, mañana, pasado mañana, el jueves…) o null. */
export function fechaEn(t, hoy) {
  if (/pasado manana/.test(t)) return addDays(hoy, 2);
  if (esManana(t)) return addDays(hoy, 1);
  if (/\bhoy\b|esta tarde|esta noche|esta manana|ahora/.test(t)) return hoy;
  const m = t.match(DIA_RE);
  if (m) {
    const d = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'].indexOf(m[1]);
    const dif = (d - weekday(hoy) + 7) % 7;
    return addDays(hoy, dif === 0 && /que viene|proximo|siguiente/.test(t) ? 7 : dif);
  }
  if (/la semana que viene|la proxima semana/.test(t)) return addDays(weekStart(hoy), 7);
  return null;
}

function duracionEn(t) {
  let m;
  if (/hora y media/.test(t)) return 90;
  if (/media hora/.test(t)) return 30;
  if (/cuarto de hora/.test(t)) return 15;
  if ((m = t.match(/\b(\d+(?:[.,]\d+)?|una|un|dos|tres|cuatro|cinco)\s*(horas?|h)\b/))) return Math.round(numero(m[1]) * 60);
  if ((m = t.match(/\b(\d+)\s*(minutos|min)\b/))) return Number(m[1]);
  return null;
}

function importeEn(t) {
  const m = t.match(/(\d+(?:[.,]\d{1,2})?)\s*(€|euros?|pavos|eur)\b/) || t.match(/(?:gastado|pagado|gaste|pague|aporto|aparto|guardo|meto|ahorrado|ahorro)\s+(\d+(?:[.,]\d{1,2})?)/);
  return m ? Number(m[1].replace(',', '.')) : null;
}

const CAT_GASTO = [
  [/\b(cafe|cafes|desayuno|snack|bocadillo|cerveza|cana|bar|refresco)\b/, 'cafe'], [/\b(glovo|uber eats|just eat|a domicilio|pedido)\b/, 'delivery'],
  [/\b(super|supermercado|mercadona|lidl|carrefour|dia|aldi|la compra|compra semanal)\b/, 'supermercado'],
  [/\b(restaurante|cena|cenar|comer fuera|comida fuera|hamburguesa|pizza|menu|kebab)\b/, 'restaurantes'],
  [/\b(gasolina|bus|metro|taxi|uber|cabify|tren|parking|peaje|abono)\b/, 'transporte'], [/\b(cine|concierto|fiesta|copas|discoteca|entradas?|ocio)\b/, 'ocio'],
  [/\b(ropa|zapatillas|camiseta|pantalon|zara|primark|compras)\b/, 'compras'], [/\b(farmacia|medicina|medico|dentista)\b/, 'salud'],
  [/\b(app|juego|videojuego|steam|cargador|auriculares)\b/, 'tecnologia'], [/\bregalo\b/, 'regalos'], [/\b(luz|internet|factura)\b/, 'facturas'],
  [/\b(netflix|spotify|hbo|disney|suscripcion)\b/, 'suscripciones'], [/\b(gimnasio|gym|deporte)\b/, 'deporte'], [/\b(viaje|hotel|vuelo|avion)\b/, 'viajes'],
];

/**
 * Convierte lo que escribe el usuario en una orden. No toca la base de datos.
 * Devuelve { tipo, texto, fecha?, hora?, rango?, duracion?, importe?, categoria?, turno? }.
 */
export function entender(texto, hoy = hoyISO()) {
  const t = normalizar(texto).trim();
  const o = { texto: t, textoOriginal: texto, fecha: fechaEn(t, hoy) };
  const r = rangos(t)[0];
  // «de 5 a 8» en una conversación casi siempre es por la tarde, salvo que diga «de la mañana».
  const deManana = /(de la manana|por la manana|madrugada|temprano)/.test(t);
  if (r) {
    const tarde = r.ini < 420 && !deManana && r.fin + 720 <= 1440 ? 720 : 0;
    o.rango = { inicio: toHHMM(r.ini + tarde), fin: toHHMM(Math.min(r.fin + tarde, 1439)) };
  }
  const h = horaSuelta(t, 'a|sobre|hacia|desde|para')[0];
  if (h && !r && /\b(a|sobre|hacia|desde) (las|la) \d/.test(t)) o.hora = toHHMM(h.min >= 60 && h.min < 480 && !h.sufijo && !deManana ? h.min + 720 : h.min);
  o.duracion = duracionEn(t);
  o.importe = importeEn(t);
  const tipo = (x, extra = {}) => ({ ...o, tipo: x, ...extra });

  if (!t || /^(ayuda|help|\?|que (puedes|sabes) hacer|como funcionas|como te uso|comandos)/.test(t)) return tipo('ayuda');
  if (/^(gracias|ok|vale|genial|perfecto|guay|de acuerdo|muy bien)\b/.test(t) && t.length < 25) return tipo('gracias');

  // Dinero (antes que «añadir»: «apunta 5 € de café»).
  if (o.importe != null && /(ahorr|aporto|aparto|guardo|meto|hucha|cerdito|para (el|la|mi) )/.test(t) && !/gast|pag(ue|ado)|compr/.test(t)) return tipo('ahorro');
  if (o.importe != null && /(gast|pag(ue|ado|o)|compr|me ha costado|me costo|apunta|anota)/.test(t)) return tipo('gasto', { categoria: (CAT_GASTO.find(([re]) => re.test(t)) || [, 'otros'])[1] });

  // Turnos.
  let m;
  if ((m = t.match(/(?:esta semana|la semana que viene|la proxima semana|me han cambiado (?:el )?turno|cambio de turno|ahora)[^.]{0,30}?\b(manana|tarde|noche)\b/)) && /turno|estoy de|me toca|trabajo de|semana/.test(t))
    return tipo('turno', { turno: m[1], siguiente: /que viene|proxima/.test(t) });

  if (/(no tengo ganas|cansad|agotad|desmotivad|me da pereza|no me apetece|agobiad|estresad|bajon|sin energia|no puedo mas|reventad)/.test(t)) return tipo('animo');
  if (/(como voy|mi progreso|que tal voy|estadisticas|como lo llevo|resumen de la semana|cuanto llevo)/.test(t)) return tipo('progreso');
  if (/(reorganiza|replanifica|rehaz|regenera|reparte|organiza(me)?)\b.*\b(semana|horario|dia|todo)/.test(t)) return tipo('replanificar');

  // Cambios de un día: «hoy tengo libre de 5 a 8», «mañana libro», «el sábado trabajo de 9 a 14».
  if (/(tengo libre|estoy libre|libro\b|no trabajo|dia libre|tengo el dia)/.test(t)) return tipo('libre');
  if (o.fecha && o.rango && /(trabajo|curro|tengo turno|me toca trabajar|entro|tengo que trabajar)/.test(t)) return tipo('ocupado');

  if (/\b(ya )?(he (hecho|terminado|acabado|completado|ido|estudiado|leido|entrenado|bebido|meditado|corrido|practicado|cumplido)|hecho|listo|terminado|acabado|completado)\b/.test(t) && !/no he/.test(t)) return tipo('hecho');
  if (/(cancela|anula|elimina|borra|quita)\b/.test(t)) return tipo('cancelar');
  if (/(retrasa|atrasa|mas tarde|despues|adelanta)\b/.test(t) && (o.duracion || o.hora)) return tipo('retrasar', { adelantar: /adelanta/.test(t) });
  if (/\b(no puedo|no me da tiempo|no llego|pasa(lo|la|los)?|mueve(lo|la)?|aplaza(lo|la)?|cambia(lo|la)?|dejalo|dejala|reprograma(lo|la)?|lo hago otro dia)\b/.test(t)) return tipo('mover');
  if (/(anade|pon(me|lo)?|apunta(me)?|mete(me)?|reserva|agenda|programa|quiero (estudiar|hacer|practicar|ir|leer|entrenar|correr)|voy a (estudiar|hacer|practicar|ir|leer|entrenar|correr))\b/.test(t)
    && (o.duracion || o.rango || o.hora || o.fecha)) return tipo('anadir');
  if (/(quiero (empezar|aprender|ponerme|sacarme|mejorar|dejar)|nuevo objetivo|mi objetivo es|me gustaria (empezar|aprender|mejorar))/.test(t)) return tipo('objetivo');
  if (/(que (me )?toca|que tengo|mi dia|mi plan|plan de|agenda|que hago|siguiente|que sigue|horario de|hola|buenas|buenos dias|que hay)/.test(t)
    || /^[¿]?(y )?(hoy|manana|pasado manana|el (lunes|martes|miercoles|jueves|viernes|sabado|domingo))\s*\??$/.test(t)) return tipo('dia');
  return tipo('desconocido');
}

// ---------- Utilidades sobre los datos ----------
const raices = s => normalizar(s).split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !NO_CUENTAN.has(w)).map(w => w.slice(0, 4));

/** Puntuación de lo bien que un texto nombra un bloque / hábito / meta (0 = nada). */
function parecido(t, titulo) {
  const a = new Set(raices(t)), b = raices(titulo);
  let p = b.filter(w => a.has(w)).length;
  const ct = catalogoDe(t).map(c => c.clave), cb = catalogoDe(normalizar(titulo)).map(c => c.clave);
  if (ct.some(c => cb.includes(c))) p += 2;
  return p;
}
const mejor = (t, lista, titulo) => lista.map(x => [x, parecido(t, titulo(x))]).filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
const duracion = b => toMin(b.fin) - toMin(b.inicio);
const etiquetaDia = (f, hoy) => (f === hoy ? 'hoy' : f === addDays(hoy, 1) ? 'mañana' : fmtFecha(f, { weekday: 'long', day: 'numeric' }).toLowerCase());

// Registro de cambios para poder deshacer.
function registro() {
  const ops = [];
  const guardarAntes = async (store, id) => { if (!ops.some(o => o.store === store && o.id === id)) ops.push({ store, id, antes: (await db.get(store, id)) ?? null }); };
  return {
    ops,
    async put(store, obj) { await guardarAntes(store, obj.id); await db.put(store, obj); },
    async del(store, id) { await guardarAntes(store, id); await db.del(store, id); },
    async kv(clave, valor) { await guardarAntes('kv', clave); await kvSet(clave, valor); },
  };
}

export async function deshacer(ops) {
  for (const op of [...ops].reverse()) {
    if (op.antes) await db.put(op.store, op.antes);
    else await db.del(op.store, op.id);
  }
}

// Bloque al que se refiere el texto: el nombrado o, si no nombra ninguno, el de ahora / el siguiente de ese día.
function bloqueObjetivo(t, bloques, fecha, hoy, { pendiente = true } = {}) {
  const candidatos = bloques.filter(b => (!pendiente || !b.hecho) && b.fecha >= addDays(hoy, -2));
  const nombrado = mejor(t, candidatos.filter(b => !fecha || b.fecha === fecha), b => b.titulo) || mejor(t, candidatos, b => b.titulo);
  if (nombrado) return nombrado;
  const delDia = ordenarBloques(candidatos.filter(b => b.fecha === (fecha || hoy)));
  const ahora = nowMin();
  return delDia.find(b => (fecha || hoy) !== hoy || toMin(b.fin) > ahora) || delDia.at(-1) || null;
}

/**
 * Primer hueco libre de `dur` minutos desde `desde` (sin contar el bloque `excluir`), dentro de `hasta` días.
 * Si se indica `goalId`, primero busca días que aún no tengan una sesión de ese objetivo.
 */
async function buscarHueco(dur, desde, { excluir = null, momento = 'cualquiera', hasta = 7, goalId = null } = {}) {
  if (goalId) {
    const blocks = await db.all('blocks');
    const conObjetivo = new Set(blocks.filter(b => b.goalId === goalId && b.id !== excluir).map(b => b.fecha));
    const hueco = await buscarHuecoEn(dur, desde, { excluir, momento, hasta, saltar: conObjetivo });
    if (hueco) return hueco;
  }
  return buscarHuecoEn(dur, desde, { excluir, momento, hasta });
}

async function buscarHuecoEn(dur, desde, { excluir, momento, hasta, saltar = new Set() }) {
  const [disp, blocks, prefs] = await Promise.all([dispPorFecha(), db.all('blocks'), getPrefs()]);
  const VENTANA = { manana: [360, 720], tarde: [720, 1140], noche: [1140, 1440] }[momento];
  for (let i = 0; i <= hasta; i++) {
    const f = addDays(desde, i);
    if (saltar.has(f)) continue;
    const ocupados = blocks.filter(b => b.fecha === f && b.id !== excluir);
    const libres = huecosDia(f, disp, ocupados, prefs.descansoMin || 0).filter(([s, e]) => e - s >= dur);
    const enVentana = VENTANA && libres.find(([s, e]) => Math.max(s, VENTANA[0]) + dur <= Math.min(e, VENTANA[1]));
    const [s] = enVentana ? [Math.max(enVentana[0], VENTANA[0])] : libres[0] || [];
    if (s != null) return { fecha: f, inicio: toHHMM(s), fin: toHHMM(s + dur) };
  }
  return null;
}

async function regenerar(reg, fechas) {
  const [goals, disponibilidad, prefs, settings] = await Promise.all([db.all('goals'), dispPorFecha(), getPrefs(), getSettings()]);
  const nuevos = [];
  let avisos = [];
  for (const fecha of fechas) {
    const r = generarSemana({ fecha, goals, blocks: await db.all('blocks'), disponibilidad, prefs, settings });
    const frases = await frasesLocales(r.nuevos.length);
    for (const id of r.borrar) await reg.del('blocks', id);
    for (const [i, b] of r.nuevos.entries()) await reg.put('blocks', { ...b, frase: frases[i] || '' });
    nuevos.push(...r.nuevos);
    avisos = r.avisos;
  }
  return { nuevos, avisos };
}

const lineaBloque = (b, hoy) => `${b.hecho ? '✅' : toMin(b.fin) <= nowMin() && b.fecha === hoy ? '⏰' : '▫️'} **${b.inicio}–${b.fin}** ${b.titulo}`;

// ---------- Ejecutar ----------
/**
 * Ejecuta una orden (de entender() o de un botón). Devuelve { texto, botones?, ops? }.
 * Los botones llevan su propia orden: { etiqueta, orden }.
 */
export async function ejecutar(orden) {
  const hoy = hoyISO();
  const reg = registro();
  const r = await (ACCIONES[orden.tipo] || ACCIONES.desconocido)(orden, reg, hoy);
  return { ...r, ops: reg.ops.length ? reg.ops : null };
}

const ACCIONES = {
  async ayuda() {
    return { texto: `Soy tu asistente. Funciono sin internet y me puedes escribir con tus palabras. Por ejemplo:
- **«¿Qué me toca hoy?»** o «¿y mañana?»
- **«Ya he hecho informática»**, «he bebido agua»
- **«Hoy no puedo»**, «pásalo a mañana», «mueve inglés al jueves a las 18»
- **«Retrasa 30 minutos»**, «cancela el gimnasio»
- **«Añade 1 hora de inglés el sábado a las 10»**
- **«Hoy tengo libre de 5 a 8»**, «mañana libro», «el sábado trabajo de 9 a 14»
- **«Esta semana estoy de tarde»**
- **«He gastado 5 € en café»**, «aparto 20 € para el viaje»
- **«¿Cómo voy?»**, «reorganiza mi semana», «no tengo ganas»`,
    botones: [{ etiqueta: '📅 ¿Qué me toca hoy?', orden: { tipo: 'dia' } }] };
  },

  async gracias() {
    const [frase] = await frasesLocales(1);
    return { texto: `¡A ti! 💪 ${frase}` };
  },

  async dia(o, reg, hoy) {
    return { texto: await resumenDia(o.fecha || hoy), botones: [{ etiqueta: '➡️ ¿Y mañana?', orden: { tipo: 'dia', fecha: addDays(o.fecha || hoy, 1) } }] };
  },

  async hecho(o, reg, hoy) {
    const [bloques, habits] = await Promise.all([db.all('blocks'), db.all('habits')]);
    const habito = mejor(o.texto, habits, h => h.titulo);
    const bloqueNombrado = mejor(o.texto, bloques.filter(b => !b.hecho && b.fecha <= hoy && b.fecha >= addDays(hoy, -2)), b => b.titulo);
    if (habito && (!bloqueNombrado || parecido(o.texto, habito.titulo) >= parecido(o.texto, bloqueNombrado.titulo))) {
      if (habito.registros.includes(hoy)) return { texto: `Ya tenías marcado «${habito.titulo}» hoy. 👍` };
      await reg.put('habits', { ...habito, registros: [...habito.registros, hoy] });
      const racha = rachaDe({ ...habito, registros: [...habito.registros, hoy] }, hoy);
      return { texto: `${habito.emoji || '✨'} Marcado «${habito.titulo}».${racha > 1 ? ` ¡Racha de **${racha} días**! 🔥` : ''}` };
    }
    const b = bloqueNombrado || bloqueObjetivo(o.texto, bloques.filter(x => x.fecha <= hoy), hoy, hoy);
    if (!b) return { texto: 'No encuentro nada pendiente que marcar. Dime qué has hecho, por ejemplo: «ya he hecho inglés».' };
    await reg.put('blocks', { ...b, hecho: true });
    const [frase] = await frasesLocales(1);
    const quedan = bloques.filter(x => x.fecha === hoy && !x.hecho && x.id !== b.id);
    return { texto: `✅ ¡Hecho «${b.titulo}»! ${frase}${quedan.length ? `\nTe ${quedan.length === 1 ? 'queda' : 'quedan'} ${quedan.length} hoy.` : '\n🎉 ¡Has terminado todo lo de hoy!'}` };
  },

  async mover(o, reg, hoy) {
    const bloques = await db.all('blocks');
    const nombrado = mejor(o.texto, bloques.filter(b => !b.hecho && b.fecha >= addDays(hoy, -2)), b => b.titulo);
    // «Hoy no puedo» sin nombrar nada: se mueve todo lo que queda de hoy.
    if (!nombrado && !o.bloqueId && /no puedo|no me da tiempo|no llego/.test(o.texto) && (!o.fecha || o.fecha === hoy)) {
      const quedan = ordenarBloques(bloques.filter(b => b.fecha === hoy && !b.hecho && toMin(b.fin) > nowMin()));
      if (!quedan.length) return { texto: 'Hoy ya no te queda nada pendiente. ¡Descansa! 😌' };
      const lineas = [];
      for (const b of quedan) {
        const hueco = await buscarHueco(duracion(b), addDays(hoy, 1), { excluir: b.id, momento: await momentoDe(b), goalId: b.goalId });
        if (!hueco) { lineas.push(`- «${b.titulo}»: no he encontrado hueco esta semana, lo dejo como estaba.`); continue; }
        await reg.put('blocks', { ...b, ...hueco, fijado: true });
        lineas.push(`- «${b.titulo}» → ${etiquetaDia(hueco.fecha, hoy)} a las ${hueco.inicio}`);
      }
      return { texto: `Sin problema, hoy descansas. Lo he movido así:\n${lineas.join('\n')}` };
    }
    const b = o.bloqueId ? bloques.find(x => x.id === o.bloqueId) : nombrado || bloqueObjetivo(o.texto, bloques, o.fecha && !esManana(o.texto) ? o.fecha : hoy, hoy);
    if (!b) return { texto: 'No sé qué quieres mover. Dime el nombre, por ejemplo: «pasa el inglés a mañana».' };
    const dur = duracion(b);
    let destino;
    const fecha = o.destino || (o.fecha && o.fecha !== b.fecha ? o.fecha : null);
    if (o.hora || o.rango) {
      const inicio = o.rango?.inicio || o.hora;
      destino = { fecha: fecha || b.fecha, inicio, fin: o.rango?.fin || toHHMM(Math.min(toMin(inicio) + dur, 1439)) };
    } else if (fecha) destino = await buscarHueco(dur, fecha, { excluir: b.id, momento: await momentoDe(b) }); // el día que pide, aunque ya tenga otra sesión
    else destino = await buscarHueco(dur, b.fecha < hoy ? hoy : addDays(b.fecha, 1), { excluir: b.id, momento: await momentoDe(b), goalId: b.goalId });
    if (!destino) return { texto: `No encuentro un hueco libre para «${b.titulo}» en los próximos días. Prueba a decirme el día y la hora: «pásalo al sábado a las 10».` };
    const choque = bloques.find(x => x.id !== b.id && x.fecha === destino.fecha && toMin(x.inicio) < toMin(destino.fin) && toMin(destino.inicio) < toMin(x.fin));
    await reg.put('blocks', { ...b, ...destino, fijado: true, atrasoGestionado: true });
    return { texto: `📅 «${b.titulo}» movido a **${etiquetaDia(destino.fecha, hoy)}, ${destino.inicio}–${destino.fin}**.${choque ? `\n⚠️ Coincide con «${choque.titulo}».` : ''}` };
  },

  async retrasar(o, reg, hoy) {
    const bloques = await db.all('blocks');
    const b = bloqueObjetivo(o.texto, bloques, o.fecha || hoy, hoy);
    if (!b) return { texto: 'No encuentro qué retrasar. Dime el nombre: «retrasa el inglés 30 minutos».' };
    const dur = duracion(b);
    let ini = o.hora ? toMin(o.hora) : toMin(b.inicio) + (o.adelantar ? -1 : 1) * (o.duracion || 30);
    ini = Math.max(0, Math.min(ini, 1439 - dur));
    await reg.put('blocks', { ...b, inicio: toHHMM(ini), fin: toHHMM(ini + dur), fijado: true });
    return { texto: `⏱️ «${b.titulo}» ahora es de **${toHHMM(ini)} a ${toHHMM(ini + dur)}**.` };
  },

  async cancelar(o, reg, hoy) {
    const bloques = await db.all('blocks');
    const b = o.bloqueId ? bloques.find(x => x.id === o.bloqueId) : bloqueObjetivo(o.texto, bloques, o.fecha, hoy);
    if (!b) return { texto: 'No encuentro qué cancelar. Dime el nombre: «cancela el gimnasio de hoy».' };
    await reg.del('blocks', b.id);
    return { texto: `🗑️ He quitado «${b.titulo}» de ${etiquetaDia(b.fecha, hoy)} (${b.inicio}).` };
  },

  async anadir(o, reg, hoy) {
    const goals = (await db.all('goals')).filter(g => !g.archivado);
    const goal = mejor(o.texto, goals, g => g.titulo);
    const fecha = o.fecha || hoy;
    const dur = o.rango ? toMin(o.rango.fin) - toMin(o.rango.inicio) : o.duracion || goal?.sesionMin || (await getPrefs()).sesionMin || 60;
    let destino;
    if (o.rango) destino = { fecha, inicio: o.rango.inicio, fin: o.rango.fin };
    else if (o.hora) destino = { fecha, inicio: o.hora, fin: toHHMM(Math.min(toMin(o.hora) + dur, 1439)) };
    else destino = await buscarHueco(dur, fecha, { momento: goal?.momento || 'cualquiera', hasta: 0 }) || await buscarHueco(dur, fecha, { momento: goal?.momento || 'cualquiera' });
    if (!destino) return { texto: 'No encuentro un hueco libre. Dime la hora: «añade inglés mañana a las 18».' };
    const titulo = goal?.titulo || tituloLibre(o.texto);
    const [frase] = await frasesLocales(1);
    const b = { id: uid(), ...destino, titulo, goalId: goal?.id || null, fijado: true, hecho: false, importante: Number(goal?.prioridad) === 3, frase, origen: 'asistente' };
    await reg.put('blocks', b);
    return { texto: `➕ Añadido «${titulo}» ${etiquetaDia(destino.fecha, hoy)} de **${destino.inicio} a ${destino.fin}**.` };
  },

  async libre(o, reg, hoy) {
    const fecha = o.fecha || hoy;
    const franjas = o.rango ? [o.rango] : [{ inicio: '10:00', fin: '13:30' }, { inicio: '16:30', fin: '20:30' }];
    return cambiarDia(reg, fecha, franjas, hoy, `Apuntado: ${etiquetaDia(fecha, hoy)} tienes libre ${o.rango ? `de ${o.rango.inicio} a ${o.rango.fin}` : 'todo el día'}.`);
  },

  async ocupado(o, reg, hoy) {
    const disp = await dispPorFecha();
    const fecha = o.fecha;
    const [a, b] = [toMin(o.rango.inicio) - 45, toMin(o.rango.fin) + 45]; // con margen para ir y volver
    const franjas = (disp(fecha)[weekday(fecha)] || []).flatMap(f => {
      const [s, e] = [toMin(f.inicio), toMin(f.fin)];
      if (e <= a || s >= b) return [f];
      return [...(s < a ? [{ inicio: f.inicio, fin: toHHMM(a) }] : []), ...(e > b ? [{ inicio: toHHMM(b), fin: f.fin }] : [])];
    }).filter(f => toMin(f.fin) - toMin(f.inicio) >= 30);
    return cambiarDia(reg, fecha, franjas, hoy, `Apuntado: ${etiquetaDia(fecha, hoy)} trabajas de ${o.rango.inicio} a ${o.rango.fin}.`);
  },

  async turno(o, reg, hoy) {
    const turnos = await getTurnos();
    if (!turnos?.rotativo) return { texto: 'No tengo guardados tus turnos rotativos. Cuéntamelos en «🧠 Mi plan a medida» (Horario) y los tendré en cuenta.' };
    if (!turnos.patron.includes(o.turno)) return { texto: `En tus turnos no tengo turno de ${TURNO_TXT[o.turno]}. Revisa tu plan a medida.` };
    const fecha = o.siguiente ? addDays(hoy, 7) : hoy;
    const inicio = addDays(fecha, -((weekday(fecha) - turnos.inicioCiclo + 7) % 7));
    const actual = turnos.patron[posicionEnPatron(turnos, fecha)];
    if (actual === o.turno) return { texto: `Sí, ya lo tenía: ${o.siguiente ? 'la semana que viene' : 'esta semana'} estás de ${TURNO_TXT[o.turno]}. 👍` };
    const nuevos = { ...turnos, referencia: addDays(inicio, -7 * turnos.patron.indexOf(o.turno)) };
    await reg.kv('turnos', nuevos);
    const { nuevos: bloques } = await regenerar(reg, [hoy, addDays(weekStart(hoy), 7)]);
    return { texto: `🏭 Cambiado: ${o.siguiente ? 'la semana que viene' : 'esta semana'} estás de **${TURNO_TXT[o.turno]}**. He reorganizado tu horario (${bloques.length} bloques).` };
  },

  async replanificar(o, reg, hoy) {
    const { nuevos, avisos } = await regenerar(reg, [hoy, addDays(weekStart(hoy), 7)]);
    return { texto: `🗓️ Listo: he reorganizado esta semana y la siguiente con ${nuevos.length} bloques. Los fijados 📌 y los ya hechos no los he tocado.${avisos.length ? `\n⚠️ ${avisos[0]}` : ''}` };
  },

  async gasto(o, reg, hoy) {
    const nota = o.texto.match(/\ben\s+([a-z ]{3,30}?)(?:\s+(?:hoy|ayer|esta|por)\b|$)/)?.[1] || '';
    const fecha = /\bayer\b/.test(o.texto) ? addDays(hoy, -1) : hoy;
    await reg.put('expenses', { id: uid(), importe: o.importe, categoria: o.categoria, nota, fecha, creado: Date.now() });
    const cat = CATEGORIAS[o.categoria];
    return { texto: `💸 Apuntado: ${fmtEur(o.importe)} en ${cat ? `${cat.i} ${cat.n}` : 'Otros'}${fecha !== hoy ? ' (ayer)' : ''}.` };
  },

  async ahorro(o, reg, hoy) {
    const metas = await db.all('savingsGoals');
    if (!metas.length) return { texto: 'Aún no tienes metas de ahorro. Crea una en la pestaña **Ahorro** y luego dime «aparto 20 € para…».' };
    const meta = mejor(o.texto, metas, x => x.nombre) || metas.sort((a, b) => (b.prioridad || 0) - (a.prioridad || 0))[0];
    const importe = /saco|retiro|quito/.test(o.texto) ? -o.importe : o.importe;
    await reg.put('contributions', { id: uid(), goalId: meta.id, importe, fecha: hoy, nota: 'Desde el asistente' });
    const e = estadoMeta(meta, [...await db.all('contributions')], hoy);
    return { texto: `🐷 ${importe >= 0 ? 'Guardados' : 'Sacados'} ${fmtEur(Math.abs(importe))} ${importe >= 0 ? 'en' : 'de'} «${meta.nombre}». Llevas ${fmtEur(e.ahorrado, true)} de ${fmtEur(meta.meta, true)} (${Math.round(e.pct * 100)} %).` };
  },

  async animo(o, reg, hoy) {
    const bloques = await db.all('blocks');
    const b = ordenarBloques(bloques.filter(x => x.fecha === hoy && !x.hecho && toMin(x.fin) > nowMin()))[0];
    const [frase] = await frasesLocales(1);
    if (!b) return { texto: `Es normal tener días así. 💜 Hoy no te queda nada pendiente: descansa, que también cuenta. ${frase}` };
    return {
      texto: `Es normal tener días así. 💜 No hace falta hacerlo perfecto: **lo importante es no romper la cadena**.\nTe toca «${b.titulo}» a las ${b.inicio}. ¿Lo dejamos en solo 15 minutos? Muchas veces, al empezar, las ganas llegan solas.`,
      botones: [{ etiqueta: '⏱️ Solo 15 minutos', orden: { tipo: 'mini', bloqueId: b.id } }, { etiqueta: '📅 Pásalo a otro día', orden: { tipo: 'mover', bloqueId: b.id, texto: '' } }],
    };
  },

  async mini(o, reg, hoy) {
    const b = await db.get('blocks', o.bloqueId);
    if (!b) return { texto: 'Ese bloque ya no existe.' };
    await reg.put('blocks', { ...b, fin: toHHMM(toMin(b.inicio) + 15), fijado: true });
    return { texto: `💪 Hecho: «${b.titulo}» ahora son solo 15 minutos (${b.inicio}–${toHHMM(toMin(b.inicio) + 15)}). ¡Tú puedes!` };
  },

  async marcar(o, reg) {
    const b = await db.get('blocks', o.bloqueId);
    if (!b) return { texto: 'Ese bloque ya no existe.' };
    await reg.put('blocks', { ...b, hecho: true, atrasoGestionado: true });
    return { texto: `✅ ¡Genial! Marcado «${b.titulo}» como hecho.` };
  },

  async olvidar(o, reg) {
    const b = await db.get('blocks', o.bloqueId);
    if (b) await reg.put('blocks', { ...b, atrasoGestionado: true });
    return { texto: 'Vale, lo dejamos estar. Mañana más y mejor. 🙂' };
  },

  async objetivo(o, reg, hoy) {
    const { raw } = interpretarTexto(o.textoOriginal || o.texto, { hoy });
    const nuevos = raw.objetivos;
    if (!nuevos.length) return { texto: 'Cuéntame un poco más: ¿qué quieres conseguir? Por ejemplo, «quiero aprender inglés 3 veces por semana».' };
    return {
      texto: `Te propongo:\n${nuevos.map(x => `- 🎯 **${x.titulo}**: ${x.horasSemana} h/semana${x.sesionMin ? ` en sesiones de ${x.sesionMin} min` : ''}`).join('\n')}\n¿Lo añado y te lo coloco en el horario?`,
      botones: [{ etiqueta: '✓ Sí, añádelo', orden: { tipo: 'crearObjetivos', objetivos: nuevos } }],
    };
  },

  async crearObjetivos(o, reg, hoy) {
    const existentes = await db.all('goals');
    for (const x of o.objetivos) {
      if (existentes.some(g => normalizar(g.titulo) === normalizar(x.titulo) && !g.archivado)) continue;
      const { tareas = [], ...datos } = x;
      const id = uid();
      await reg.put('goals', { ...datos, id, creado: hoy, archivado: false });
      for (const [k, titulo] of tareas.entries()) await reg.put('tasks', { id: uid() + k, goalId: id, titulo, hecho: false, creado: Date.now() + k });
    }
    const { nuevos } = await regenerar(reg, [hoy, addDays(weekStart(hoy), 7)]);
    return { texto: `🎯 ¡Añadido! Te he colocado ${nuevos.length} bloques en el horario de esta semana y la siguiente.` };
  },

  async progreso(o, reg, hoy) {
    const [blocks, habits, tasks, goals, inicioApp] = await Promise.all([db.all('blocks'), db.all('habits'), db.all('tasks'), db.all('goals'), kvGet('inicioApp', hoy)]);
    const semana = progresoDiario({ blocks, habits, tasks, desde: weekStart(hoy), hasta: hoy, inicioApp });
    const anterior = progresoDiario({ blocks, habits, tasks, desde: addDays(weekStart(hoy), -7), hasta: addDays(weekStart(hoy), -1), inicioApp });
    const pct = mediaSerie(semana), pctAnt = mediaSerie(anterior);
    const lineasObj = goals.filter(g => !g.archivado && g.horasSemana).map(g => {
      const min = blocks.filter(b => b.goalId === g.id && b.hecho && b.fecha >= weekStart(hoy) && b.fecha <= hoy).reduce((a, b) => a + duracion(b), 0);
      return `- ${g.titulo}: ${fmtHoras(min)} de ${fmtHoras(g.horasSemana * 60)}`;
    });
    const rachas = habits.map(h => [h, mejorRacha(h), rachaDe(h, hoy)]).filter(([, , r]) => r > 0);
    return { texto: [
      pct == null ? 'Esta semana aún no hay nada que medir.' : `Esta semana vas al **${pct} %**${pctAnt != null ? ` (${pct >= pctAnt ? '▲' : '▼'} ${Math.abs(pct - pctAnt)} puntos frente a la anterior)` : ''}.`,
      lineasObj.length ? `Horas de tus objetivos:\n${lineasObj.join('\n')}` : '',
      rachas.length ? `Rachas: ${rachas.map(([h, , r]) => `${h.emoji || '✨'} ${r} ${r === 1 ? 'día' : 'días'}`).join(' · ')} 🔥` : '',
      pct != null ? (pct >= 80 ? '¡Vas genial! 🌟' : pct >= 50 ? 'Vas bien, sigue así. 💪' : 'Poco a poco: lo importante es no parar. 🌱') : '',
    ].filter(Boolean).join('\n'), botones: [{ etiqueta: '📈 Ver gráficas', orden: { tipo: 'ir', destino: '#progreso' } }] };
  },

  async desconocido(o) {
    return { texto: 'Perdona, no te he entendido. 🙈 Prueba con algo como «¿qué me toca hoy?», «ya he hecho inglés», «pásalo a mañana» o escribe **«ayuda»** para ver todo lo que sé hacer.',
      botones: [{ etiqueta: '❓ Ayuda', orden: { tipo: 'ayuda' } }] };
  },
};

async function momentoDe(b) {
  if (!b.goalId) return 'cualquiera';
  return (await db.get('goals', b.goalId))?.momento || 'cualquiera';
}

function tituloLibre(t) {
  const m = t.match(/(?:anade|pon(?:me)?|apunta(?:me)?|mete(?:me)?|reserva|agenda|programa|quiero|voy a)\s+(?:(?:\d+|una|un|media|dos|tres)\s+(?:horas?|h|minutos|min)\s+(?:de|para)\s+)?(.+?)(?:\s+(?:hoy|manana|pasado|el|a las|de \d|durante|\d)|$)/);
  const s = (m?.[1] || 'Tiempo para mí').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function rachaDe(h, hoy) {
  let n = 0, d = h.registros.includes(hoy) ? hoy : addDays(hoy, -1);
  while (h.registros.includes(d)) { n++; d = addDays(d, -1); }
  return n;
}

// Cambia las horas libres de un solo día y reorganiza esa semana.
async function cambiarDia(reg, fecha, franjas, hoy, texto) {
  const extra = await kvGet('dispExtra', {});
  const limpio = Object.fromEntries(Object.entries(extra).filter(([f]) => f >= hoy));
  await reg.kv('dispExtra', { ...limpio, [fecha]: franjas });
  const { nuevos } = await regenerar(reg, [fecha]);
  const delDia = ordenarBloques(nuevos.filter(b => b.fecha === fecha));
  return { texto: `${texto} He reorganizado esa semana.${delDia.length ? `\nEse día te toca:\n${delDia.map(b => `- **${b.inicio}–${b.fin}** ${b.titulo}`).join('\n')}` : ''}` };
}

// ---------- Mensajes que el asistente envía solo ----------
export async function resumenDia(fecha = hoyISO()) {
  const hoy = hoyISO();
  const [perfil, bloques, habits, turnos] = await Promise.all([getProfile(), db.all('blocks'), db.all('habits'), getTurnos()]);
  const delDia = ordenarBloques(bloques.filter(b => b.fecha === fecha));
  const esHoy = fecha === hoy;
  const h = new Date().getHours();
  const saludo = !esHoy ? `Plan de **${etiquetaDia(fecha, hoy)}**` : `**${h < 6 ? 'Buenas noches' : h < 14 ? '¡Buenos días' : h < 21 ? '¡Buenas tardes' : '¡Buenas noches'}${perfil.nombre ? `, ${perfil.nombre}` : ''}!**`;
  const l = [esHoy ? `${saludo} Hoy es ${fmtFecha(fecha).toLowerCase()}.` : `${saludo}:`];
  if (turnos?.rotativo) {
    const tipo = tipoTurno(turnos, fecha), hor = turnos.horarios?.[tipo];
    const trabaja = hor && (turnos.diasTrabajo ? turnos.diasTrabajo.includes(weekday(fecha)) : true);
    l.push(trabaja ? `🏭 Turno de **${TURNO_TXT[tipo]}** (${hor.inicio}–${hor.fin}).` : `🏭 Hoy libras (semana de turno de ${TURNO_TXT[tipo]}).`);
  }
  if (delDia.length) {
    l.push(`${esHoy ? 'Te toca' : 'Tendrás'}:`, ...delDia.map(b => `- ${lineaBloque(b, hoy)}`));
    const sig = esHoy && delDia.find(b => !b.hecho && toMin(b.fin) > nowMin());
    if (sig) l.push(toMin(sig.inicio) <= nowMin() ? `👉 **Ahora:** ${sig.titulo}, hasta las ${sig.fin}.` : `👉 Lo siguiente: **${sig.titulo}** a las ${sig.inicio}.`);
    else if (esHoy && delDia.every(b => b.hecho)) l.push('🎉 ¡Has completado todo lo de hoy!');
  } else l.push('No tienes nada planificado. Puedes decirme «añade 30 minutos de inglés a las 18» o «reorganiza mi semana».');
  const pendientes = esHoy ? habits.filter(x => !x.registros.includes(hoy)) : [];
  if (pendientes.length) l.push(`Hábitos pendientes: ${pendientes.map(x => `${x.emoji || '✨'} ${x.titulo}`).join(' · ')}`);
  return l.join('\n');
}

/**
 * Mensajes que el asistente manda solo al abrirlo: el plan del día (una vez al día),
 * lo que se quedó sin hacer y, por la noche, el resumen del día.
 */
export async function mensajesProactivos() {
  const hoy = hoyISO();
  const estado = await kvGet('agenteEstado', {});
  const out = [];
  if (estado.resumen !== hoy) {
    out.push({ texto: await resumenDia(hoy), botones: [{ etiqueta: '❓ ¿Qué puedo pedirte?', orden: { tipo: 'ayuda' } }] });
    estado.resumen = hoy;
  }
  const bloques = await db.all('blocks');
  const atrasados = ordenarBloques(bloques.filter(b => !b.hecho && !b.atrasoGestionado && b.fecha >= addDays(hoy, -2)
    && (b.fecha < hoy || (b.fecha === hoy && toMin(b.fin) + 30 <= nowMin())))).slice(0, 3);
  for (const b of atrasados) {
    if ((estado.preguntados || []).includes(b.id)) continue;
    out.push({ texto: `${b.fecha < hoy ? (b.fecha === addDays(hoy, -1) ? 'Ayer' : `El ${fmtFecha(b.fecha, { weekday: 'long' }).toLowerCase()}`) : 'Hoy'} tenías «**${b.titulo}**» a las ${b.inicio} y no está marcado. ¿Lo hiciste?`,
      botones: [{ etiqueta: '✅ Sí, lo hice', orden: { tipo: 'marcar', bloqueId: b.id } }, { etiqueta: '📅 Búscale otro hueco', orden: { tipo: 'mover', bloqueId: b.id, texto: '' } }, { etiqueta: '✕ Olvídalo', orden: { tipo: 'olvidar', bloqueId: b.id } }] });
    estado.preguntados = [...(estado.preguntados || []).slice(-30), b.id];
  }
  const delDia = bloques.filter(b => b.fecha === hoy);
  const terminoDia = delDia.length && delDia.every(b => toMin(b.fin) <= nowMin());
  if (estado.cierre !== hoy && (nowMin() >= 21 * 60 + 30 || terminoDia) && delDia.length) {
    const hechos = delDia.filter(b => b.hecho).length;
    const [frase] = await frasesLocales(1);
    out.push({ texto: `🌙 **Resumen de hoy:** has hecho ${hechos} de ${delDia.length}. ${hechos === delDia.length ? '¡Día perfecto! ⭐' : hechos ? '¡Bien hecho! Cada paso cuenta.' : 'Mañana es otra oportunidad.'} ${frase}`,
      botones: [{ etiqueta: '➡️ ¿Qué me toca mañana?', orden: { tipo: 'dia', fecha: addDays(hoy, 1) } }] });
    estado.cierre = hoy;
  }
  await kvSet('agenteEstado', estado);
  return out;
}


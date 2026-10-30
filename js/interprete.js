// Intérprete de texto sin IA: entiende frases habituales en español sobre trabajo, turnos, horarios,
// objetivos, hábitos y dinero, y monta un plan con reglas. No necesita internet ni claves.
// Devuelve el mismo formato que normalizarPlan() espera, más los turnos y lo que ha supuesto.
import { addDays, weekday, toMin, toHHMM, diasEntre, parseISODate, toISODate } from './util.js';

// ---------- Texto ----------
// Minúsculas y sin tildes, conservando la longitud para poder recortar el texto original por posiciones.
export const normalizar = s => [...s].map(c => {
  const r = c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return r.length === c.length ? r : c;
}).join('');
const mayuscula = s => s.charAt(0).toUpperCase() + s.slice(1);

const NUM = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, media: 0.5, medio: 0.5 };
const numero = s => (s in NUM ? NUM[s] : Number(String(s).replace(',', '.')));
const NUMS = String.raw`\d+(?:[.,]\d+)?|una?|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|media|medio`;

export const DIAS_N = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const DIA = String.raw`(lunes|martes|miercoles|jueves|viernes|sabados?|domingos?)`;
const diaIdx = d => DIAS_N.indexOf(d.replace(/^(sabado|domingo)s$/, '$1')); // «los sábados» → sabado; «viernes» se queda igual
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// ---------- Horas ----------
// «7», «7:30», «7.30», «7h30», «7 y media», «8 menos cuarto», «8 de la tarde».
const H = String.raw`(\d{1,2})(?:[:.'h](\d{2}))?(?:\s*y\s*(media|cuarto))?(?:\s*menos\s*(cuarto))?(?:\s*h\b)?(?:\s*de\s*la\s*(manana|tarde|noche|madrugada))?`;
function aMinutos(m, i) {
  let h = Number(m[i]), min = m[i + 1] ? Number(m[i + 1]) : 0;
  if (m[i + 2] === 'media') min += 30;
  if (m[i + 2] === 'cuarto') min += 15;
  if (m[i + 3]) min -= 15;
  if ((m[i + 4] === 'tarde' || m[i + 4] === 'noche') && h < 12) h += 12;
  if (h > 24 || min >= 60) return null;
  return h * 60 + min;
}
const RANGO = new RegExp(String.raw`(?:\b(de|desde|entre)\s+)?(?:las?\s+)?${H}\s*(a|hasta|y|-|–)\s*(?:las?\s+)?${H}`, 'g');
const TRAS_RANGO_NO_HORA = /^\s*(veces|dias|horas|semanas|meses|euros|€|anos|km|kilos|minutos|min\b|personas|libros)/;

export function rangos(t) {
  const out = [];
  for (const m of t.matchAll(RANGO)) {
    const [pre, sep] = [m[1], m[7]];
    if (sep === 'y' && pre !== 'entre') continue;
    const conMinutos = /[:.h']\d{2}/.test(m[0]);
    if (!pre && !conMinutos && sep !== '-' && sep !== '–') continue;
    if (TRAS_RANGO_NO_HORA.test(t.slice(m.index + m[0].length))) continue;
    let ini = aMinutos(m, 2), fin = aMinutos(m, 8);
    if (ini == null || fin == null) continue;
    // «de 9 a 5» → hasta las 17; «de 22 a 6» → turno de noche que cruza la medianoche.
    if (fin <= ini) {
      if (fin + 720 > ini && fin + 720 <= 1440 && !m[12]) fin += 720;
      else fin += 1440;
    }
    out.push({ ini, fin, pos: m.index, finPos: m.index + m[0].length });
  }
  return out;
}

export function horaSuelta(t, verbos) {
  const re = new RegExp(String.raw`\b(?:${verbos})\b[^.\d]{0,30}?(?:a las|sobre las|a eso de las|hacia las|a la|sobre la|las|la)\s+${H}`, 'g');
  return [...t.matchAll(re)].map(m => ({ min: aMinutos(m, 1), pos: m.index, sufijo: m[5] })).filter(x => x.min != null);
}

// ---------- Días ----------
function diasEn(frag) {
  const s = new Set();
  const add = (a, b) => { for (let i = a; ; i = (i + 1) % 7) { s.add(i); if (i === b) break; } };
  for (const m of frag.matchAll(new RegExp(String.raw`(?:de|desde|del)\s+${DIA}\s+(?:a|al|hasta)\s+(?:el\s+)?${DIA}`, 'g'))) add(diaIdx(m[1]), diaIdx(m[2]));
  if (/entre semana|dias laborables|de diario/.test(frag)) add(0, 4);
  if (/fines? de semana|findes?\b/.test(frag)) { s.add(5); s.add(6); }
  if (/todos los dias|a diario|cada dia|diariamente/.test(frag)) add(0, 6);
  if (!s.size) for (const m of frag.matchAll(new RegExp(DIA, 'g'))) s.add(diaIdx(m[1]));
  return s;
}

// ---------- Fechas límite ----------
function fechaLimite(seg, hoy) {
  const y = Number(hoy.slice(0, 4));
  const iso = (a, mes, dia) => `${a}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  const futura = (mes, dia) => { const f = iso(y, mes, dia); return f >= hoy ? f : iso(y + 1, mes, dia); };
  const finMes = mes => new Date(2001, mes, 0).getDate();
  let m;
  if ((m = seg.match(new RegExp(String.raw`(?:para|antes del?|hasta|el)\s+(?:el\s+)?(\d{1,2})\s+de\s+(${MESES.join('|')})`)))) return futura(MESES.indexOf(m[2]) + 1, Number(m[1]));
  if ((m = seg.match(new RegExp(String.raw`antes de\s+(${MESES.join('|')})`)))) {
    const mes = MESES.indexOf(m[1]) + 1;
    return mes === 1 ? futura(12, 31) : futura(mes - 1, finMes(mes - 1));
  }
  if ((m = seg.match(new RegExp(String.raw`(?:para|en|hasta|de aqui a)\s+(${MESES.join('|')})`)))) { const mes = MESES.indexOf(m[1]) + 1; return futura(mes, finMes(mes)); }
  if (/verano/.test(seg)) return futura(6, 21);
  if (/navidad/.test(seg)) return futura(12, 24);
  if (/fin(al)? de ano|fin del ano/.test(seg)) return futura(12, 31);
  if ((m = seg.match(new RegExp(String.raw`(?:en|dentro de|de aqui a)\s+(${NUMS})\s+(mes|meses|semanas?|anos?)\b`)))) {
    const n = numero(m[1]), d = parseISODate(hoy);
    if (m[2].startsWith('mes')) d.setMonth(d.getMonth() + n);
    else if (m[2].startsWith('semana')) d.setDate(d.getDate() + n * 7);
    else d.setFullYear(d.getFullYear() + n);
    return toISODate(d);
  }
  return '';
}

// ---------- Catálogo de objetivos ----------
const IDIOMAS = { ingles: 'inglés', frances: 'francés', aleman: 'alemán', italiano: 'italiano', portugues: 'portugués', chino: 'chino', japones: 'japonés', catalan: 'catalán', euskera: 'euskera', gallego: 'gallego' };
const CATALOGO = [
  { clave: 'empleo', re: /\b((buscar|encontrar|conseguir) (un )?(trabajo|empleo|curro)|curriculum|entrevistas? de trabajo|cambiar de trabajo)\b/, area: 'trabajo', horas: 5, sesion: 60,
    titulo: s => (/cambiar de trabajo/.test(s) ? 'Cambiar de trabajo' : 'Encontrar trabajo'), tareas: ['Actualizar el currículum', 'Apuntarme a 3 portales de empleo', 'Enviar 5 candidaturas esta semana'] },
  { clave: 'idioma', re: /\b(ingles|frances|aleman|italiano|portugues|chino|japones|catalan|euskera|gallego|idiomas?)\b/, area: 'estudio', horas: 3, sesion: 45,
    titulo: s => { const id = s.match(/\b(ingles|frances|aleman|italiano|portugues|chino|japones|catalan|euskera|gallego)\b/)?.[1]; const nombre = IDIOMAS[id] || 'idiomas'; const nivel = s.match(/\b([abc][12])\b/)?.[1]; return nivel ? `Sacarme el ${nivel.toUpperCase()} de ${nombre}` : /mejorar/.test(s) ? `Mejorar mi ${nombre}` : `Aprender ${nombre}`; },
    tareas: ['Hacer un test de nivel gratuito online', 'Elegir una app o curso (Duolingo, YouTube, podcasts…)', 'Practicar 15 minutos el primer día'] },
  { clave: 'programacion', re: /\b(program\w*|codigo|python|javascript|java|desarroll\w*|paginas? web|web|apps?)\b/, area: 'estudio', horas: 3, sesion: 45,
    titulo: () => 'Aprender a programar', tareas: ['Elegir un curso gratuito para principiantes (freeCodeCamp, YouTube…)', 'Instalar lo necesario y hacer el primer ejercicio', 'Practicar un rato cada sesión, aunque sea poco'] },
  { clave: 'ofimatica', re: /\b(excel|word|ofimatica|office|hojas de calculo)\b/, area: 'estudio', horas: 2, sesion: 30,
    titulo: () => 'Dominar Excel y la ofimática', tareas: ['Buscar un curso gratuito de Excel desde cero', 'Practicar con una hoja de tus gastos', 'Aprender una fórmula nueva cada sesión'] },
  { clave: 'redes', re: /\b(redes informaticas|ciberseguridad|hacking|sistemas informaticos|servidores|linux)\b/, area: 'estudio', horas: 3, sesion: 45,
    titulo: () => 'Aprender redes y sistemas', tareas: ['Elegir un curso de introducción a redes', 'Instalar Linux en una máquina virtual', 'Apuntar cada concepto nuevo'] },
  { clave: 'informatica', re: /\b(informatic\w*|ordenador(es)?|tecnologia|digital|computacion)\b/, area: 'estudio', horas: 3, sesion: 45,
    titulo: () => 'Mejorar mis conocimientos de informática',
    tareas: ['Elegir un curso gratuito de introducción (YouTube, Coursera, freeCodeCamp…)', 'Hacer la primera lección, de 20–30 minutos', 'Apuntar en una libreta lo que aprendes cada día', 'Decidir qué rama te gusta más: programación, ofimática, redes…'] },
  { clave: 'gimnasio', re: /\b(gimnasio|gym|ponerme (en forma|fuerte|cachas)|musculacion|pesas|hacer deporte|hacer ejercicio|entrenar|crossfit)\b/, area: 'salud', horas: 3, sesion: 60, momento: 'cualquiera',
    titulo: s => (/gimnasio|gym|pesas|musculacion/.test(s) ? 'Ir al gimnasio' : 'Hacer deporte'), tareas: ['Apuntarme al gimnasio o elegir una rutina en casa', 'Preparar la mochila la noche antes', 'Apuntar cada entrenamiento'] },
  { clave: 'correr', re: /\b(correr|running|salir a correr|maraton|\d+ ?km)\b/, area: 'salud', horas: 2, sesion: 45,
    titulo: () => 'Salir a correr', tareas: ['Conseguir unas zapatillas cómodas', 'Empezar alternando andar y trotar', 'Apuntar tiempo y distancia'] },
  { clave: 'leer', re: /\b(leer|lectura|libros?)\b/, area: 'personal', horas: 2, sesion: 30, momento: 'noche', hobby: true,
    titulo: () => 'Leer más', tareas: ['Elegir el primer libro', 'Dejar el libro en la mesilla'] },
  { clave: 'oposiciones', re: /\b(oposicion\w*|selectividad|examen\w*|carrera|universidad|grado|master|bachillerato|estudiar)\b/, area: 'estudio', horas: 6, sesion: 60,
    titulo: s => (/oposicion/.test(s) ? 'Preparar las oposiciones' : /selectividad/.test(s) ? 'Preparar la selectividad' : /master/.test(s) ? 'Sacar el máster' : /carrera|grado|universidad/.test(s) ? 'Sacar la carrera' : 'Estudiar'),
    tareas: ['Reunir el temario y los apuntes', 'Hacer un calendario de temas', 'Empezar por el tema que mejor llevas'] },
  { clave: 'carnet', re: /\b(carnet|permiso de conducir|autoescuela|teorico)\b/, area: 'personal', horas: 3, sesion: 45,
    titulo: () => 'Sacarme el carnet de conducir', tareas: ['Apuntarme a una autoescuela', 'Hacer un test del teórico cada día'] },
  { clave: 'musica', re: /\b(guitarra|piano|bateria|cantar|musica|ukelele|violin)\b/, area: 'ocio', horas: 2, sesion: 30, hobby: true,
    titulo: s => { const i = s.match(/\b(guitarra|piano|bateria|ukelele|violin)\b/)?.[1]; return i ? `Practicar ${i === 'bateria' ? 'batería' : i === 'violin' ? 'violín' : i}` : /cantar/.test(s) ? 'Practicar canto' : 'Practicar música'; },
    tareas: ['Elegir una canción o ejercicio para empezar', 'Practicar 20 minutos sin interrupciones'] },
  { clave: 'cocina', re: /\b(cocinar|cocina|comer (mejor|sano|bien)|perder peso|adelgazar|bajar peso|dieta)\b/, area: 'salud', horas: 1.5, sesion: 45,
    titulo: s => (/cocin/.test(s) ? 'Aprender a cocinar' : /peso|adelgaz/.test(s) ? 'Perder peso con buenos hábitos' : 'Comer más sano'), tareas: ['Planificar el menú de la semana', 'Hacer la lista de la compra', 'Cocinar algo sano el fin de semana'] },
  { clave: 'proyecto', re: /\b(negocio|emprender|proyecto|canal|youtube|blog|tienda online|freelance)\b/, area: 'trabajo', horas: 4, sesion: 60,
    titulo: s => (/youtube|canal/.test(s) ? 'Crear mi canal' : /blog/.test(s) ? 'Escribir mi blog' : 'Avanzar en mi proyecto'), tareas: ['Escribir en una página qué quieres conseguir', 'Hacer la primera tarea pequeña'] },
  { clave: 'arte', re: /\b(dibujar|dibujo|pintar|pintura|fotografia|escribir|novela)\b/, area: 'ocio', horas: 2, sesion: 45, hobby: true,
    titulo: s => (/dibuj/.test(s) ? 'Dibujar más' : /pint/.test(s) ? 'Pintar' : /fotograf/.test(s) ? 'Aprender fotografía' : 'Escribir'), tareas: ['Preparar el material', 'Hacer la primera sesión sin buscar la perfección'] },
];
// En una frase concreta («aprender a programar en informática») gana el más específico, que va antes en la lista.
const ORDEN_ESPECIFICO = ['empleo', 'programacion', 'ofimatica', 'redes', 'idioma', 'informatica', 'gimnasio', 'correr', 'leer', 'oposiciones', 'carnet', 'musica', 'cocina', 'proyecto', 'arte'];

const DESEO = /\b(quiero|quisiera|me gustaria|me encantaria|mi (?:objetivo|meta|proposito|reto|suen)\w* (?:es|seria|son)|mis objetivos son|necesito|me propongo|pretendo|intentar|ojala|deseo|aspiro a|tengo pensado|voy a empezar a|me apetece)\b/g;
const SUAVE = /poco a poco|sin agobi|sin rallar|no rallarme|no agobiarme|tranquil|sin presion|despacio|sin prisa|paso a paso|no saturarme|no quemarme|sin estres|a mi ritmo/;

const HABITOS = [
  { re: /(movil|redes sociales|instagram|tiktok|pantallas?)/, y: /(pierdo|engancha|enganchado|demasiado|mucho tiempo|dejar|menos|vicio|scroll)/, titulo: 'Móvil fuera del dormitorio por la noche', emoji: '📵' },
  { re: /(constan|procrastin|lo dejo|me cuesta empezar|vago|pereza|lo abandono)/, titulo: 'Hacer al menos 10 minutos de mi objetivo', emoji: '✅' },
  { re: /(estres|ansiedad|agobi|rallar|saturo|quemad)/, titulo: '10 minutos para desconectar sin pantallas', emoji: '🌿' },
  { re: /(beber (mas )?agua|hidrat)/, titulo: 'Beber 2 L de agua', emoji: '💧' },
  { re: /(medit|mindfulness)/, titulo: 'Meditar 5 minutos', emoji: '🧘' },
  { re: /(dormir (mas|mejor)|duermo poco|insomnio|acostarme (antes|pronto))/, titulo: 'Acostarme a mi hora', emoji: '😴' },
  { re: /(andar|caminar|pasos)/, titulo: 'Caminar 30 minutos', emoji: '🚶' },
];

const FIJOS = [
  [/alquiler|piso/, 'vivienda', 'Alquiler'], [/hipoteca/, 'vivienda', 'Hipoteca'], [/\bluz\b/, 'facturas', 'Luz'], [/\bagua\b/, 'facturas', 'Agua'],
  [/internet|fibra/, 'facturas', 'Internet'], [/movil|telefono/, 'facturas', 'Móvil'], [/gimnasio|gym/, 'deporte', 'Gimnasio'],
  [/netflix/, 'suscripciones', 'Netflix'], [/spotify/, 'suscripciones', 'Spotify'], [/hbo|disney|prime|suscripcion/, 'suscripciones', 'Suscripciones'],
  [/coche|gasolina/, 'transporte', 'Coche'], [/abono|transporte|bus|metro/, 'transporte', 'Transporte'], [/seguro/, 'seguros', 'Seguro'],
  [/prestamo|credito|deuda/, 'deudas', 'Préstamo'], [/comida|super/, 'supermercado', 'Supermercado'],
];
const EMOJI_META = [[/viaje|vacaciones|japon|playa/, '✈️'], [/coche/, '🚗'], [/moto/, '🛵'], [/casa|piso|entrada/, '🏠'], [/ordenador|portatil|pc\b/, '💻'], [/emergencia|colchon|imprevistos/, '🛟'], [/boda/, '💍']];

const TURNO_RE = /\b(manana|tarde|noche)s?\b/g;
const TURNO_TXT = { manana: 'mañana', tarde: 'tarde', noche: 'noche' };
const TRABAJO_RE = /\b(trabaj\w*|turnos?|curr\w*|jornada|entro|salgo|empresa|oficina|fabrica|almacen|amazon|tienda)\b/;

// ---------- Principal ----------
/**
 * Interpreta lo que el usuario cuenta. ajustes = correcciones posteriores («el gimnasio mejor por la mañana»).
 * Devuelve { raw, turnos, supuestos, entendido }.
 */
export function interpretarTexto(textoOriginal, { hoy, ajustes = [] } = {}) {
  const original = [textoOriginal, ...ajustes].join('\n');
  const t = normalizar(original);
  const inicioAjustes = textoOriginal.length + 1;
  const supuestos = [], entendido = [];

  // --- Trabajo, turnos y compromisos fijos (cada rango de horas, según lo que tiene justo antes) ---
  const rs = rangos(t);
  const compromisos = [];
  let finAnterior = 0, anterior = null;
  for (const r of rs) {
    const finAnterior0 = finAnterior;
    const antes = t.slice(Math.max(finAnterior, r.pos - 90), r.pos);
    const despues = t.slice(r.finPos, r.finPos + 30);
    finAnterior = r.finPos;
    const turnosAntes = [...antes.matchAll(TURNO_RE)].filter(m => !/\b(empiezo|manana empiezo|pasado)\s*$/.test(antes.slice(0, m.index)));
    const turno = turnosAntes.length ? turnosAntes.at(-1)[1] : null;
    const actividad = antes.match(/\b(clase|clases|instituto|universidad|facultad|cole|colegio|academia|curso|guitarra|piano|futbol|baloncesto|gimnasio|natacion|ingles|catequesis|voluntariado|entreno|entrenamiento|cuido|recoger)\b[^,.]*$/);
    const libre = /\b(libre|tiempo para mi|tengo tiempo|disponible)\b[^,.]*$/.test(antes);
    const esTrabajo = TRABAJO_RE.test(antes) || (turno && /turno|rotativ/.test(t)) || /trabaj/.test(despues);
    const diasAntes = diasEn(antes.slice(-60));
    const dias = diasAntes.size ? diasAntes : diasEn(despues.split(/[.;,]/)[0]);
    const n = compromisos.length;
    if (libre) compromisos.push({ tipo: 'libre', ini: r.ini, fin: r.fin, dias });
    else if (actividad && !(turno && esTrabajo)) {
      // Las clases largas (instituto, universidad…) marcan el día igual que un trabajo.
      if (/^(clases?|instituto|universidad|facultad|cole|colegio)$/.test(actividad[1]) && r.fin - r.ini >= 180) compromisos.push({ tipo: 'trabajo', que: 'clase', turno: null, ini: r.ini, fin: r.fin, dias });
      else {
        const desde = Math.max(finAnterior0, r.pos - 90) + actividad.index;
        const titulo = original.slice(desde, desde + actividad[0].length).replace(/\s+(de|a las|desde|entre)\s*$/i, '').trim();
        compromisos.push({ tipo: 'actividad', titulo: mayuscula(titulo), ini: r.ini, fin: r.fin, dias });
      }
    } else if (esTrabajo || turno) compromisos.push({ tipo: 'trabajo', que: 'trabajo', turno: turno && /turno|rotativ|semana/.test(t) ? turno : null, ini: r.ini, fin: r.fin, dias });
    else if (anterior?.tipo === 'trabajo' && antes.trim().length < 45) compromisos.push({ ...anterior, ini: r.ini, fin: r.fin, dias: dias.size ? dias : anterior.dias });
    if (compromisos.length > n) anterior = compromisos.at(-1);
  }

  // Llevar y recoger a los niños: «los llevo al cole a las 9 y los recojo a las 16:30».
  for (const m of t.matchAll(new RegExp(String.raw`\b(llevo|dejo|recojo|recoger|llevar|dejar)\b[^.]{0,40}?\b(?:a las|sobre las|a la)\s+${H}`, 'g'))) {
    const zona = t.slice(Math.max(0, m.index - 60), m.index + m[0].length + 20);
    const min = aMinutos(m, 2);
    if (min == null || !/\b(cole|colegio|guarderia|ninos|nino|nina|ninas|hijos?|hijas?|peques|instituto)\b/.test(zona)) continue;
    const dias = diasEn(zona);
    compromisos.push({ tipo: 'actividad', titulo: /recog|recoj/.test(m[1]) ? 'Recoger a los niños' : 'Llevar a los niños', ini: min - 20, fin: min + 25, dias: dias.size ? dias : new Set([0, 1, 2, 3, 4]) });
  }

  // Días de trabajo: «trabajo de viernes a martes», «libro los miércoles y jueves».
  let diasTrabajo = null;
  const mTrab = t.match(new RegExp(String.raw`(?:trabaj\w*|curr\w*|turnos?)[^.]{0,40}?((?:de|del|desde)\s+${DIA}\s+(?:a|al|hasta)\s+(?:el\s+)?${DIA}|entre semana|de lunes a viernes|todos los dias|fines? de semana)`));
  if (mTrab) diasTrabajo = diasEn(mTrab[1]);
  const mLibro = t.match(new RegExp(String.raw`(?:libro|descanso|tengo libres?|mis dias libres son)\s+(?:los\s+)?(${DIA}(?:\s*(?:,|y)\s*(?:los\s+)?${DIA})*)`));
  if (mLibro) {
    const libres = diasEn(mLibro[1]);
    if (!diasTrabajo) diasTrabajo = new Set([0, 1, 2, 3, 4, 5, 6].filter(d => !libres.has(d)));
  }
  const trabajos = compromisos.filter(c => c.tipo === 'trabajo');
  if (trabajos.length && !diasTrabajo) {
    const union = new Set(trabajos.flatMap(c => [...c.dias]));
    diasTrabajo = union.size ? union : new Set([0, 1, 2, 3, 4]);
    if (!union.size) supuestos.push(`Que ${trabajos.every(c => c.que === 'clase') ? 'tienes clase' : 'trabajas'} de lunes a viernes.`);
  }
  for (const c of trabajos) if (!c.dias.size) c.dias = diasTrabajo;

  // Turnos rotativos.
  const tiposTurno = [...new Set(trabajos.map(c => c.turno).filter(Boolean))];
  const rotativo = tiposTurno.length >= 2 || (/rotativ|rotan|rotamos|altern|cambio de turno|a turnos/.test(t) && tiposTurno.length >= 1);
  let turnos = null;
  if (rotativo) {
    const horarios = {};
    for (const tipo of tiposTurno) { const c = trabajos.find(x => x.turno === tipo); horarios[tipo] = { ini: c.ini, fin: c.fin }; }
    const POR_DEFECTO = { manana: [360, 840], tarde: [840, 1320], noche: [1320, 1800] };
    for (const tipo of ['manana', 'tarde']) if (!horarios[tipo] && new RegExp(`\\b${tipo}s?\\b`).test(t) && Object.keys(horarios).length < 2) {
      horarios[tipo] = { ini: POR_DEFECTO[tipo][0], fin: POR_DEFECTO[tipo][1] };
      supuestos.push(`Que tu turno de ${TURNO_TXT[tipo]} es de ${toHHMM(POR_DEFECTO[tipo][0])} a ${toHHMM(POR_DEFECTO[tipo][1] % 1440)}.`);
    }
    // Semanas seguidas de cada turno: «dos semanas de tarde». «me queda una semana de mañana» dice dónde estás, no el ciclo.
    const semanas = {};
    for (const m of t.matchAll(new RegExp(String.raw`\b(${NUMS})\s+semanas?\s+(?:seguidas?\s+)?(?:de\s+|en\s+|con\s+)?(?:turno\s+de\s+|el\s+turno\s+de\s+)?(manana|tarde|noche)s?`, 'g'))) {
      if (/\bqueda\w*\s*$/.test(t.slice(Math.max(0, m.index - 12), m.index))) continue;
      semanas[m[2]] = Math.max(1, Math.round(numero(m[1])));
    }
    const queda = t.match(new RegExp(String.raw`queda\w*\s+\b(${NUMS})\s+semanas?\s+(?:mas\s+)?(?:de\s+)?(?:turno\s+de\s+)?(manana|tarde|noche)s?`));
    const tipos = Object.keys(horarios);
    const maxConocido = Math.max(0, ...Object.values(semanas));
    for (const tipo of tipos) if (!semanas[tipo]) {
      semanas[tipo] = queda?.[2] === tipo ? Math.max(1, Math.round(numero(queda[1]))) : maxConocido || 1;
      supuestos.push(semanas[tipo] === 1 ? `Que haces 1 semana de turno de ${TURNO_TXT[tipo]} y luego cambias.` : `Que haces ${semanas[tipo]} semanas seguidas de turno de ${TURNO_TXT[tipo]}.`);
    }
    const patron = tipos.flatMap(tipo => Array(semanas[tipo]).fill(tipo));
    // El ciclo empieza el primer día de trabajo («de viernes a martes» → viernes).
    const mInicio = t.match(new RegExp(String.raw`(?:trabaj\w*|turnos?)[^.]{0,40}?(?:de|del|desde)\s+${DIA}\s+(?:a|al|hasta)`));
    const inicioCiclo = mInicio ? diaIdx(mInicio[1]) : 0;
    const inicioDe = f => addDays(f, -((weekday(f) - inicioCiclo + 7) % 7));
    // ¿En qué turno está ahora?
    let tipoActual = null, fechaRef = hoy, posEnBloque = 0;
    let m;
    if ((m = t.match(/esta semana\s+(?:estoy|tengo|hago|voy|trabajo|me toca)?\s*(?:de|en|con|el)?\s*(?:turno\s+de\s+)?(manana|tarde|noche)/))) tipoActual = m[1];
    else if ((m = t.match(new RegExp(String.raw`\b(pasado manana|manana|la semana que viene|la proxima semana|el ${DIA})\s+(?:ya\s+)?(?:empiezo|entro|cambio|me toca|estoy|paso)\s*(?:a|al|de|por|en|con)?\s*(?:la\s+|el\s+)?(?:turno\s+de\s+)?(manana|tarde|noche)`)))) {
      const cuando = m[1];
      tipoActual = m[3];
      if (cuando === 'manana') fechaRef = addDays(hoy, 1);
      else if (cuando === 'pasado manana') fechaRef = addDays(hoy, 2);
      else if (/semana/.test(cuando)) fechaRef = addDays(hoy, 7);
      else { const d = diaIdx(m[2]); fechaRef = addDays(hoy, ((d - weekday(hoy) + 7) % 7) || 7); }
    } else if (queda) tipoActual = queda[2];
    if (queda && queda[2] === tipoActual) posEnBloque = Math.max(0, semanas[tipoActual] - Math.round(numero(queda[1])));
    if (!tipoActual || !patron.includes(tipoActual)) {
      tipoActual = patron[0];
      supuestos.push(`Que esta semana estás de turno de ${TURNO_TXT[tipoActual]}.`);
    }
    const idx = patron.indexOf(tipoActual) + Math.min(posEnBloque, semanas[tipoActual] - 1);
    const referencia = addDays(inicioDe(fechaRef), -7 * idx);
    turnos = { rotativo: true, inicioCiclo, patron, referencia, diasTrabajo: [...(diasTrabajo || [])].sort(), horarios: Object.fromEntries(Object.entries(horarios).map(([k, v]) => [k, { inicio: toHHMM(v.ini % 1440), fin: toHHMM(v.fin % 1440) }])) };
    entendido.push(`Trabajas a turnos rotativos: ${tipos.map(tp => `${semanas[tp]} ${semanas[tp] === 1 ? 'semana' : 'semanas'} de ${TURNO_TXT[tp]} (${toHHMM(horarios[tp].ini % 1440)}–${toHHMM(horarios[tp].fin % 1440)})`).join(', ')}.`);
  }
  if (rotativo && diasTrabajo) entendido.push(`Trabajas ${describirDias(diasTrabajo)}.`);
  else if (trabajos.length) entendido.push(`${describirHorarios(trabajos)}.`);
  for (const c of compromisos.filter(x => x.tipo === 'actividad')) entendido.push(`${c.titulo}: ${c.dias.size ? `${describirDias(c.dias)}, ` : ''}${c.fin - c.ini <= 50 ? `sobre las ${toHHMM(c.ini + 20)}` : `de ${toHHMM(c.ini)} a ${toHHMM(c.fin % 1440)}`}.`);

  // --- Trayecto, sueño y descanso ---
  let trayecto = null, m2;
  if ((m2 = t.match(new RegExp(String.raw`(?:tardo|tengo|son|hay|echo)\s+(?:unos?\s+|unas?\s+)?(${NUMS}|\d+)\s*(minutos|min|horas?|h)\b[^.]{0,25}?(?:en llegar|de camino|de trayecto|en ir|hasta el trabajo|al trabajo|en coche|en bus|en tren|de ida)`)))) trayecto = Math.round(numero(m2[1]) * (/^h/.test(m2[2]) ? 60 : 1));
  else if ((m2 = t.match(/(media hora|una hora|hora y media|un cuarto de hora)\s+(?:en llegar|de camino|de trayecto|en ir|hasta el trabajo|al trabajo)/))) trayecto = { 'media hora': 30, 'una hora': 60, 'hora y media': 90, 'un cuarto de hora': 15 }[m2[1]];
  else if (/(vivo|trabajo) (al lado|cerca|muy cerca)|teletrabaj|desde casa/.test(t)) trayecto = 10;
  if (trayecto == null && trabajos.length) { trayecto = 30; supuestos.push(`Que tardas unos 30 minutos en llegar ${trabajos.every(c => c.que === 'clase') ? 'a clase' : 'al trabajo'}.`); }
  else if (trayecto != null && trabajos.length) entendido.push(`Tardas unos ${trayecto} minutos en llegar.`);
  trayecto = trayecto || 0;

  const hasta = x => /\bhasta\b/.test(t.slice(x.pos, x.pos + 45));
  const acostarBruto = horaSuelta(t, 'me acuesto|me voy a (?:la cama|dormir)|duermo|me duermo|acostarme');
  const levantar = [...horaSuelta(t, 'me levanto|me despierto|despertarme|levantarme'), ...acostarBruto.filter(hasta)].sort((a, b) => a.pos - b.pos);
  const acostar = acostarBruto.filter(x => !hasta(x)).map(x => {
    let min = x.min;
    if (!x.sufijo && min >= 540 && min < 780) min += 720; // «a las 11» por la noche → 23:00; «a las 12» → 24:00
    else if (!x.sufijo && min < 360) min += 1440;          // «a la 1» → 01:00 del día siguiente
    return { ...x, min };
  });
  const turnoDeFrase = pos => t.slice(Math.max(0, pos - 45), pos + 10).match(/(?:turno de|estoy de|trabajo de|semana de|semanas de)\s+(manana|tarde|noche)/)?.[1] || null;
  const sueño = {};
  for (const x of levantar) sueño[turnoDeFrase(x.pos) || 'general'] = { ...sueño[turnoDeFrase(x.pos) || 'general'], levantar: x.min };
  for (const x of acostar) sueño[turnoDeFrase(x.pos) || 'general'] = { ...sueño[turnoDeFrase(x.pos) || 'general'], acostar: x.min };
  if (sueño.general?.levantar != null) entendido.push(`Te levantas sobre las ${toHHMM(sueño.general.levantar)}.`);
  if (sueño.general?.acostar != null) entendido.push(`Te acuestas sobre las ${toHHMM(sueño.general.acostar % 1440)}.`);

  const diasDescanso = new Set();
  for (const m of t.matchAll(new RegExp(String.raw`(?:los\s+)?${DIA}\s+(?:quiero\s+)?(?:descanso|descansar|libres? para mi|no hago nada|nada de nada|sin objetivos)|(?:descansar|no hacer nada)\s+los\s+${DIA}`, 'g'))) diasDescanso.add(diaIdx(m[1] || m[2]));
  if (diasDescanso.size) entendido.push(`Quieres descansar ${describirDias(diasDescanso)}.`);

  // --- Objetivos ---
  const segmentosDeseo = [];
  const marcas = [...t.matchAll(DESEO)].map(m => m.index);
  marcas.forEach((ini, i) => {
    let fin = Math.min(marcas[i + 1] ?? t.length, ini + 220);
    const corte = t.slice(ini, fin).search(/[.;!?\n]/);
    if (corte > 0) fin = ini + corte;
    segmentosDeseo.push([ini, fin]);
  });
  if (ajustes.length) segmentosDeseo.push([inicioAjustes, t.length]); // las correcciones siempre se leen como deseos

  const objetivos = [];
  let suaveGlobal = false;
  for (const [ini, fin] of segmentosDeseo) {
    const clausula = t.slice(ini, fin);
    if (/\btrabaj/.test(clausula) && !CATALOGO.some(c => c.re.test(clausula))) continue;
    if (SUAVE.test(clausula)) suaveGlobal = true;
    // Una cláusula puede tener varios objetivos: «aprender inglés, ir al gimnasio y leer más».
    let cortes = [ini, ...[...clausula.matchAll(/,|;|\n|\s+y\s+(?=\w+(?:ar|er|ir)(?:me|se|lo|la)?\b)|\s+e\s+(?=\w+(?:ar|er|ir)\b)|\s+ademas\s+|\s+tambien\s+/g)].map(m => ini + m.index), fin];
    // Si un trozo aún nombra dos objetivos distintos («cocinar y 2 horas de inglés»), se corta también por «y».
    cortes = cortes.flatMap((a, k) => {
      if (k === cortes.length - 1) return [a];
      const seg = t.slice(a, cortes[k + 1]);
      if (catalogoDe(seg).length < 2) return [a];
      return [a, ...[...seg.matchAll(/\s+(?:y|e|ademas|tambien)\s+/g)].map(m => a + m.index)];
    });
    let previo = null;
    for (let k = 0; k < cortes.length - 1; k++) {
      const a = cortes[k], b = cortes[k + 1];
      const seg = t.slice(a, b), segOrig = original.slice(a, b);
      const quitar = /\b(quita|quitar|elimina|borra|sin|no quiero|olvida|fuera)\b/.test(seg);
      const cat = catalogoDe(seg)[0] || null;
      let objetivo = null;
      if (cat) {
        objetivo = objetivos.find(o => o.clave === cat.clave);
        if (quitar) { if (objetivo) objetivos.splice(objetivos.indexOf(objetivo), 1); previo = null; continue; }
        if (!objetivo) {
          objetivo = { clave: cat.clave, titulo: cat.titulo(seg), area: cat.area, horasSemana: cat.horas, sesionMin: cat.sesion, momento: cat.momento || 'cualquiera', hobby: !!cat.hobby, tareas: [...cat.tareas], porque: '', fechaLimite: '', orden: objetivos.length };
          objetivos.push(objetivo);
        }
      } else {
        // Objetivo que no está en el catálogo: «aprender a cocinar paella», «sacarme el título de…».
        const verbo = seg.match(/\b(aprender|mejorar|empezar a|practicar|sacarme|sacar|hacer|terminar|acabar|montar|crear|ser mas|conseguir|preparar|buscar|dejar de)\b/);
        if (verbo && !/\b(ahorr|dinero|euros|€|movil|dormir|agua|medit)/.test(seg) && !quitar) {
          const desde = a + seg.indexOf(verbo[1]);
          const palabras = original.slice(desde, b).replace(/\s+(pero|porque|para que|para no|aunque|de una forma|de forma)\b.*$/i, '').trim().split(/\s+/).slice(0, 7).join(' ');
          const clave = normalizar(palabras);
          if (palabras.split(' ').length >= 2) {
            objetivo = objetivos.find(o => o.clave === clave);
            if (!objetivo) { objetivo = { clave, titulo: mayuscula(palabras.replace(/[,.;]+$/, '')), area: 'personal', horasSemana: 2, sesionMin: 45, momento: 'cualquiera', tareas: [], porque: '', fechaLimite: '', orden: objetivos.length }; objetivos.push(objetivo); }
          }
        }
        if (!objetivo && quitar) {
          const palabra = seg.match(/\b(?:quita|quitar|elimina|borra|sin|no quiero|olvida)\s+(?:el|la|los|las|lo de)?\s*(\w{4,})/)?.[1];
          const victima = palabra && objetivos.find(o => normalizar(o.titulo).includes(palabra));
          if (victima) objetivos.splice(objetivos.indexOf(victima), 1);
          continue;
        }
        if (!objetivo) objetivo = previo; // modificador suelto: «y mejor por la mañana»
      }
      if (!objetivo) continue;
      aplicarModificadores(objetivo, seg, hoy);
      const porque = segOrig.match(/\b(?:porque|para poder|para tener|para ser|para optar|para conseguir|para cambiar|para mejorar)\b[^,.;]*/i)?.[0];
      if (porque) objetivo.porque = mayuscula(porque.trim());
      previo = objetivo;
    }
  }
  if (suaveGlobal) for (const o of objetivos) if (!o.fijadoPorUsuario) { o.horasSemana = Math.min(o.horasSemana, 2); o.sesionMin = Math.min(o.sesionMin, 30); }
  objetivos.forEach((o, i) => { o.prioridad = o.prioridadUsuario || (i === 0 ? 3 : o.hobby ? 1 : 2); });
  if (objetivos.length) entendido.push(`Quieres: ${objetivos.map(o => `«${o.titulo}»`).join(', ')}${suaveGlobal ? ', poco a poco y sin agobiarte' : ''}.`);

  // --- Horas libres de cada día (por turno si rota) ---
  const sinTrabajo = !trabajos.length && /\b(no trabajo|en paro|desemplead\w*|sin trabajo|parad[oa]|busco trabajo|buscando (trabajo|empleo)|no estudio ni trabajo)\b/.test(t);
  if (sinTrabajo) entendido.push('Ahora mismo no trabajas: tienes bastante tiempo libre cada día.');
  const plantilla = tipo => [0, 1, 2, 3, 4, 5, 6].map(d => franjasLibres({ d, tipo, compromisos, trabajos, diasTrabajo, turnos, trayecto, sueño, diasDescanso, sinTrabajo }));
  let disponibilidadPorTurno = null, disponibilidad;
  if (turnos) {
    disponibilidadPorTurno = Object.fromEntries(Object.keys(turnos.horarios).map(tp => [tp, plantilla(tp)]));
    disponibilidad = disponibilidadPorTurno[turnos.patron[posicionEnPatron(turnos, hoy)]];
    turnos.disponibilidad = disponibilidadPorTurno;
  } else disponibilidad = plantilla(null);
  if (!trabajos.length && !compromisos.length && !sinTrabajo) supuestos.push('No me has contado tu horario de trabajo o clases: he usado un horario general (tardes y fines de semana). Si trabajas o estudias, dime de qué hora a qué hora y qué días.');
  if (!levantar.length && trabajos.length) supuestos.push('A qué hora te levantas y te acuestas: lo he calculado según tu horario.');

  // Ajusta las horas de los objetivos a lo que cabe (como mucho, el 60 % del tiempo libre de la semana más corta).
  const libresSemana = Math.min(...(disponibilidadPorTurno ? Object.values(disponibilidadPorTurno) : [disponibilidad]).map(minutosSemana));
  const totalObj = objetivos.reduce((a, o) => a + o.horasSemana * 60, 0);
  if (totalObj > libresSemana * 0.6 && totalObj > 0) {
    const f = (libresSemana * 0.6) / totalObj;
    for (const o of objetivos) o.horasSemana = Math.max(0.5, Math.round(o.horasSemana * f * 2) / 2);
    supuestos.push('He reducido las horas de tus objetivos para que quepan en tu tiempo libre sin agobiarte.');
  }

  // --- Hábitos ---
  const habitos = HABITOS.filter(h => h.re.test(t) && (!h.y || h.y.test(t))).slice(0, 3).map(({ titulo, emoji }) => ({ titulo, emoji }));
  if (!habitos.length) habitos.push({ titulo: 'Mirar mi plan del día', emoji: '🗓️' });

  // --- Dinero ---
  const { ingresos, gastosFijos, metasAhorro } = dinero(t, original, hoy);
  if (ingresos) entendido.push(`Cobras ${ingresos.nomina} € al mes${ingresos.diaCobro ? ` (el día ${ingresos.diaCobro})` : ''}.`);
  if (metasAhorro.length) entendido.push(`Quieres ahorrar para: ${metasAhorro.map(x => `${x.nombre} (${x.meta} €)`).join(', ')}.`);

  // --- Perfil ---
  const nombre = original.match(/\bme llamo\s+([A-Za-zÁÉÍÓÚÑáéíóúñ]+)/i)?.[1];
  const edad = t.match(/\btengo\s+(\d{1,2})\s+anos\b/)?.[1];
  const frases = original.split(/[.;!?\n]+/).map(s => s.trim()).filter(Boolean);
  const fraseTrabajo = frases.find(f => TRABAJO_RE.test(normalizar(f)) || /\bestudi/.test(normalizar(f)));
  // Frases cortas, aunque el texto venga sin puntos: desde la palabra clave hasta 8 palabras después.
  const corta = (s, n) => { const p = s.trim().split(/\s+/); return p.length > n ? `${p.slice(0, n).join(' ')}…` : p.join(' '); };
  const debilidades = [...original.matchAll(/\b(me cuesta|pierdo|no consigo|procrastin\w*|me agobi\w*|me rall\w*|me distraigo|me da pereza|soy vago|soy vaga)\b[^.;,\n]*/gi)].map(m => corta(m[0], 9));
  if (/para no (rallarme|agobiarme|saturarme|quemarme)/.test(t)) debilidades.push('Se satura si va demasiado deprisa');
  const perfil = {
    nombre: nombre ? mayuscula(nombre) : '',
    sobreMi: [edad ? `Tengo ${edad} años.` : '', fraseTrabajo ? corta(fraseTrabajo, 16) : ''].filter(Boolean).join(' '),
    rutina: describirRutina({ turnos, trabajos, diasTrabajo, trayecto, sueño }),
    debilidades: debilidades.map(mayuscula).join('. ').slice(0, 300),
    motivacion: objetivos.map(o => o.porque).filter(Boolean).join('. '),
  };

  const libresTxt = disponibilidadPorTurno
    ? Object.entries(disponibilidadPorTurno).map(([tp, d]) => `${Math.round(minutosSemana(d) / 60)} h libres las semanas de ${TURNO_TXT[tp]}`).join(' y ')
    : `${Math.round(minutosSemana(disponibilidad) / 60)} h libres a la semana`;
  const resumen = [
    `Tienes unas ${libresTxt}.`,
    objetivos.length ? `Te propongo ${objetivos.map(o => `${o.horasSemana} h/semana para «${o.titulo}»${o.sesionMin <= 30 ? ' en sesiones cortas de 30 min' : ''}`).join(', ')}.` : 'No he encontrado objetivos en tu texto: dime qué quieres conseguir (por ejemplo, «quiero aprender inglés»).',
    turnos ? 'Tu horario cambiará solo según el turno que te toque cada semana.' : '',
    suaveGlobal ? 'Lo he dejado suave, como pediste, para que vayas poco a poco sin agobiarte.' : '',
  ].filter(Boolean).join(' ');

  const raw = {
    resumen, perfil,
    disponibilidad: disponibilidad.flatMap((fr, dia) => fr.map(f => ({ dia, ...f }))),
    preferencias: { sesionMin: objetivos.length ? Math.min(...objetivos.map(o => o.sesionMin)) : 45, descansoMin: 10, maxHorasDia: suaveGlobal ? 1.5 : 2.5 },
    objetivos: objetivos.map(({ titulo, porque, area, prioridad, horasSemana, momento, sesionMin, fechaLimite, tareas }) => ({ titulo, porque, area, prioridad, horasSemana, momento, sesionMin, fechaLimite, tareas })),
    habitos, ingresos, gastosFijos, metasAhorro,
  };
  return { raw, turnos, supuestos, entendido };
}

const PASOS_GENERALES = ['Escribir qué significa para ti haberlo conseguido (algo que puedas medir)', 'Dividirlo en 3 pasos pequeños',
  'Hacer el primer paso hoy, en menos de 15 minutos', 'Reservar un hueco fijo en tu horario para avanzar'];

/** Primeros pasos para un objetivo (según su tipo), sin repetir las tareas que ya tiene. */
export function primerosPasos(titulo, yaTiene = []) {
  const cat = catalogoDe(normalizar(titulo))[0];
  const tiene = new Set(yaTiene.map(normalizar));
  const pasos = [...(cat?.tareas || []), ...PASOS_GENERALES].filter(p => !tiene.has(normalizar(p))).slice(0, 5);
  return {
    consejo: 'Empieza por algo tan pequeño que no puedas decir que no: 10–15 minutos hoy. La constancia gana a la intensidad, y cada vez que lo haces se vuelve más fácil.',
    pasos: pasos.map(p => ({ titulo: p, detalle: '' })),
  };
}

// Objetivos del catálogo que nombra un trozo de texto, del más específico al más general.
// «programar» ya es informática y «leer en inglés» es inglés: se quita el que sobra.
export function catalogoDe(seg) {
  let l = CATALOGO.filter(c => c.re.test(seg)).sort((x, y) => ORDEN_ESPECIFICO.indexOf(x.clave) - ORDEN_ESPECIFICO.indexOf(y.clave));
  if (l.some(c => ['programacion', 'ofimatica', 'redes'].includes(c.clave))) l = l.filter(c => c.clave !== 'informatica');
  if (l.length > 1 && /\bleer\b[^,.]{0,20}\b(ingles|frances|aleman|informatic|program)/.test(seg)) l = l.filter(c => c.clave !== 'leer');
  return l;
}

function aplicarModificadores(o, seg, hoy) {
  let m;
  if ((m = seg.match(new RegExp(String.raw`\b(${NUMS})\s+(?:veces|dias)\s+(?:a|por|cada|en|de)\s+(?:la\s+)?semana`)))) { o.horasSemana = numero(m[1]) * o.sesionMin / 60; o.fijadoPorUsuario = true; }
  if (/todos los dias|a diario|cada dia|diariamente/.test(seg)) { o.horasSemana = 7 * o.sesionMin / 60; o.fijadoPorUsuario = true; }
  if ((m = seg.match(new RegExp(String.raw`\b(${NUMS})\s+(?:horas?|h)\s+(?:a|por|cada|en|de)\s+(?:la\s+)?semana|\b(${NUMS})\s+horas?\s+semanales`)))) { o.horasSemana = numero(m[1] || m[2]); o.fijadoPorUsuario = true; }
  if ((m = seg.match(new RegExp(String.raw`\b(${NUMS})\s+(horas?|minutos|min)\s+(?:al|cada|por|de)\s+dia`)))) { o.horasSemana = numero(m[1]) * (/^h/.test(m[2]) ? 60 : 1) * 7 / 60; o.fijadoPorUsuario = true; }
  if ((m = seg.match(/sesiones de (\d+)\s*(?:minutos|min)|(\d+)\s*(?:minutos|min) (?:cada vez|por sesion|cada sesion)/))) o.sesionMin = Number(m[1] || m[2]);
  if (/\b(?:por|en)\s+las?\s+mananas?\b|\btemprano\b|al levantarme|a primera hora/.test(seg)) o.momento = 'manana';
  else if (/\b(?:por|en)\s+las?\s+tardes?\b/.test(seg)) o.momento = 'tarde';
  else if (/\b(?:por|en)\s+las?\s+noches?\b|antes de (?:dormir|acostarme)/.test(seg)) o.momento = 'noche';
  if (/lo mas importante|sobre todo|prioridad|lo primero/.test(seg)) o.prioridadUsuario = 3;
  const f = fechaLimite(seg, hoy);
  if (f) o.fechaLimite = f;
  o.horasSemana = Math.round(o.horasSemana * 2) / 2;
}

/**
 * Horas libres de los 7 días a partir de datos ya ordenados (los del cuestionario paso a paso).
 * trabajos: [{ ini, fin, dias: Set, turno? }] (fin > 1440 si acaba al día siguiente); levantar/acostar en minutos.
 * Con `tipos` (turnos rotativos) devuelve una plantilla por turno: { manana: [7 días], tarde: [...] }.
 */
export function calcularLibres({ trabajos = [], trayecto = 0, levantar = null, acostar = null, tipos = null, sinTrabajo = false }) {
  const sueño = { general: {} };
  if (levantar != null) sueño.general.levantar = levantar;
  if (acostar != null) sueño.general.acostar = acostar;
  const lista = trabajos.map(c => ({ tipo: 'trabajo', que: 'trabajo', turno: null, ...c }));
  const diasTrabajo = new Set(lista.flatMap(c => [...c.dias]));
  const plantilla = tipo => [0, 1, 2, 3, 4, 5, 6].map(d => franjasLibres({ d, tipo, compromisos: lista, trabajos: lista, diasTrabajo,
    turnos: tipos ? { rotativo: true } : null, trayecto, sueño, diasDescanso: new Set(), sinTrabajo }));
  return tipos ? Object.fromEntries(tipos.map(tp => [tp, plantilla(tp)])) : plantilla(null);
}

// Franjas libres de un día de la semana (d: 0 lunes … 6 domingo) para un turno concreto (o sin turnos).
function franjasLibres({ d, tipo, compromisos, trabajos, diasTrabajo, turnos, trayecto, sueño, diasDescanso, sinTrabajo }) {
  if (diasDescanso.has(d)) return [];
  const trabajosHoy = trabajos.filter(c => (turnos ? (c.turno ? c.turno === tipo : true) : true) && c.dias.has(d) && !(turnos && !c.turno && trabajos.some(x => x.turno)));
  const sinCompromisos = !trabajos.length && !compromisos.length;
  const s = { ...sueño.general, ...(tipo && sueño[tipo]) };
  // Sin horario ni horas de sueño: si no trabaja, mañanas y tardes; si no lo sabemos, tardes y algo más el fin de semana.
  if (sinCompromisos && s.levantar == null && s.acostar == null) {
    if (sinTrabajo) return [{ inicio: '10:00', fin: '13:30' }, { inicio: '16:00', fin: '20:00' }];
    return d < 5 ? [{ inicio: '18:00', fin: '21:00' }] : [{ inicio: '10:00', fin: '13:30' }, { inicio: '17:00', fin: '20:30' }];
  }

  const primero = trabajosHoy.length ? Math.min(...trabajosHoy.map(c => c.ini)) : null;
  const ultimo = trabajosHoy.length ? Math.max(...trabajosHoy.map(c => c.fin)) : null;
  let levantar = s.levantar ?? (primero != null && primero < 600 ? Math.floor((primero - trayecto - 50) / 5) * 5 : primero != null && primero < 840 ? 450 : primero != null && primero >= 1200 ? 840 : 540);
  // Si ayer hubo turno de noche, hoy se duerme hasta unas 7 h y media después de salir.
  const nocheAyer = trabajos.filter(c => c.fin > 1440 && c.dias.has((d + 6) % 7) && (!turnos || !c.turno || c.turno === tipo));
  if (nocheAyer.length) levantar = Math.max(levantar, Math.max(...nocheAyer.map(c => c.fin - 1440)) + trayecto + 450);
  let acostar = s.acostar ?? (ultimo != null && ultimo > 1260 ? Math.min(ultimo + trayecto + 90, 1500) : primero != null && primero < 480 ? 1350 : 1410);
  // Para el turno de mañana, levantarse antes de lo dicho «en general» no tiene sentido si entra antes.
  if (primero != null && levantar > primero - trayecto - 20) levantar = Math.max(0, primero - trayecto - 50);
  let libres = [[levantar + 45, Math.min(acostar - 30, 1440)]];
  const restar = (a, b) => { libres = libres.flatMap(([x, y]) => (b <= x || a >= y ? [[x, y]] : [...(a > x ? [[x, a]] : []), ...(b < y ? [[b, y]] : [])])); };
  for (const c of trabajosHoy) {
    restar(c.ini - trayecto - 15, c.fin + trayecto + (c.fin >= 810 && c.fin <= 990 ? 60 : 30));
    if (c.ini >= 720 && c.ini <= 960) restar(c.ini - trayecto - 60, c.ini - trayecto - 15); // comer antes de entrar
  }
  for (const c of compromisos.filter(x => x.tipo === 'actividad' && (x.dias.size ? x.dias.has(d) : true))) restar(c.ini - 15, c.fin + 15);
  // Comidas, si no coinciden con el trabajo.
  const trabajaA = min => trabajosHoy.some(c => min >= c.ini && min < c.fin);
  if (!trabajaA(14 * 60) && !trabajaA(15 * 60 - 1)) restar(14 * 60, 15 * 60);
  if (!trabajaA(21 * 60)) restar(21 * 60, 21 * 60 + 45);
  const explicitas = compromisos.filter(c => c.tipo === 'libre' && (!c.dias.size || c.dias.has(d)));
  if (explicitas.length) libres = explicitas.map(c => [c.ini, Math.min(c.fin, 1440)]);
  return libres.filter(([a, b]) => b - a >= 30).map(([a, b]) => ({ inicio: toHHMM(Math.ceil(a / 5) * 5), fin: toHHMM(Math.min(Math.floor(b / 5) * 5, 1439)) }))
    .filter(f => toMin(f.fin) - toMin(f.inicio) >= 30);
}

const minutosSemana = disp => disp.flat().reduce((a, f) => a + toMin(f.fin) - toMin(f.inicio), 0);

function dinero(t, original, hoy) {
  const IMPORTE = /(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,(\d{1,2}))?\s*(mil\b|k\b)?\s*(€|euros?\b|eur\b|pavos\b)?/g;
  let ingresos = null;
  const gastosFijos = [], metasAhorro = [];
  for (const m of t.matchAll(IMPORTE)) {
    const pre = t.slice(Math.max(0, m.index - 45), m.index), post = t.slice(m.index + m[0].length, m.index + m[0].length + 60);
    if (/[:h]$/.test(pre) || /^[:h]\d/.test(post) || /^\s*(anos|semanas?|veces|minutos|min\b|horas?|dias|km|kilos|de la (manana|tarde|noche)|personas)/.test(post)) continue;
    if (!m[4] && !m[3] && !/(cobro|gano|nomina|sueldo|salario|pago|pagar|ahorrar|alquiler|hipoteca|cuesta|gasto)\s*(?:de\s+|unos\s+|sobre\s+|alrededor de\s+)?$/.test(pre)) continue;
    let valor = Number(m[1].replace(/[.\s]/g, '')) + (m[2] ? Number(m[2]) / 100 : 0);
    if (m[3]) valor *= 1000;
    if (!valor) continue;
    // Se clasifica por la palabra que tiene justo al lado: «cobro 1.500», «pago 550 de alquiler», «ahorrar 2.000 para…».
    const pre20 = pre.slice(-20), post25 = post.slice(0, 25);
    if (/(ahorr|juntar|reunir)\w*\s*(?:unos?\s+|al menos\s+)?$/.test(pre.slice(-30)) || /ahorr/.test(pre20)) {
      const para = post.match(/^\s*(?:€|euros?)?\s*para\s+(?:un|una|el|la|mi|mis|irme de|irme a|ir a|ir de)?\s*([^,.;\n]{3,40}?)(?=\s+(?:en|antes|para|dentro|que|y|el|la)\b|[,.;\n]|$)/);
      const inicio = para ? m.index + m[0].length + post.indexOf(para[1]) : -1;
      const nombre = para ? mayuscula(original.slice(inicio, inicio + para[1].length).trim()) : 'Mi meta de ahorro';
      const emoji = EMOJI_META.find(([re]) => re.test(para?.[1] || ''))?.[1] || '🐷';
      metasAhorro.push({ nombre, emoji, meta: Math.round(valor), fechaLimite: fechaLimite(post.slice(0, 60), hoy), prioridad: 2 });
    } else if (/(cobro|gano|nomina|sueldo|salario|me pagan|ingreso)\w*\s*(?:unos?\s+|sobre\s+|alrededor de\s+|de\s+)?$/.test(pre20) || /^\s*(?:€|euros?)?\s*(?:netos?\s+)?(?:de\s+)?(nomina|sueldo|salario)/.test(post25)) {
      const anual = /(al ano|anual|brutos)/.test(post25);
      const dia = t.match(/(?:cobro|me pagan|ingresan)(?:[^.]|\.(?=\d)){0,40}?(?:el dia|los dias|el)\s+(\d{1,2})\b/)?.[1] || (/(a final(es)? de mes)/.test(t) ? 28 : 1);
      ingresos = { nomina: Math.round(anual ? valor / 12 : valor), diaCobro: Math.min(31, Number(dia)), extras: 0 };
    } else {
      const cat = FIJOS.find(([re]) => re.test(post.slice(0, 30)) || re.test(pre20));
      if (cat && /(pago|pagar|cuesta|gasto|alquiler|hipoteca|cuota|al mes|mensual)/.test(pre20 + ' ' + post25)) gastosFijos.push({ nombre: cat[2], importe: valor, categoria: cat[1], dia: cat[1] === 'vivienda' ? 1 : null });
    }
  }
  return { ingresos, gastosFijos, metasAhorro };
}

function describirDias(set) {
  const l = [...set].sort((a, b) => a - b);
  const NOM = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  if (l.length === 7) return 'todos los días';
  if (l.join() === '0,1,2,3,4') return 'de lunes a viernes';
  // Rango consecutivo, aunque dé la vuelta a la semana (viernes → martes).
  for (let i = 0; i < 7; i++) {
    const r = Array.from({ length: l.length }, (_, k) => (i + k) % 7);
    if (r.every(x => set.has(x)) && l.length > 2) return `de ${NOM[r[0]]} a ${NOM[r.at(-1)]}`;
  }
  return `los ${l.map(x => NOM[x]).join(', ').replace(/, ([^,]*)$/, ' y $1')}`;
}

// «Trabajas de lunes a sábado de 10:00 a 14:00 y de 17:00 a 21:00», «Tienes clase…», con varios horarios por días.
function describirHorarios(trabajos, persona = 'segunda') {
  const grupos = new Map();
  for (const c of trabajos) {
    const k = `${c.que || 'trabajo'}|${[...c.dias].sort().join()}`;
    if (!grupos.has(k)) grupos.set(k, { que: c.que || 'trabajo', dias: c.dias, rangos: [] });
    grupos.get(k).rangos.push(`de ${toHHMM(c.ini % 1440)} a ${toHHMM(c.fin % 1440)}`);
  }
  const partes = [...grupos.values()].map(g => `${describirDias(g.dias)} ${g.rangos.join(' y ')}`);
  const lista = partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}` : partes[0];
  const clase = [...grupos.values()].every(g => g.que === 'clase');
  const verbo = persona === 'segunda' ? (clase ? 'Tienes clase' : 'Trabajas') : (clase ? 'Tiene clase' : 'Trabaja');
  return `${verbo} ${lista}`;
}

function describirRutina({ turnos, trabajos, diasTrabajo, trayecto, sueño }) {
  const p = [];
  if (turnos) p.push(`Trabaja a turnos rotativos (${Object.entries(turnos.horarios).map(([k, v]) => `${TURNO_TXT[k]} ${v.inicio}–${v.fin}`).join(', ')}), ${describirDias(diasTrabajo || new Set())}.`);
  else if (trabajos.length) p.push(`${describirHorarios(trabajos, 'tercera')}.`);
  if (trabajos.length && trayecto) p.push(`Tarda unos ${trayecto} min en llegar.`);
  if (sueño.general?.levantar != null) p.push(`Se levanta sobre las ${toHHMM(sueño.general.levantar)}.`);
  if (sueño.general?.acostar != null) p.push(`Se acuesta sobre las ${toHHMM(sueño.general.acostar % 1440)}.`);
  return p.join(' ');
}

// ---------- Turnos rotativos ----------
/** Posición en el patrón (0…n-1) del ciclo que contiene `fecha`. */
export function posicionEnPatron(turnos, fecha) {
  const n = turnos.patron.length;
  const ciclos = Math.floor(diasEntre(turnos.referencia, fecha) / 7);
  return ((ciclos % n) + n) % n;
}
export const tipoTurno = (turnos, fecha) => turnos.patron[posicionEnPatron(turnos, fecha)];

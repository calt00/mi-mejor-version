// Cliente de Gemini, contexto personal del coach y acciones propuestas.
import { db, kvGet } from './db.js';
import { getSettings, getProfile, getDisponibilidad, getPrefs, getIngresos, areaNombre, CATEGORIAS, catNombre } from './datos.js';
import { hoyISO, addDays, weekDates, fmtFecha, DIAS, weekday, uid, toMin, fmtEur, nowMin, toHHMM } from './util.js';
import { resumenMes, estadoMeta } from './finanzas.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

export class ErrorIA extends Error {}

function traducirError(status, msg = '') {
  if (/api key not valid|API_KEY_INVALID/i.test(msg)) return 'La API key no es válida. Revísala en Perfil → Ajustes.';
  if (status === 429) return 'Has llegado al límite gratuito de Gemini por ahora. Espera un rato y vuelve a intentarlo.';
  if (status === 404) return 'El modelo configurado no existe. Cámbialo en Perfil → Ajustes (por ejemplo, «gemini-flash-latest»).';
  if (status === 403) return 'Gemini ha rechazado la petición (permiso denegado). Revisa tu API key.';
  if (status >= 500) return 'Gemini no está disponible ahora mismo. Inténtalo en un momento.';
  return `Error de Gemini (${status}). ${msg}`.trim();
}

export async function iaDisponible() {
  const s = await getSettings();
  return Boolean(s.apiKey) && navigator.onLine;
}

async function llamar(metodo, body, signal) {
  const s = await getSettings();
  if (!s.apiKey) throw new ErrorIA('Falta tu API key de Gemini. Añádela en Perfil → Ajustes.');
  if (!navigator.onLine) throw new ErrorIA('Sin conexión. El coach necesita internet.');
  let res;
  try {
    res = await fetch(`${BASE}${encodeURIComponent(s.modelo || 'gemini-flash-latest')}:${metodo}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.apiKey },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ErrorIA('No se pudo conectar con Gemini. Revisa tu conexión.');
  }
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.json()).error?.message || ''; } catch { /* sin cuerpo */ }
    throw new ErrorIA(traducirError(res.status, msg));
  }
  return res;
}

const textoDe = data => (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');

export async function generarTexto(prompt, { system, temperatura = 0.8 } = {}) {
  const res = await llamar('generateContent', {
    systemInstruction: { parts: [{ text: system || await instruccionesBase() }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: temperatura },
  });
  return textoDe(await res.json()).trim();
}

export async function generarJSON(prompt, schema, { system, temperatura = 0.6 } = {}) {
  const res = await llamar('generateContent', {
    systemInstruction: { parts: [{ text: system || await instruccionesBase() }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: temperatura, responseMimeType: 'application/json', responseSchema: schema },
  });
  const txt = textoDe(await res.json());
  try { return JSON.parse(txt); } catch { throw new ErrorIA('La IA devolvió una respuesta que no se pudo leer. Inténtalo de nuevo.'); }
}

// ---------- Contexto personal ----------
async function instruccionesBase() {
  const p = await getProfile();
  const ahora = new Date();
  return `Eres el coach personal de ${p.nombre || 'el usuario'} dentro de su app «Mi Mejor Versión», que le ayuda a cumplir objetivos, organizar su tiempo y ahorrar.
Hablas en español de España. Tono: ${p.tono || 'cercano, directo y motivador'}.
Hoy es ${fmtFecha(hoyISO())} y son las ${toHHMM(nowMin())} (${Intl.DateTimeFormat().resolvedOptions().timeZone}). Año ${ahora.getFullYear()}.

Sobre ${p.nombre || 'el usuario'}:
- Quién es: ${p.sobreMi || '(sin rellenar)'}
- Rutina: ${p.rutina || '(sin rellenar)'}
- Puntos fuertes: ${p.fortalezas || '(sin rellenar)'}
- Puntos débiles: ${p.debilidades || '(sin rellenar)'}
- Qué le motiva: ${p.motivacion || '(sin rellenar)'}`;
}

export async function contextoCompleto() {
  const hoy = hoyISO();
  const [goals, tasks, blocks, habits, savingsGoals, contributions, expenses, fixed, ingresos, disp, prefs] = await Promise.all([
    db.all('goals'), db.all('tasks'), db.all('blocks'), db.all('habits'), db.all('savingsGoals'),
    db.all('contributions'), db.all('expenses'), db.all('fixedExpenses'), getIngresos(), getDisponibilidad(), getPrefs(),
  ]);
  const semana = new Set(weekDates(hoy));
  const activos = goals.filter(g => !g.archivado);
  const lineaGoal = g => {
    const ts = tasks.filter(t => t.goalId === g.id);
    const hechoMin = blocks.filter(b => b.goalId === g.id && b.hecho && semana.has(b.fecha)).reduce((a, b) => a + toMin(b.fin) - toMin(b.inicio), 0);
    return `- «${g.titulo}» (${areaNombre(g.area)}, prioridad ${g.prioridad}/3, ${g.horasSemana || 0} h/semana, hechas esta semana ${(hechoMin / 60).toFixed(1)} h${g.fechaLimite ? `, fecha límite ${g.fechaLimite}` : ''}). Por qué: ${g.porque || '—'}. Tareas: ${ts.length ? ts.map(t => `${t.hecho ? '✓' : '○'} ${t.titulo}`).join('; ') : 'ninguna'}`;
  };
  const lineaBloque = b => `  · [id ${b.id}] ${b.fecha} ${b.inicio}-${b.fin} ${b.titulo}${b.hecho ? ' (hecho)' : ''}${b.fijado ? ' (fijado)' : ''}`;
  const proximos = blocks.filter(b => b.fecha >= hoy && b.fecha <= addDays(hoy, 7)).sort((a, b) => (a.fecha + a.inicio).localeCompare(b.fecha + b.inicio));
  const r = resumenMes({ hoy, ingresos, fixed, expenses, contributions }, hoy.slice(0, 7));
  const racha = h => { let n = 0, d = hoy; if (!h.registros.includes(d)) d = addDays(d, -1); while (h.registros.includes(d)) { n++; d = addDays(d, -1); } return n; };

  return `${await instruccionesBase()}

OBJETIVOS ACTIVOS:
${activos.length ? activos.map(lineaGoal).join('\n') : '(ninguno todavía)'}

HORARIO (hoy y próximos 7 días):
${proximos.length ? proximos.map(lineaBloque).join('\n') : '(vacío)'}

DISPONIBILIDAD HABITUAL: ${disp.map((fr, i) => `${DIAS[i]} ${fr.map(f => `${f.inicio}-${f.fin}`).join(', ') || 'nada'}`).join(' | ')}
PREFERENCIAS: sesiones de ${prefs.sesionMin} min, descansos de ${prefs.descansoMin} min, máx. ${prefs.maxHorasDia} h/día.

HÁBITOS: ${habits.length ? habits.map(h => `${h.emoji || ''} ${h.titulo} (racha ${racha(h)} días${h.registros.includes(hoy) ? ', hecho hoy' : ''})`).join('; ') : '(ninguno)'}

AHORRO (mes actual): ingresos ${fmtEur(r.ingresos)}, fijos ${fmtEur(r.fijos)}, variables ${fmtEur(r.variables)}, aportado a metas ${fmtEur(r.aportado)}, disponible ${fmtEur(r.disponible)} para ${r.diasRestantes} días.
Metas de ahorro: ${savingsGoals.length ? savingsGoals.map(m => { const e = estadoMeta(m, contributions, hoy); return `«${m.nombre}» ${fmtEur(e.ahorrado, true)}/${fmtEur(m.meta, true)} (${e.estado})`; }).join('; ') : '(ninguna)'}

CÓMO RESPONDER:
- Sé concreto y accionable: pasos pequeños, por dónde empezar exactamente, cuánto tiempo.
- Respuestas breves (unas 150 palabras salvo que pida detalle). Usa listas cortas cuando ayuden.
- Usa los datos de arriba; no inventes objetivos, bloques ni cifras que no estén.
- Cuando convenga crear o cambiar algo (objetivo, tarea, bloque, hábito, gasto, aportación), usa las funciones disponibles; el usuario confirmará antes de aplicarlo. Explica en una frase lo que propones.
- Si pide un horario completo para uno o varios días, propón los bloques con crear_bloque respetando lo que ya está fijado.`;
}

// ---------- Acciones (function calling) ----------
const S = (description, extra = {}) => ({ type: 'STRING', description, ...extra });
const N = description => ({ type: 'NUMBER', description });
const ENUM = (description, values) => ({ type: 'STRING', format: 'enum', enum: values, description });

const HERRAMIENTAS = [{
  functionDeclarations: [
    { name: 'crear_objetivo', description: 'Crea un objetivo nuevo.', parameters: { type: 'OBJECT', properties: {
      titulo: S('Título corto'), porque: S('Por qué es importante'), area: ENUM('Área', ['salud', 'estudio', 'trabajo', 'finanzas', 'personal', 'relaciones', 'ocio', 'hogar']),
      horasSemana: N('Horas por semana a dedicarle'), prioridad: { type: 'INTEGER', description: '1 baja, 2 media, 3 alta' }, fechaLimite: S('YYYY-MM-DD, opcional') },
      required: ['titulo', 'area', 'horasSemana', 'prioridad'] } },
    { name: 'crear_tarea', description: 'Añade una tarea/paso a un objetivo existente.', parameters: { type: 'OBJECT', properties: {
      objetivo: S('Título exacto del objetivo existente'), titulo: S('Tarea concreta') }, required: ['objetivo', 'titulo'] } },
    { name: 'crear_bloque', description: 'Añade un bloque al horario.', parameters: { type: 'OBJECT', properties: {
      fecha: S('YYYY-MM-DD'), inicio: S('HH:MM'), fin: S('HH:MM'), titulo: S('Qué hacer'), objetivo: S('Título del objetivo relacionado, opcional') },
      required: ['fecha', 'inicio', 'fin', 'titulo'] } },
    { name: 'mover_bloque', description: 'Cambia la fecha u hora de un bloque existente.', parameters: { type: 'OBJECT', properties: {
      bloqueId: S('id del bloque'), fecha: S('YYYY-MM-DD'), inicio: S('HH:MM'), fin: S('HH:MM') }, required: ['bloqueId', 'fecha', 'inicio', 'fin'] } },
    { name: 'anadir_habito', description: 'Crea un hábito diario.', parameters: { type: 'OBJECT', properties: {
      titulo: S('Hábito'), emoji: S('Un emoji') }, required: ['titulo'] } },
    { name: 'registrar_gasto', description: 'Apunta un gasto del día a día.', parameters: { type: 'OBJECT', properties: {
      importe: N('Euros'), categoria: ENUM('Categoría', Object.keys(CATEGORIAS)), nota: S('Concepto'), fecha: S('YYYY-MM-DD, por defecto hoy') },
      required: ['importe', 'categoria'] } },
    { name: 'aportar_ahorro', description: 'Registra una aportación a una meta de ahorro.', parameters: { type: 'OBJECT', properties: {
      meta: S('Nombre exacto de la meta de ahorro'), importe: N('Euros (negativo para retirar)') }, required: ['meta', 'importe'] } },
  ],
}];

export function describirAccion(a) {
  const x = a.args || {};
  switch (a.name) {
    case 'crear_objetivo': return `🎯 Crear objetivo «${x.titulo}» · ${x.horasSemana} h/semana · prioridad ${x.prioridad}`;
    case 'crear_tarea': return `✅ Añadir tarea «${x.titulo}» a «${x.objetivo}»`;
    case 'crear_bloque': return `📅 Bloque ${x.fecha ? fmtFecha(x.fecha, { weekday: 'short', day: 'numeric', month: 'short' }) : ''} ${x.inicio}–${x.fin}: ${x.titulo}`;
    case 'mover_bloque': return `↔️ Mover bloque a ${x.fecha} ${x.inicio}–${x.fin}`;
    case 'anadir_habito': return `🔁 Nuevo hábito: ${x.emoji || ''} ${x.titulo}`;
    case 'registrar_gasto': return `💸 Gasto de ${fmtEur(x.importe)} en ${catNombre(x.categoria)}${x.nota ? ` (${x.nota})` : ''}`;
    case 'aportar_ahorro': return `🐷 ${x.importe >= 0 ? 'Aportar' : 'Retirar'} ${fmtEur(Math.abs(x.importe))} ${x.importe >= 0 ? 'a' : 'de'} «${x.meta}»`;
    default: return a.name;
  }
}

const buscarPorTitulo = (lista, campo, t) => lista.find(o => o[campo]?.toLowerCase() === String(t || '').toLowerCase())
  || lista.find(o => o[campo]?.toLowerCase().includes(String(t || '').toLowerCase()));

export async function aplicarAccion(a) {
  const x = a.args || {};
  const hoy = hoyISO();
  switch (a.name) {
    case 'crear_objetivo':
      await db.put('goals', { id: uid(), titulo: x.titulo, porque: x.porque || '', area: x.area || 'personal', horasSemana: Number(x.horasSemana) || 0,
        prioridad: Number(x.prioridad) || 2, fechaLimite: x.fechaLimite || '', momento: 'cualquiera', sesionMin: null, creado: hoy, archivado: false });
      return;
    case 'crear_tarea': {
      const g = buscarPorTitulo(await db.all('goals'), 'titulo', x.objetivo);
      if (!g) throw new Error(`No encuentro el objetivo «${x.objetivo}».`);
      await db.put('tasks', { id: uid(), goalId: g.id, titulo: x.titulo, hecho: false, creado: Date.now() });
      return;
    }
    case 'crear_bloque': {
      if (toMin(x.fin) <= toMin(x.inicio)) throw new Error('La hora de fin debe ser posterior al inicio.');
      const g = x.objetivo ? buscarPorTitulo(await db.all('goals'), 'titulo', x.objetivo) : null;
      await db.put('blocks', { id: uid(), fecha: x.fecha, inicio: x.inicio, fin: x.fin, titulo: x.titulo, goalId: g?.id || null,
        fijado: true, hecho: false, importante: Number(g?.prioridad) === 3, frase: '', origen: 'ia' });
      return;
    }
    case 'mover_bloque': {
      const b = await db.get('blocks', x.bloqueId);
      if (!b) throw new Error('Ese bloque ya no existe.');
      await db.put('blocks', { ...b, fecha: x.fecha, inicio: x.inicio, fin: x.fin, fijado: true });
      return;
    }
    case 'anadir_habito':
      await db.put('habits', { id: uid(), titulo: x.titulo, emoji: x.emoji || '✨', registros: [] });
      return;
    case 'registrar_gasto':
      await db.put('expenses', { id: uid(), importe: Math.abs(Number(x.importe)) || 0, categoria: CATEGORIAS[x.categoria] ? x.categoria : 'otros', nota: x.nota || '', fecha: x.fecha || hoy });
      return;
    case 'aportar_ahorro': {
      const m = buscarPorTitulo(await db.all('savingsGoals'), 'nombre', x.meta);
      if (!m) throw new Error(`No encuentro la meta «${x.meta}».`);
      await db.put('contributions', { id: uid(), goalId: m.id, importe: Number(x.importe) || 0, fecha: hoy, nota: 'Desde el coach' });
      return;
    }
    default: throw new Error('Acción desconocida.');
  }
}

// ---------- Chat en streaming ----------
const ESTADO_TXT = { aplicada: 'aplicada', descartada: 'descartada', pendiente: 'pendiente de confirmar', error: 'falló' };

export async function chatStream(mensajes, { onTexto, signal }) {
  let hist = mensajes.slice(-30).map(m => ({
    role: m.rol === 'user' ? 'user' : 'model',
    parts: [{ text: (m.texto || '') + (m.acciones?.length ? `\n[Acciones propuestas: ${m.acciones.map(a => `${describirAccion(a)} (${ESTADO_TXT[a.estado] || a.estado})`).join('; ')}]` : '') || '…' }],
  }));
  while (hist.length && hist[0].role !== 'user') hist.shift();

  const res = await llamar('streamGenerateContent?alt=sse', {
    systemInstruction: { parts: [{ text: await contextoCompleto() }] },
    contents: hist,
    tools: HERRAMIENTAS,
    generationConfig: { temperature: 0.8 },
  }, signal);

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buffer = '', texto = '';
  const acciones = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const linea = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (!linea.startsWith('data:')) continue;
      let data;
      try { data = JSON.parse(linea.slice(5)); } catch { continue; }
      for (const p of data.candidates?.[0]?.content?.parts || []) {
        if (p.text && !p.thought) { texto += p.text; onTexto?.(texto); }
        if (p.functionCall) acciones.push({ id: uid(), name: p.functionCall.name, args: p.functionCall.args || {}, estado: 'pendiente' });
      }
    }
  }
  return { texto: texto.trim(), acciones };
}

// ---------- Funciones específicas ----------
export async function comoEmpiezo(goal, tareas) {
  const sys = await contextoCompleto();
  return generarJSON(
    `Quiero empezar con mi objetivo «${goal.titulo}» (${goal.porque || 'sin motivo indicado'}). Tareas que ya tengo: ${tareas.map(t => t.titulo).join('; ') || 'ninguna'}.
Dame un consejo breve y cercano sobre cómo arrancar (2-4 frases) y entre 4 y 7 primeros pasos muy concretos, ordenados, pequeños y realizables (el primero debe poder hacerse hoy en menos de 15 minutos). No repitas tareas que ya tengo.`,
    { type: 'OBJECT', properties: {
      consejo: { type: 'STRING' },
      pasos: { type: 'ARRAY', items: { type: 'OBJECT', properties: { titulo: { type: 'STRING' }, detalle: { type: 'STRING' } }, required: ['titulo', 'detalle'] } },
    }, required: ['consejo', 'pasos'] },
    { system: sys });
}

export async function horarioPorPeticion(peticion, fijos) {
  const hoy = hoyISO();
  const dias = Array.from({ length: 14 }, (_, i) => addDays(hoy, i)).map(f => `${f} (${DIAS[weekday(f)]})`).join(', ');
  const sys = await contextoCompleto();
  return generarJSON(
    `PETICIÓN DE HORARIO: «${peticion}»

Fechas posibles: ${dias}.
Bloques FIJADOS que NO se pueden mover ni solapar:
${fijos.length ? fijos.map(b => `- ${b.fecha} ${b.inicio}-${b.fin} ${b.titulo}`).join('\n') : '(ninguno)'}

Instrucciones:
- Devuelve SOLO los días afectados por la petición. Para cada día que devuelvas, da el plan COMPLETO de ese día (sus bloques no fijados actuales se sustituirán por los tuyos).
- No incluyas los bloques fijados en tu respuesta. Nada de solapes. Horas en formato HH:MM (24 h).
- Respeta la disponibilidad habitual salvo que la petición diga otra cosa. Añade descansos entre bloques.
- Usa el título exacto del objetivo en «objetivo» cuando el bloque pertenezca a uno; si no, déjalo vacío.
- «importante» = true solo para lo más prioritario del día (será una alarma sonora).
- En «resumen», explica en 1-3 frases cómo lo has organizado.`,
    { type: 'OBJECT', properties: {
      resumen: { type: 'STRING' },
      bloques: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
        fecha: { type: 'STRING' }, inicio: { type: 'STRING' }, fin: { type: 'STRING' }, titulo: { type: 'STRING' },
        objetivo: { type: 'STRING' }, importante: { type: 'BOOLEAN' } }, required: ['fecha', 'inicio', 'fin', 'titulo'] } },
    }, required: ['resumen', 'bloques'] },
    { system: sys, temperatura: 0.4 });
}

export async function frasesParaBloques(bloques) {
  if (!bloques.length) return [];
  const r = await generarJSON(
    `Escribe una frase motivadora corta (máx. 14 palabras), original y personalizada para cada uno de estos bloques de mi horario, en el mismo orden. Que suenen a ti hablándome, variadas, sin comillas ni emojis:
${bloques.map((b, i) => `${i + 1}. ${b.fecha} ${b.inicio} — ${b.titulo}`).join('\n')}`,
    { type: 'OBJECT', properties: { frases: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['frases'] },
    { temperatura: 1 });
  return r.frases || [];
}

export async function consejoDelDia() {
  return generarTexto('Dame el consejo del día: 2-3 frases cercanas y concretas basadas en mi horario de hoy, mis objetivos y mi ahorro. Termina con una acción para empezar ya. Sin saludos ni títulos.',
    { system: await contextoCompleto(), temperatura: 0.9 });
}

export async function analizarFinanzas(resumen) {
  return generarJSON(
    `Analiza mis finanzas y dime cómo ahorrar más. Datos agregados (euros):
${JSON.stringify(resumen, null, 1)}

Da un diagnóstico breve y cercano (3-5 frases) y entre 3 y 5 acciones concretas y realistas para ahorrar más, con el ahorro mensual estimado de cada una en euros. Prioriza lo que más impacto tenga según mis datos reales.`,
    { type: 'OBJECT', properties: {
      diagnostico: { type: 'STRING' },
      acciones: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
        titulo: { type: 'STRING' }, detalle: { type: 'STRING' }, ahorroMensual: { type: 'NUMBER' } }, required: ['titulo', 'detalle', 'ahorroMensual'] } },
    }, required: ['diagnostico', 'acciones'] },
    { system: await instruccionesBase(), temperatura: 0.5 });
}

export async function probarConexion() {
  return generarTexto('Responde solo: «¡Conectado! Listo para ayudarte.»', { system: 'Eres un asistente.', temperatura: 0 });
}

export const ultimoConsejo = () => kvGet('consejoDia', null);

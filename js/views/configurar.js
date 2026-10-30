// Cuestionario paso a paso (sin escribir textos): trabajo, descanso, objetivos y resumen de la semana.
// Se usa en la bienvenida y, después, desde Horario y Perfil para cambiar las respuestas.
import { db, kvGet, kvSet } from '../db.js';
import { getPrefs, savePrefs, getSettings, saveDisponibilidad, saveTurnos, dispPorFecha } from '../datos.js';
import { esc, sheet, toast, refrescar, hoyISO, addDays, weekStart, weekDates, weekday, fmtHoras, DIAS, DIAS_CORTO } from '../util.js';
import { TIPOS_TURNO, estadoDesde, objetivoVacio, tiposActivos, libresDe, minutosLibresPorDia, sesionDe, encaje, maxHorasDiaDe, objetivosDe } from '../configuracion.js';
import { tipoTurno } from '../interprete.js';
import { generarSemana, ordenarBloques } from '../scheduler.js';
import { asignarFrases } from '../iphone.js';

const PASOS = [['trabajo', 'Trabajo'], ['descanso', 'Descanso'], ['objetivos', 'Objetivos'], ['resumen', 'Resumen']];
const SUGERENCIAS = ['Aprender inglés', 'Ir al gimnasio', 'Leer más', 'Informática', 'Estudiar', 'Correr', 'Cocinar', 'Programar'];
const MOMENTOS_CORTOS = [['cualquiera', 'Me da igual'], ['manana', 'Mañana'], ['tarde', 'Tarde'], ['noche', 'Noche']];
const TRAYECTOS = [0, 10, 15, 30, 45, 60, 90];
const TURNO_TXT = Object.fromEntries(TIPOS_TURNO);

const leer = (o, ruta) => ruta.split('.').reduce((x, k) => x?.[k], o);
function escribir(o, ruta, valor) {
  const ks = ruta.split('.');
  ks.slice(0, -1).reduce((x, k) => x[k], o)[ks.at(-1)] = valor;
}
const horasTxt = h => `${String(h).replace('.', ',')} h`;

/** Abre el cuestionario en una ventana (para cambiar las respuestas después de la bienvenida). */
export async function abrirConfigurador() {
  const { el, close } = sheet('📝 Tu plan', '<div id="cfg"></div>');
  await montarConfigurador(el.querySelector('#cfg'), {
    alTerminar: () => { close(); if (location.hash !== '#horario') location.hash = '#horario'; else refrescar(); },
  });
}

/**
 * Monta el cuestionario dentro de `cont`.
 * alTerminar(): tras crear el horario. alVolver(): «Atrás» en el primer paso (si no se da, no aparece).
 */
export async function montarConfigurador(cont, { alTerminar, alVolver } = {}) {
  const [guardado, goals] = await Promise.all([kvGet('configuracion'), db.all('goals')]);
  const e = estadoDesde(guardado, goals);
  if (!e.objetivos.length) e.objetivos.push(objetivoVacio());
  let paso = 0;
  const hoy = hoyISO();

  const libres = () => libresDe(e, hoy);
  const libresDia = () => minutosLibresPorDia(libres());

  // ---------- Piezas ----------
  const diasHTML = ruta => `<div class="dias-sel">${DIAS_CORTO.map((l, i) => `<button type="button" class="dia-chip ${leer(e, ruta).includes(i) ? 'on' : ''}" data-accion="dia" data-ruta="${ruta}" data-valor="${i}" aria-pressed="${leer(e, ruta).includes(i)}" aria-label="${DIAS[i]}">${l}</button>`).join('')}</div>`;
  const opcionesHTML = (accion, lista, actual, extra = '') => `<div class="opciones-chip">${lista.map(([v, t]) => `<button type="button" class="chip ${String(v) === String(actual) ? 'activa' : ''}" data-accion="${accion}" data-valor="${v}" ${extra}>${t}</button>`).join('')}</div>`;
  const hora = (ruta, etiqueta) => `<input type="time" value="${leer(e, ruta)}" data-campo="${ruta}" aria-label="${etiqueta}">`;
  const tramoHTML = (base, quitar = '') => `<div class="tramo"><span>De</span>${hora(`${base}.inicio`, 'Entrada')}<span>a</span>${hora(`${base}.fin`, 'Salida')}${quitar}</div>`;

  // ---------- Pasos ----------
  const PANTALLAS = {
    trabajo() {
      const T = e.turnos;
      let detalle = '';
      if (e.trabaja && e.tipoHorario === 'fijo') detalle = `
        <span class="cfg-etiqueta">¿Qué días?</span>${diasHTML('fijo.dias')}
        <span class="cfg-etiqueta">¿A qué hora?</span>
        ${e.fijo.tramos.map((_, i) => tramoHTML(`fijo.tramos.${i}`, e.fijo.tramos.length > 1 ? `<button type="button" class="btn-icon" data-accion="tramo-menos" data-valor="${i}" aria-label="Quitar">✕</button>` : '')).join('')}
        ${e.fijo.tramos.length < 3 ? '<button type="button" class="btn gris chico" data-accion="tramo-mas">+ Otro tramo (jornada partida)</button>' : ''}`;
      if (e.trabaja && e.tipoHorario === 'turnos') {
        const activos = tiposActivos(e);
        detalle = `
        <span class="cfg-etiqueta">¿Qué días trabajas?</span>${diasHTML('turnos.dias')}
        <span class="cfg-etiqueta">¿Qué turnos haces?</span>
        <div class="opciones-chip">${TIPOS_TURNO.map(([k, t]) => `<button type="button" class="chip ${T.tipos[k].activo ? 'activa' : ''}" data-accion="turno-tipo" data-valor="${k}">${t}</button>`).join('')}</div>
        ${activos.map(k => `<div class="card cfg-sub"><b>Turno de ${TURNO_TXT[k].toLowerCase()}</b>
          ${tramoHTML(`turnos.tipos.${k}`)}
          <div class="fila sep"><span class="mini">Semanas seguidas</span>
            <div class="stepper"><button type="button" data-accion="semanas" data-tipo="${k}" data-valor="-1" aria-label="Menos">−</button><b>${T.tipos[k].semanas}</b><button type="button" data-accion="semanas" data-tipo="${k}" data-valor="1" aria-label="Más">+</button></div></div>
        </div>`).join('')}
        ${activos.length > 1 ? `<span class="cfg-etiqueta">Esta semana estoy de</span>${opcionesHTML('turno-actual', activos.map(k => [k, TURNO_TXT[k]]), T.actual)}` : ''}`;
      }
      if (e.trabaja && e.tipoHorario === 'variable') detalle = `
        <span class="cfg-etiqueta">Toca los días que trabajas y pon su horario</span>
        ${e.variable.map((d, i) => `<div class="cfg-dia-var"><button type="button" class="dia-chip ${d.activo ? 'on' : ''}" data-accion="variable-dia" data-valor="${i}">${DIAS_CORTO[i]}</button>
          ${d.activo ? tramoHTML(`variable.${i}`) : `<span class="mini">${DIAS[i]}: libre</span>`}</div>`).join('')}`;
      return `
        <h2>¿Trabajas o estudias?</h2>
        <p class="sub">Así sé qué horas tienes ocupadas.</p>
        <div class="si-no">
          <button type="button" class="opcion-grande ${e.trabaja === true ? 'activa' : ''}" data-accion="trabaja" data-valor="si">💼 Sí</button>
          <button type="button" class="opcion-grande ${e.trabaja === false ? 'activa' : ''}" data-accion="trabaja" data-valor="no">🏖️ No</button>
        </div>
        ${e.trabaja ? `
          <span class="cfg-etiqueta">¿Cómo es tu horario?</span>
          ${opcionesHTML('tipo-horario', [['fijo', 'Siempre igual'], ['turnos', 'Turnos rotativos'], ['variable', 'Cambia según el día']], e.tipoHorario)}
          ${detalle}
          <span class="cfg-etiqueta">¿Cuánto tardas en llegar?</span>
          ${opcionesHTML('trayecto', TRAYECTOS.map(m => [m, m ? `${m} min` : 'Nada']), e.trayecto)}` : ''}`;
    },

    descanso() {
      const total = libresDia().reduce((a, m) => a + m, 0);
      return `
        <h2>¿A qué hora te levantas y te acuestas?</h2>
        <p class="sub">${e.trabaja ? 'Normalmente, los días que no trabajas. Los días de trabajo lo ajusto yo a tu horario.' : 'Normalmente, un día cualquiera.'}</p>
        <div class="grid2">
          <label class="campo"><span>☀️ Me levanto</span>${hora('levantar', 'Me levanto')}</label>
          <label class="campo"><span>🌙 Me acuesto</span>${hora('acostar', 'Me acuesto')}</label>
        </div>
        <div class="nota">🕒 Quitando ${e.trabaja ? 'el trabajo, el trayecto, ' : ''}las comidas y un rato para descansar, te quedan unas <b>${fmtHoras(total)} libres a la semana</b>${libres().turnos ? ' (en la semana de turno que menos deja)' : ''}.</div>`;
    },

    objetivos() {
      const ld = libresDia();
      return `
        <h2>¿Qué quieres conseguir?</h2>
        <p class="sub">Para cada objetivo, dime cuántas horas a la semana y qué días puedes.</p>
        ${e.objetivos.map((o, i) => {
          const { porDia, diasSinHueco } = encaje(o, e.objetivos, ld);
          const aviso = !o.dias.length ? '<p class="encaje aviso">Elige al menos un día.</p>'
            : diasSinHueco.length ? `<p class="encaje aviso">⚠️ ${diasSinHueco.map(d => DIAS[d]).join(', ')}: no te da tiempo (${sesionDe(o.horasSemana, o.dias)} min de este objetivo y no tienes tanto libre). Quita ese día o baja las horas.</p>`
            : `<p class="encaje ok">✓ ${horasTxt(o.horasSemana)} en ${o.dias.length} ${o.dias.length === 1 ? 'día' : 'días'} = <b>${fmtHoras(porDia)} cada día</b>. Te cabe.</p>`;
          return `<div class="card cfg-obj">
            <div class="fila sep"><b>🎯 Objetivo ${i + 1}</b>${e.objetivos.length > 1 ? `<button type="button" class="btn-icon" data-accion="obj-quitar" data-valor="${i}" aria-label="Quitar objetivo">🗑</button>` : ''}</div>
            <input class="cfg-nombre" value="${esc(o.titulo)}" data-campo="objetivos.${i}.titulo" data-sin-repintar placeholder="Ej.: Aprender inglés" maxlength="60">
            ${o.titulo.trim() ? '' : `<div class="chips" style="margin-top:6px">${SUGERENCIAS.map(s => `<button type="button" class="chip" data-accion="sugerencia" data-i="${i}" data-valor="${esc(s)}">${esc(s)}</button>`).join('')}</div>`}
            <div class="fila sep" style="margin-top:10px"><span class="cfg-etiqueta" style="margin:0">Horas a la semana</span>
              <div class="stepper"><button type="button" data-accion="horas" data-i="${i}" data-valor="-0.5" aria-label="Menos horas">−</button><b>${horasTxt(o.horasSemana)}</b><button type="button" data-accion="horas" data-i="${i}" data-valor="0.5" aria-label="Más horas">+</button></div></div>
            <span class="cfg-etiqueta">¿Qué días?</span>${diasHTML(`objetivos.${i}.dias`)}
            <span class="cfg-etiqueta">¿Cuándo prefieres?</span>${opcionesHTML('momento', MOMENTOS_CORTOS, o.momento, `data-i="${i}"`)}
            ${aviso}
          </div>`;
        }).join('')}
        <button type="button" class="btn sec ancho" data-accion="obj-mas">+ Añadir otro objetivo</button>`;
    },

    resumen() {
      const { semana, avisos, libresMin, objetivosMin } = previsualizar();
      return `
        <h2>Así quedaría tu semana</h2>
        <p class="sub">Tienes unas <b>${fmtHoras(libresMin)}</b> libres y vas a dedicar <b>${fmtHoras(objetivosMin)}</b> a tus objetivos.</p>
        ${avisos.length ? `<div class="aviso">${avisos.map(esc).join('<br>')}</div>` : ''}
        <div class="card plano"><ul class="lista">${semana.map(({ fecha, bloques, turno }) => `
          <li style="align-items:flex-start"><div style="width:84px;flex:none"><b>${DIAS[weekday(fecha)]}</b>${turno ? `<div class="mini">🏭 ${TURNO_TXT[turno].toLowerCase()}</div>` : ''}</div>
          <div class="grow">${bloques.length ? bloques.map(b => `<div class="mini" style="color:var(--text)"><b>${b.inicio}–${b.fin}</b> ${esc(b.titulo)}</div>`).join('') : '<span class="mini">Libre</span>'}</div></li>`).join('')}</ul></div>
        <p class="mini">Es una semana completa de ejemplo. Esta semana empiezo desde hoy, y lo podrás cambiar cuando quieras desde Horario.</p>`;
    },
  };

  // Semana completa de ejemplo (la que viene) con lo que se ha respondido, sin guardar nada.
  function previsualizar() {
    const l = libres();
    const { guardar } = objetivosDe(e, [], hoy);
    const disponibilidad = l.turnos ? f => l.turnos.disponibilidad[tipoTurno(l.turnos, f)] : l.disponibilidad;
    const lunes = addDays(weekStart(hoy), 7);
    const r = generarSemana({ fecha: lunes, goals: guardar, blocks: [], disponibilidad, prefs: { sesionMin: 60, descansoMin: 10, maxHorasDia: maxHorasDiaDe(guardar) }, settings: { importantes: 'alta' } });
    const semana = weekDates(lunes).map(fecha => ({ fecha, turno: l.turnos ? tipoTurno(l.turnos, fecha) : null, bloques: ordenarBloques(r.nuevos.filter(b => b.fecha === fecha)) }));
    return { semana, avisos: r.avisos, libresMin: minutosLibresPorDia(l).reduce((a, m) => a + m, 0), objetivosMin: guardar.reduce((a, g) => a + g.horasSemana * 60, 0) };
  }

  function validar() {
    const id = PASOS[paso][0];
    if (id === 'trabajo') {
      if (e.trabaja == null) return 'Dime si trabajas o estudias.';
      if (e.trabaja && e.tipoHorario === 'fijo' && !e.fijo.dias.length) return 'Elige qué días trabajas.';
      if (e.trabaja && e.tipoHorario === 'turnos' && (!e.turnos.dias.length || !tiposActivos(e).length)) return 'Elige tus días de trabajo y al menos un turno.';
      if (e.trabaja && e.tipoHorario === 'variable' && !e.variable.some(d => d.activo)) return 'Toca al menos un día de trabajo.';
    }
    if (id === 'objetivos') {
      const con = e.objetivos.filter(o => o.titulo.trim());
      if (!con.length) return 'Escribe al menos un objetivo (o elige una sugerencia).';
      if (con.some(o => !o.dias.length)) return 'Elige los días de cada objetivo.';
    }
    return null;
  }

  // ---------- Pintar ----------
  function pintar() {
    const [id] = PASOS[paso];
    const ultimo = paso === PASOS.length - 1;
    cont.innerHTML = `<div class="cfg">
      <div class="cfg-pasos">${PASOS.map(([, t], i) => `<span class="${i === paso ? 'actual' : i < paso ? 'hecho' : ''}">${i < paso ? '✓' : i + 1} ${t}</span>`).join('')}</div>
      <div class="cfg-cuerpo">${PANTALLAS[id]()}</div>
      <div class="cfg-nav">
        ${paso > 0 || alVolver ? '<button type="button" class="btn gris" data-accion="atras">‹ Atrás</button>' : '<span></span>'}
        ${ultimo ? '<button type="button" class="btn verde" data-accion="crear">✓ Crear mi horario</button>' : '<button type="button" class="btn" data-accion="siguiente">Siguiente ›</button>'}
      </div>
    </div>`;
  }

  const ACCIONES = {
    trabaja: v => { e.trabaja = v === 'si'; },
    'tipo-horario': v => { e.tipoHorario = v; },
    trayecto: v => { e.trayecto = Number(v); },
    dia: (v, b) => { const lista = leer(e, b.dataset.ruta), d = Number(v); escribir(e, b.dataset.ruta, lista.includes(d) ? lista.filter(x => x !== d) : [...lista, d].sort((x, y) => x - y)); },
    'tramo-mas': () => { const ult = e.fijo.tramos.at(-1); e.fijo.tramos.push({ inicio: ult.fin, fin: ult.fin < '20:00' ? '21:00' : '23:00' }); },
    'tramo-menos': v => { e.fijo.tramos.splice(Number(v), 1); },
    'turno-tipo': v => { e.turnos.tipos[v].activo = !e.turnos.tipos[v].activo; if (!tiposActivos(e).includes(e.turnos.actual)) e.turnos.actual = tiposActivos(e)[0] || 'manana'; },
    semanas: (v, b) => { const t = e.turnos.tipos[b.dataset.tipo]; t.semanas = Math.min(4, Math.max(1, t.semanas + Number(v))); },
    'turno-actual': v => { e.turnos.actual = v; },
    'variable-dia': v => { e.variable[v].activo = !e.variable[v].activo; },
    sugerencia: (v, b) => { e.objetivos[b.dataset.i].titulo = v; },
    horas: (v, b) => { const o = e.objetivos[b.dataset.i]; o.horasSemana = Math.min(40, Math.max(0.5, o.horasSemana + Number(v))); },
    momento: (v, b) => { e.objetivos[b.dataset.i].momento = v; },
    'obj-mas': () => { e.objetivos.push(objetivoVacio()); },
    'obj-quitar': v => { e.objetivos.splice(Number(v), 1); },
    atras: () => { if (paso === 0) return alVolver?.(); paso--; },
    siguiente: () => { const error = validar(); if (error) { toast(error); return; } paso++; },
  };

  cont.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-accion]');
    if (!b || !cont.contains(b)) return;
    ev.preventDefault();
    if (b.dataset.accion === 'crear') {
      b.disabled = true; b.textContent = 'Creando tu horario…';
      try { await guardarTodo(e); toast('🎉 ¡Listo! Este es tu horario. Cada día tu asistente te dirá qué te toca.', 4500); alTerminar?.(); }
      catch (err) { console.error(err); toast(`❌ No se pudo guardar: ${err.message}`, 4000); b.disabled = false; b.textContent = '✓ Crear mi horario'; }
      return;
    }
    const pasoAntes = paso;
    if (b.dataset.accion === 'atras' && paso === 0) { alVolver?.(); return; }
    ACCIONES[b.dataset.accion]?.(b.dataset.valor, b);
    pintar();
    if (paso !== pasoAntes) cont.scrollIntoView?.({ block: 'start' });
  });
  // Horas y nombres: se guardan al cambiar; las horas repintan (cambian las horas libres y los avisos).
  cont.addEventListener('input', ev => { const i = ev.target.closest('[data-campo]'); if (i?.hasAttribute('data-sin-repintar')) escribir(e, i.dataset.campo, i.value); });
  cont.addEventListener('change', ev => {
    const i = ev.target.closest('[data-campo]');
    if (!i) return;
    escribir(e, i.dataset.campo, i.value);
    pintar();
  });

  pintar();
}

async function guardarTodo(e) {
  const hoy = hoyISO();
  const libres = libresDe(e, hoy);
  const existentes = await db.all('goals');
  const { guardar, archivar, tareas } = objetivosDe(e, existentes, hoy);
  const { objetivos, ...respuestas } = e; // los objetivos viven en la pestaña Objetivos
  await kvSet('configuracion', respuestas);
  await saveDisponibilidad(libres.disponibilidad);
  await saveTurnos(libres.turnos);
  await savePrefs({ ...(await getPrefs()), descansoMin: 10, maxHorasDia: maxHorasDiaDe(guardar) });
  await db.putMany('goals', [...guardar, ...archivar]);
  if (tareas.length) await db.putMany('tasks', tareas);

  // Esta semana (desde hoy) y la siguiente.
  const [disponibilidad, prefs, settings] = await Promise.all([dispPorFecha(), getPrefs(), getSettings()]);
  const creados = [];
  for (const fecha of [hoy, addDays(weekStart(hoy), 7)]) {
    const r = generarSemana({ fecha, goals: [...guardar, ...archivar], blocks: await db.all('blocks'), disponibilidad, prefs, settings });
    await db.delMany('blocks', r.borrar);
    await db.putMany('blocks', r.nuevos);
    creados.push(...r.nuevos);
  }
  asignarFrases(creados).then(refrescar).catch(() => {});
}


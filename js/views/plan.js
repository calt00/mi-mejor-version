// «Cuéntame tu vida»: escribes tu situación y propósitos, la IA propone un plan completo y tú eliges qué aplicar.
import { db, kvGet, kvSet } from '../db.js';
import { areaNombre, getProfile, saveProfile, getPrefs, savePrefs, saveDisponibilidad, saveIngresos, getIngresos, getDisponibilidad, getSettings, catIcono } from '../datos.js';
import { esc, sheet, toast, refrescar, uid, hoyISO, addDays, weekStart, DIAS, fmtHoras, fmtEur, fmtFecha, toMin, sum } from '../util.js';
import { planDesdeTexto, iaDisponible, ErrorIA } from '../coach.js';
import { normalizarPlan, cruzarConExistentes } from '../plan.js';
import { generarSemana } from '../scheduler.js';
import { asignarFrases } from '../iphone.js';
import { cargando } from './comun.js';

const EJEMPLO = `Me llamo Dani, tengo 24 años y trabajo de lunes a viernes de 9:00 a 17:00 en una oficina; tardo 30 minutos en llegar. Me levanto a las 7:00 y me acuesto sobre las 23:30. Los martes y jueves tengo clase de guitarra de 19:00 a 20:00.
Quiero ponerme en forma (ir al gimnasio 3 veces por semana), sacarme el B2 de inglés antes de junio y leer más. Me cuesta ser constante y pierdo mucho tiempo con el móvil por la noche.
Cobro 1.500 € al mes el día 28, pago 550 € de alquiler y quiero ahorrar 2.000 € para un viaje a Japón en verano.`;

const PISTAS = ['🏢 A qué te dedicas y tu horario (trabajo, clases, transporte)', '🛏️ A qué hora te levantas, comes y te acuestas', '🎯 Qué quieres conseguir y para cuándo',
  '😮‍💨 Qué te cuesta y qué te motiva', '💶 Si quieres: sueldo, gastos fijos y para qué ahorras'];

const horasLibres = disp => sum(disp.flat(), f => toMin(f.fin) - toMin(f.inicio));

// Lo que ya hay en la app, para que la IA no lo duplique.
async function resumenActual() {
  const [goals, habits, metas] = await Promise.all([db.all('goals'), db.all('habits'), db.all('savingsGoals')]);
  const l = [];
  const activos = goals.filter(g => !g.archivado);
  if (activos.length) l.push(`Objetivos: ${activos.map(g => `«${g.titulo}» (${g.horasSemana || 0} h/sem)`).join('; ')}`);
  if (habits.length) l.push(`Hábitos: ${habits.map(h => h.titulo).join('; ')}`);
  if (metas.length) l.push(`Metas de ahorro: ${metas.map(m => `«${m.nombre}» ${m.meta} €`).join('; ')}`);
  return l.join('\n');
}

/**
 * Abre la ventana. Opciones: texto inicial, autoEnviar (crea el plan sin esperar), onAplicado (tras guardar).
 */
export async function abrirPlan({ texto = null, autoEnviar = false, onAplicado = null } = {}) {
  const guardado = await kvGet('miSituacion');
  const inicial = texto ?? guardado?.texto ?? '';
  const { el, close } = sheet('🧠 Tu plan a medida', `
    <p class="sub">Cuéntame tu vida como se la contarías a un amigo. Con eso organizo tus <b>objetivos</b>, tus <b>horas libres</b>, tus <b>hábitos</b>, tu <b>ahorro</b> y tu <b>horario</b>. Antes de guardar nada, te enseño la propuesta.</p>
    <div class="card plano" style="margin-bottom:10px"><ul class="lista">${PISTAS.map(p => `<li class="mini" style="min-height:0;padding:8px 14px">${p}</li>`).join('')}</ul></div>
    <form id="f">
      <textarea name="texto" required style="min-height:220px" placeholder="Ej.: Trabajo de 9 a 17 h, me levanto a las 7… Quiero aprender inglés, ir al gimnasio…">${esc(inicial)}</textarea>
      <div class="acciones" style="margin-top:6px">
        <button type="button" class="btn gris chico" id="ejemplo">👀 Ver un ejemplo</button>
        <span class="mini" id="contador" style="align-self:center"></span>
      </div>
      <button class="btn ancho" style="margin-top:10px">✨ Crear mi plan</button>
    </form>
    <div id="res"></div>`);
  const form = el.querySelector('#f'), res = el.querySelector('#res'), ta = form.texto;
  const contar = () => { el.querySelector('#contador').textContent = ta.value.trim().length < 80 ? 'Cuanto más me cuentes, mejor será el plan.' : ''; };
  ta.addEventListener('input', contar); contar();
  el.querySelector('#ejemplo').addEventListener('click', () => {
    if (ta.value.trim() && !confirm('¿Sustituir tu texto por el ejemplo?')) return;
    ta.value = EJEMPLO; contar();
  });

  const ajustes = [];
  async function crear() {
    const t = ta.value.trim();
    if (!t) return toast('Escribe primero tu situación.');
    if (!(await iaDisponible())) {
      res.innerHTML = '<div class="aviso" style="margin-top:12px">Para crear el plan necesito tu clave gratuita de Gemini. Añádela en <a href="#perfil">Perfil → Ajustes</a> y vuelve aquí: tu texto se queda guardado.</div>';
      await kvSet('miSituacion', { texto: t, fecha: hoyISO() });
      return;
    }
    await kvSet('miSituacion', { texto: t, fecha: hoyISO() });
    // Puede tardar casi un minuto: se enseña el tiempo y en qué fase va para que se vea que sigue trabajando.
    res.innerHTML = `${cargando('Leyendo lo que me cuentas…')}<p class="mini centro" id="espera">Suele tardar entre 20 y 60 segundos. No cierres la app.</p>`;
    const etiqueta = res.querySelector('.cargando'), inicio = Date.now();
    let fase = 'Leyendo lo que me cuentas…';
    const pintarEspera = () => { etiqueta.lastChild.textContent = `${fase} ${Math.round((Date.now() - inicio) / 1000)} s`; };
    const reloj = setInterval(pintarEspera, 1000);
    const onProgreso = f => { fase = f === 'pensando' ? 'Pensando cómo organizarte…' : 'Escribiendo tu plan…'; };
    form.querySelector('button.btn.ancho').disabled = true;
    res.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const [raw, existentes] = await Promise.all([
        planDesdeTexto(t, { ajustes, actual: await resumenActual(), onProgreso }),
        Promise.all([db.all('goals'), db.all('habits'), db.all('savingsGoals'), db.all('fixedExpenses')])
          .then(([goals, habits, savingsGoals, fixedExpenses]) => ({ goals, habits, savingsGoals, fixedExpenses })),
      ]);
      const plan = cruzarConExistentes(normalizarPlan(raw), existentes);
      if (!plan.objetivos.length && !plan.disponibilidad) throw new ErrorIA('No he sacado ningún objetivo ni horario de tu texto. Cuéntame un poco más (qué haces cada día y qué quieres conseguir).');
      mostrarPropuesta(plan);
    } catch (e) {
      console.error(e);
      res.innerHTML = `<div class="aviso" style="margin-top:12px">${esc(e instanceof ErrorIA ? e.message : 'No se pudo crear el plan. Inténtalo de nuevo.')}</div>
        <button type="button" class="btn sec ancho" id="reintentar">↻ Intentarlo otra vez</button>`;
      res.querySelector('#reintentar').addEventListener('click', crear);
    } finally {
      clearInterval(reloj);
      form.querySelector('button.btn.ancho').disabled = false;
    }
  }
  form.addEventListener('submit', e => { e.preventDefault(); ajustes.length = 0; crear(); });

  function mostrarPropuesta(plan) {
    const libresMin = plan.disponibilidad ? horasLibres(plan.disponibilidad) : 0;
    const objetivosMin = sum(plan.objetivos, o => o.horasSemana * 60);
    const casilla = (grupo, i, on = true) => `<input type="checkbox" class="elegir" data-grupo="${grupo}" data-i="${i}" ${on ? 'checked' : ''} aria-label="Incluir">`;
    const perfilTxt = Object.entries({ nombre: 'Nombre', sobreMi: 'Quién eres', rutina: 'Rutina', fortalezas: 'Puntos fuertes', debilidades: 'Puntos débiles', motivacion: 'Qué te motiva' })
      .filter(([k]) => plan.perfil[k]).map(([k, n]) => `<div class="mini"><b>${n}:</b> ${esc(plan.perfil[k])}</div>`).join('');
    const hayDinero = plan.ingresos || plan.gastosFijos.length || plan.metasAhorro.length;

    res.innerHTML = `
      <div class="card" style="margin-top:14px"><b>💬 Así te voy a organizar</b><p style="margin:6px 0 0">${esc(plan.resumen)}</p></div>
      <p class="mini" style="margin:0 4px 10px">Desmarca lo que no quieras. Nada se guarda hasta que pulses «Aplicar».</p>

      ${plan.objetivos.length ? `<div class="seccion" style="margin-top:8px"><h2>🎯 Objetivos</h2><span class="mini">${fmtHoras(objetivosMin)}/semana</span></div>
      <div class="card plano"><ul class="lista">${plan.objetivos.map((o, i) => `
        <li><label class="fila grow" style="align-items:flex-start">${casilla('objetivos', i)}<div class="grow">
          <div class="t">${esc(o.titulo)} ${o.existente ? '<span class="badge">ya lo tienes · se actualiza</span>' : ''}</div>
          <div class="mini">${esc(areaNombre(o.area))} · ${o.horasSemana} h/semana · prioridad ${['', 'baja', 'media', 'alta'][o.prioridad]}${o.momento !== 'cualquiera' ? ` · por la ${{ manana: 'mañana', tarde: 'tarde', noche: 'noche' }[o.momento]}` : ''}${o.fechaLimite ? ` · hasta el ${esc(fmtFecha(o.fechaLimite, { day: 'numeric', month: 'short', year: 'numeric' }))}` : ''}</div>
          ${o.porque ? `<div class="mini"><em>${esc(o.porque)}</em></div>` : ''}
          ${o.tareas.length ? `<div class="mini">✅ ${o.tareas.map(esc).join(' · ')}</div>` : ''}
        </div></label></li>`).join('')}</ul></div>` : ''}

      ${plan.disponibilidad ? `<div class="seccion"><h2>🕒 Tus horas libres</h2><span class="mini">${fmtHoras(libresMin)}/semana</span></div>
      <div class="card">
        <label class="fila" style="margin-bottom:8px">${casilla('disponibilidad', 0)}<b>Usar estas horas para colocar tus objetivos</b></label>
        ${plan.disponibilidad.map((d, i) => `<div class="fila sep mini" style="padding:3px 0"><b>${DIAS[i]}</b><span>${d.length ? d.map(f => `${f.inicio}–${f.fin}`).join(' · ') : 'libre de objetivos'}</span></div>`).join('')}
        <div class="mini" style="margin-top:6px">Sesiones de ${plan.preferencias.sesionMin} min · descansos de ${plan.preferencias.descansoMin} min · máximo ${plan.preferencias.maxHorasDia} h al día</div>
        ${libresMin && objetivosMin > libresMin ? '<div class="aviso" style="margin:8px 0 0">Tus objetivos suman más horas de las que tienes libres. Pulsa «Cambiar algo» y pide que lo ajuste.</div>' : ''}
      </div>` : ''}

      ${plan.habitos.length ? `<div class="seccion"><h2>🔁 Hábitos diarios</h2></div>
      <div class="card plano"><ul class="lista">${plan.habitos.map((h, i) => `
        <li><label class="fila grow">${casilla('habitos', i, !h.existente)}<span style="font-size:22px">${esc(h.emoji)}</span><div class="grow">${esc(h.titulo)}${h.existente ? ' <span class="badge">ya lo tienes</span>' : ''}</div></label></li>`).join('')}</ul></div>` : ''}

      ${hayDinero ? `<div class="seccion"><h2>🐷 Dinero</h2></div>
      <div class="card plano"><ul class="lista">
        ${plan.ingresos ? `<li><label class="fila grow">${casilla('ingresos', 0)}<div class="grow">💶 Nómina de ${fmtEur(plan.ingresos.nomina)} el día ${plan.ingresos.diaCobro}${plan.ingresos.extras ? ` + ${fmtEur(plan.ingresos.extras)} extra` : ''}</div></label></li>` : ''}
        ${plan.gastosFijos.map((g, i) => `<li><label class="fila grow">${casilla('gastosFijos', i)}<div class="grow">${catIcono(g.categoria)} ${esc(g.nombre)}: ${fmtEur(g.importe)}/mes${g.existente ? ' <span class="badge">se actualiza</span>' : ''}</div></label></li>`).join('')}
        ${plan.metasAhorro.map((m, i) => `<li><label class="fila grow">${casilla('metasAhorro', i)}<div class="grow">${esc(m.emoji)} Meta «${esc(m.nombre)}»: ${fmtEur(m.meta, true)}${m.fechaLimite ? ` para el ${esc(fmtFecha(m.fechaLimite, { day: 'numeric', month: 'short', year: 'numeric' }))}` : ''}${m.existente ? ' <span class="badge">se actualiza</span>' : ''}</div></label></li>`).join('')}
      </ul></div>` : ''}

      ${perfilTxt ? `<div class="seccion"><h2>👤 Lo que he entendido de ti</h2></div>
      <div class="card"><label class="fila" style="margin-bottom:6px">${casilla('perfil', 0)}<b>Guardarlo en tu perfil (para tu coach)</b></label>${perfilTxt}</div>` : ''}

      <div class="card">
        <label class="switch" style="margin:0"><span>🗓️ Crear ya mi horario (esta semana y la siguiente)<br><span class="mini">Se respetan los bloques fijados 📌 y los ya hechos</span></span><input type="checkbox" id="generar" checked></label>
      </div>
      <button class="btn verde ancho" id="aplicar">✓ Aplicar mi plan</button>
      <form id="ajuste" style="margin-top:10px">
        <textarea name="cambio" placeholder="¿Cambio algo? Ej.: «el gimnasio mejor por la mañana», «menos horas de inglés», «los domingos quiero descansar»" style="min-height:70px"></textarea>
        <div class="acciones"><button class="btn sec">✏️ Cambiar algo</button><button type="button" class="btn gris" id="descartar">Descartar</button></div>
      </form>`;

    res.querySelector('#descartar').addEventListener('click', close);
    res.querySelector('#ajuste').addEventListener('submit', e => {
      e.preventDefault();
      const cambio = e.target.cambio.value.trim();
      if (!cambio) return toast('Escribe qué quieres cambiar.');
      ajustes.push(cambio);
      crear();
    });
    res.querySelector('#aplicar').addEventListener('click', async e => {
      const elegido = (grupo, i = 0) => res.querySelector(`.elegir[data-grupo="${grupo}"][data-i="${i}"]`)?.checked;
      e.target.disabled = true; e.target.textContent = 'Guardando…';
      try {
        const r = await aplicar(plan, elegido, res.querySelector('#generar').checked);
        close();
        onAplicado?.();
        if (location.hash !== '#horario') location.hash = '#horario'; else refrescar();
        toast(`🎉 ¡Plan aplicado! ${r.objetivos} ${r.objetivos === 1 ? 'objetivo' : 'objetivos'}${r.bloques ? ` y ${r.bloques} bloques en tu horario` : ''}.${r.avisos.length ? ` ${r.avisos[0]}` : ''}`, 5000);
      } catch (err) {
        console.error(err);
        toast(`❌ No se pudo guardar: ${err.message}`, 4000);
        e.target.disabled = false; e.target.textContent = '✓ Aplicar mi plan';
      }
    });
  }

  if (autoEnviar && inicial.trim()) crear();
}

async function aplicar(plan, elegido, generar) {
  const hoy = hoyISO();
  if (elegido('perfil')) {
    const p = await getProfile();
    await saveProfile({ ...p, ...plan.perfil });
  }
  if (plan.disponibilidad && elegido('disponibilidad')) {
    await saveDisponibilidad(plan.disponibilidad);
    await savePrefs({ ...(await getPrefs()), ...plan.preferencias });
  }

  const goals = await db.all('goals');
  let nObjetivos = 0;
  for (const [i, o] of plan.objetivos.entries()) {
    if (!elegido('objetivos', i)) continue;
    const previo = goals.find(g => g.id === o.existente);
    const { tareas, existente, ...datos } = o;
    const g = { ...previo, ...datos, id: previo?.id || uid(), creado: previo?.creado || hoy, archivado: false };
    await db.put('goals', g);
    nObjetivos++;
    const yaTiene = new Set((await db.all('tasks')).filter(t => t.goalId === g.id).map(t => t.titulo.toLowerCase()));
    const nuevas = tareas.filter(t => !yaTiene.has(t.toLowerCase()));
    if (nuevas.length) await db.putMany('tasks', nuevas.map((titulo, k) => ({ id: uid() + k, goalId: g.id, titulo, hecho: false, creado: Date.now() + k })));
  }

  for (const [i, h] of plan.habitos.entries()) {
    if (elegido('habitos', i) && !h.existente) await db.put('habits', { id: uid(), titulo: h.titulo, emoji: h.emoji, registros: [], creado: hoy });
  }
  if (plan.ingresos && elegido('ingresos')) await saveIngresos({ ...(await getIngresos()), ...plan.ingresos });
  for (const [i, f] of plan.gastosFijos.entries()) {
    if (!elegido('gastosFijos', i)) continue;
    const { existente, ...datos } = f;
    const previo = existente ? await db.get('fixedExpenses', existente) : null;
    await db.put('fixedExpenses', { ...previo, ...datos, id: existente || uid() });
  }
  for (const [i, m] of plan.metasAhorro.entries()) {
    if (!elegido('metasAhorro', i)) continue;
    const { existente, ...datos } = m;
    const previo = existente ? await db.get('savingsGoals', existente) : null;
    await db.put('savingsGoals', { ...previo, ...datos, id: existente || uid(), creado: previo?.creado || hoy });
  }

  // Esta semana y la siguiente: si es jueves o más tarde, esta semana apenas tiene hueco.
  let bloques = 0, avisos = [];
  if (generar) {
    const [goalsAhora, disponibilidad, prefs, settings] = await Promise.all([db.all('goals'), getDisponibilidad(), getPrefs(), getSettings()]);
    const creados = [];
    for (const fecha of [hoy, addDays(weekStart(hoy), 7)]) {
      const r = generarSemana({ fecha, goals: goalsAhora, blocks: await db.all('blocks'), disponibilidad, prefs, settings });
      await db.delMany('blocks', r.borrar);
      await db.putMany('blocks', r.nuevos);
      creados.push(...r.nuevos);
      if (fecha !== hoy) avisos = r.avisos; // la semana completa es la que dice si cabe todo
    }
    bloques = creados.length;
    asignarFrases(creados).then(refrescar).catch(() => {});
  }
  return { objetivos: nObjetivos, bloques, avisos };
}

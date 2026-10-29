// «Cuéntame tu vida»: escribes tu situación y propósitos, el intérprete de la app (sin IA) propone un plan
// completo y tú eliges qué aplicar. Funciona sin internet ni claves.
import { db, kvGet, kvSet } from '../db.js';
import { areaNombre, getProfile, saveProfile, getPrefs, savePrefs, saveDisponibilidad, saveIngresos, getIngresos, getSettings, catIcono, saveTurnos, dispPorFecha, MOMENTOS } from '../datos.js';
import { esc, sheet, toast, refrescar, uid, hoyISO, addDays, weekStart, weekday, DIAS, fmtHoras, fmtEur, fmtFecha, toMin, sum, opciones } from '../util.js';
import { interpretarTexto, posicionEnPatron } from '../interprete.js';
import { normalizarPlan, normalizarTurnos, cruzarConExistentes } from '../plan.js';
import { generarSemana } from '../scheduler.js';
import { asignarFrases } from '../iphone.js';

const EJEMPLO = `Me llamo Dani, tengo 24 años y trabajo de lunes a viernes de 9:00 a 17:00 en una oficina; tardo 30 minutos en llegar. Me levanto a las 7:00 y me acuesto sobre las 23:30. Los martes y jueves tengo clase de guitarra de 19:00 a 20:00.
Quiero ir al gimnasio 3 veces por semana por la mañana, sacarme el B2 de inglés antes de junio y leer más. Me cuesta ser constante y pierdo mucho tiempo con el móvil por la noche.
Cobro 1.500 € al mes el día 28, pago 550 € de alquiler y quiero ahorrar 2.000 € para un viaje a Japón en verano.`;

const PISTAS = ['🏢 A qué te dedicas y tu horario: «trabajo de lunes a viernes de 9 a 17», «turnos rotativos: dos semanas de tarde de 14:50 a 22:55 y una de mañana de 6:40 a 14:50»',
  '🗓️ Qué días trabajas o libras y cuánto tardas en llegar', '🛏️ A qué hora te levantas y te acuestas',
  '🎯 Qué quieres conseguir: «quiero aprender inglés 3 veces por semana», «poco a poco», «antes de junio»', '💶 Si quieres: «cobro 1.200 €», «pago 400 de alquiler», «quiero ahorrar 1.000 € para un coche»'];

const TURNO_TXT = { manana: 'mañana', tarde: 'tarde', noche: 'noche' };
const HORAS_OPC = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
const horasLibres = disp => sum(disp.flat(), f => toMin(f.fin) - toMin(f.inicio));
const inicioCiclo = (turnos, f) => addDays(f, -((weekday(f) - turnos.inicioCiclo + 7) % 7));
const ordinal = n => `${n}.ª`;

/**
 * Abre la ventana. Opciones: texto inicial, autoEnviar (crea el plan sin esperar), onAplicado (tras guardar).
 */
export async function abrirPlan({ texto = null, autoEnviar = false, onAplicado = null } = {}) {
  const guardado = await kvGet('miSituacion');
  const inicial = texto ?? guardado?.texto ?? '';
  const { el, close } = sheet('🧠 Tu plan a medida', `
    <p class="sub">Cuéntame tu vida con tus palabras. La app lo lee y organiza tus <b>objetivos</b>, tus <b>horas libres</b> (también si trabajas a turnos), tus <b>hábitos</b>, tu <b>ahorro</b> y tu <b>horario</b>. No necesita internet ni claves, y antes de guardar nada te enseña lo que ha entendido.</p>
    <details class="card" style="margin-bottom:10px"><summary class="mini" style="cursor:pointer"><b>💡 Qué contar para que te entienda mejor</b></summary>
      <ul class="mini" style="padding-left:18px;margin:8px 0 0">${PISTAS.map(p => `<li style="margin-bottom:6px">${p}</li>`).join('')}</ul></details>
    <form id="f">
      <textarea name="texto" required style="min-height:220px" placeholder="Ej.: Trabajo en Amazon a turnos rotativos de viernes a martes: dos semanas de tarde de 14:50 a 22:55 y una de mañana de 6:40 a 14:50. Quiero mejorar en informática poco a poco…">${esc(inicial)}</textarea>
      <div class="acciones" style="margin-top:6px"><button type="button" class="btn gris chico" id="ejemplo">👀 Ver un ejemplo</button></div>
      <button class="btn ancho" style="margin-top:10px">✨ Crear mi plan</button>
    </form>
    <div id="res"></div>`);
  const form = el.querySelector('#f'), res = el.querySelector('#res'), ta = form.texto;
  el.querySelector('#ejemplo').addEventListener('click', () => {
    if (ta.value.trim() && !confirm('¿Sustituir tu texto por el ejemplo?')) return;
    ta.value = EJEMPLO;
  });

  const ajustes = [];
  async function crear() {
    const t = ta.value.trim();
    if (t.length < 15) return toast('Cuéntame un poco más sobre ti y lo que quieres conseguir.');
    await kvSet('miSituacion', { texto: t, fecha: hoyISO() });
    const hoy = hoyISO();
    const r = interpretarTexto(t, { hoy, ajustes });
    const existentes = await Promise.all([db.all('goals'), db.all('habits'), db.all('savingsGoals'), db.all('fixedExpenses')])
      .then(([goals, habits, savingsGoals, fixedExpenses]) => ({ goals, habits, savingsGoals, fixedExpenses }));
    const plan = cruzarConExistentes(normalizarPlan(r.raw), existentes);
    plan.turnos = normalizarTurnos(r.turnos);
    plan.supuestos = r.supuestos;
    plan.entendido = r.entendido;
    mostrarPropuesta(plan);
    res.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  form.addEventListener('submit', e => { e.preventDefault(); ajustes.length = 0; crear(); });

  function mostrarPropuesta(plan) {
    const hoy = hoyISO();
    const objetivosMin = sum(plan.objetivos, o => o.horasSemana * 60);
    const casilla = (grupo, i, on = true) => `<input type="checkbox" class="elegir" data-grupo="${grupo}" data-i="${i}" ${on ? 'checked' : ''} aria-label="Incluir">`;
    const perfilTxt = Object.entries({ nombre: 'Nombre', sobreMi: 'Quién eres', rutina: 'Rutina', debilidades: 'Lo que te cuesta', motivacion: 'Qué te motiva' })
      .filter(([k]) => plan.perfil[k]).map(([k, n]) => `<div class="mini"><b>${n}:</b> ${esc(plan.perfil[k])}</div>`).join('');
    const hayDinero = plan.ingresos || plan.gastosFijos.length || plan.metasAhorro.length;
    const tablaDias = disp => disp.map((d, i) => `<div class="fila sep mini" style="padding:3px 0"><b>${DIAS[i]}</b><span>${d.length ? d.map(f => `${f.inicio}–${f.fin}`).join(' · ') : '—'}</span></div>`).join('');
    const T = plan.turnos;

    let turnosHTML = '';
    if (T) {
      const tipos = [...new Set(T.patron)];
      const cuenta = tipo => T.patron.filter(x => x === tipo).length;
      const ini = inicioCiclo(T, hoy), pos = posicionEnPatron(T, hoy);
      const etiquetas = T.patron.map((tipo, i) => {
        const n = T.patron.slice(0, i + 1).filter(x => x === tipo).length;
        return `${mayus(TURNO_TXT[tipo])}${cuenta(tipo) > 1 ? ` (${ordinal(n)} semana)` : ''}`;
      });
      const siguiente = addDays(ini, 7), tipoSig = T.patron[posicionEnPatron(T, siguiente)];
      turnosHTML = `<div class="seccion"><h2>🏭 Tus turnos</h2></div>
      <div class="card">
        <p class="mini" style="margin-bottom:8px">${tipos.map(tp => `<b>${mayus(TURNO_TXT[tp])}</b>${T.horarios[tp] ? ` ${T.horarios[tp].inicio}–${T.horarios[tp].fin}` : ''}`).join(' · ')}. Cada ciclo empieza en ${DIAS[T.inicioCiclo].toLowerCase()}.</p>
        <div class="grid2">${tipos.map(tp => `<label class="campo"><span>Semanas seguidas de ${TURNO_TXT[tp]}</span>
          <select data-semanas="${tp}">${opciones([1, 2, 3, 4].map(n => [n, `${n}`]), cuenta(tp))}</select></label>`).join('')}</div>
        <label class="campo"><span>Esta semana (desde el ${esc(fmtFecha(ini, { weekday: 'long', day: 'numeric', month: 'short' }).toLowerCase())}) estás de</span>
          <select id="ciclo-actual">${opciones(etiquetas.map((e, i) => [i, e]), pos)}</select></label>
        <p class="mini" style="margin:0">➡️ El ${esc(fmtFecha(siguiente, { weekday: 'long', day: 'numeric', month: 'short' }).toLowerCase())} empiezas turno de <b>${TURNO_TXT[tipoSig]}</b>. Tu horario cambiará solo cada semana.</p>
      </div>`;
    }

    res.innerHTML = `
      <div class="card" style="margin-top:14px"><b>✅ Lo que he entendido</b>
        ${plan.entendido.length ? `<ul class="mini" style="padding-left:18px;margin:6px 0">${plan.entendido.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="mini">No he reconocido mucho de tu texto. Prueba a contar tu horario y lo que quieres conseguir como en las pistas de arriba.</p>'}
        <p style="margin:6px 0 0">${esc(plan.resumen)}</p></div>
      ${plan.supuestos.length ? `<div class="aviso"><b>🤔 Lo que he supuesto</b> (si no es así, corrígelo abajo):
        <ul style="padding-left:18px;margin:6px 0 0">${plan.supuestos.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      <p class="mini" style="margin:0 4px 10px">Desmarca lo que no quieras y ajusta lo que haga falta. Nada se guarda hasta que pulses «Aplicar».</p>

      ${turnosHTML}

      ${plan.objetivos.length ? `<div class="seccion" style="margin-top:8px"><h2>🎯 Objetivos</h2><span class="mini" id="total-obj">${fmtHoras(objetivosMin)}/semana</span></div>
      <div class="card plano"><ul class="lista">${plan.objetivos.map((o, i) => `
        <li style="align-items:flex-start">${casilla('objetivos', i)}<div class="grow">
          <div class="t">${esc(o.titulo)} ${o.existente ? '<span class="badge">ya lo tienes · se actualiza</span>' : ''}</div>
          <div class="mini">${esc(areaNombre(o.area))}${o.fechaLimite ? ` · hasta el ${esc(fmtFecha(o.fechaLimite, { day: 'numeric', month: 'short', year: 'numeric' }))}` : ''}${o.sesionMin ? ` · sesiones de ${o.sesionMin} min` : ''}</div>
          <div class="grid2" style="margin-top:6px">
            <select data-horas="${i}" aria-label="Horas por semana">${opciones([...new Set([...HORAS_OPC, o.horasSemana])].sort((a, b) => a - b).map(h => [h, `${String(h).replace('.', ',')} h/semana`]), o.horasSemana)}</select>
            <select data-momento="${i}" aria-label="Momento del día">${opciones(MOMENTOS, o.momento)}</select>
          </div>
          ${o.porque ? `<div class="mini"><em>${esc(o.porque)}</em></div>` : ''}
          ${o.tareas.length ? `<div class="mini">✅ ${o.tareas.map(esc).join(' · ')}</div>` : ''}
        </div></li>`).join('')}</ul></div>` : ''}

      ${plan.disponibilidad ? `<div class="seccion"><h2>🕒 Tus horas libres</h2><span class="mini">${T ? 'según el turno' : `${fmtHoras(horasLibres(plan.disponibilidad))}/semana`}</span></div>
      <div class="card">
        <label class="fila" style="margin-bottom:8px">${casilla('disponibilidad', 0)}<b>Usar estas horas para colocar tus objetivos</b></label>
        ${T ? Object.entries(T.disponibilidad).map(([tp, d]) => `<details style="margin-top:6px"><summary class="mini" style="cursor:pointer"><b>Semanas de ${TURNO_TXT[tp]}</b> · ${fmtHoras(horasLibres(d))} libres</summary>${tablaDias(d)}</details>`).join('') : tablaDias(plan.disponibilidad)}
        <div class="mini" style="margin-top:6px">Ya he descontado el trabajo, el trayecto, las comidas y un rato para descansar. Como mucho ${String(plan.preferencias.maxHorasDia).replace('.', ',')} h de objetivos al día.</div>
      </div>` : ''}

      ${plan.habitos.length ? `<div class="seccion"><h2>🔁 Hábitos diarios</h2></div>
      <div class="card plano"><ul class="lista">${plan.habitos.map((h, i) => `
        <li><label class="fila grow">${casilla('habitos', i, !h.existente)}<span style="font-size:22px">${esc(h.emoji)}</span><div class="grow">${esc(h.titulo)}${h.existente ? ' <span class="badge">ya lo tienes</span>' : ''}</div></label></li>`).join('')}</ul></div>` : ''}

      ${hayDinero ? `<div class="seccion"><h2>🐷 Dinero</h2></div>
      <div class="card plano"><ul class="lista">
        ${plan.ingresos ? `<li><label class="fila grow">${casilla('ingresos', 0)}<div class="grow">💶 Nómina de ${fmtEur(plan.ingresos.nomina)} el día ${plan.ingresos.diaCobro}</div></label></li>` : ''}
        ${plan.gastosFijos.map((g, i) => `<li><label class="fila grow">${casilla('gastosFijos', i)}<div class="grow">${catIcono(g.categoria)} ${esc(g.nombre)}: ${fmtEur(g.importe)}/mes${g.existente ? ' <span class="badge">se actualiza</span>' : ''}</div></label></li>`).join('')}
        ${plan.metasAhorro.map((m, i) => `<li><label class="fila grow">${casilla('metasAhorro', i)}<div class="grow">${esc(m.emoji)} Meta «${esc(m.nombre)}»: ${fmtEur(m.meta, true)}${m.fechaLimite ? ` para el ${esc(fmtFecha(m.fechaLimite, { day: 'numeric', month: 'short', year: 'numeric' }))}` : ''}${m.existente ? ' <span class="badge">se actualiza</span>' : ''}</div></label></li>`).join('')}
      </ul></div>` : ''}

      ${perfilTxt ? `<div class="seccion"><h2>👤 Para tu perfil</h2></div>
      <div class="card"><label class="fila" style="margin-bottom:6px">${casilla('perfil', 0)}<b>Guardarlo en tu perfil</b></label>${perfilTxt}</div>` : ''}

      <div class="card">
        <label class="switch" style="margin:0"><span>🗓️ Crear ya mi horario (esta semana y la siguiente)<br><span class="mini">Se respetan los bloques fijados 📌 y los ya hechos</span></span><input type="checkbox" id="generar" checked></label>
      </div>
      <button class="btn verde ancho" id="aplicar" ${plan.objetivos.length || plan.disponibilidad ? '' : 'disabled'}>✓ Aplicar mi plan</button>
      <form id="ajuste" style="margin-top:12px">
        <label class="campo"><span>✏️ ¿Corrijo algo? Escríbelo con tus palabras</span>
          <textarea name="cambio" placeholder="Ej.: «me levanto a las 6», «el gimnasio mejor por la tarde», «quita leer», «los domingos quiero descansar», «tardo 45 minutos en llegar»" style="min-height:70px"></textarea></label>
        ${ajustes.length ? `<p class="mini">Correcciones: ${ajustes.map(a => `«${esc(a)}»`).join(' · ')}</p>` : ''}
        <div class="acciones"><button class="btn sec">Corregir</button><button type="button" class="btn gris" id="descartar">Descartar</button></div>
      </form>`;

    // Ediciones rápidas.
    res.querySelectorAll('[data-horas]').forEach(s => s.addEventListener('change', () => {
      plan.objetivos[s.dataset.horas].horasSemana = Number(s.value);
      res.querySelector('#total-obj').textContent = `${fmtHoras(sum(plan.objetivos, o => o.horasSemana * 60))}/semana`;
    }));
    res.querySelectorAll('[data-momento]').forEach(s => s.addEventListener('change', () => { plan.objetivos[s.dataset.momento].momento = s.value; }));
    if (T) {
      const recalcular = () => {
        const tipos = [...new Set(T.patron)];
        const pos = Number(res.querySelector('#ciclo-actual').value);
        const tipoActual = T.patron[pos], nDentro = T.patron.slice(0, pos + 1).filter(x => x === tipoActual).length;
        T.patron = tipos.flatMap(tp => Array(Number(res.querySelector(`[data-semanas="${tp}"]`).value)).fill(tp));
        // Se mantiene el turno elegido para esta semana dentro del nuevo ciclo.
        const nuevaPos = T.patron.indexOf(tipoActual) + Math.min(nDentro, T.patron.filter(x => x === tipoActual).length) - 1;
        T.referencia = addDays(inicioCiclo(T, hoy), -7 * nuevaPos);
        plan.disponibilidad = T.disponibilidad[T.patron[nuevaPos]];
        mostrarPropuesta(plan);
      };
      res.querySelectorAll('[data-semanas]').forEach(s => s.addEventListener('change', recalcular));
      res.querySelector('#ciclo-actual').addEventListener('change', recalcular);
    }

    res.querySelector('#descartar').addEventListener('click', close);
    res.querySelector('#ajuste').addEventListener('submit', e => {
      e.preventDefault();
      const cambio = e.target.cambio.value.trim();
      if (!cambio) return toast('Escribe qué quieres corregir.');
      ajustes.push(cambio);
      crear();
    });
    res.querySelector('#aplicar').addEventListener('click', async e => {
      const elegido = (grupo, i = 0) => res.querySelector(`.elegir[data-grupo="${grupo}"][data-i="${i}"]`)?.checked;
      e.target.disabled = true; e.target.textContent = 'Guardando…';
      try {
        if (ajustes.length) await kvSet('miSituacion', { texto: `${ta.value.trim()}\n${ajustes.join('\n')}`, fecha: hoyISO() });
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

const mayus = s => s.charAt(0).toUpperCase() + s.slice(1);

async function aplicar(plan, elegido, generar) {
  const hoy = hoyISO();
  if (elegido('perfil')) {
    const p = await getProfile();
    await saveProfile({ ...p, ...plan.perfil });
  }
  if (plan.disponibilidad && elegido('disponibilidad')) {
    await saveDisponibilidad(plan.disponibilidad);
    await savePrefs({ ...(await getPrefs()), ...plan.preferencias });
    await saveTurnos(plan.turnos || null);
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
    const [goalsAhora, disponibilidad, prefs, settings] = await Promise.all([db.all('goals'), dispPorFecha(), getPrefs(), getSettings()]);
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

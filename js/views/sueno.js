// Piezas de pantalla del sueño: valoración, plan gradual y consejos (las usan el cuestionario y el Perfil).
import { kvGet, kvSet } from '../db.js';
import { esc, sheet, hoyISO, opciones, addDays, fmtFecha } from '../util.js';
import { getAjustesSueno } from '../datos.js';
import { horasTxt, acostarObjetivo, RITMO_HORARIO } from '../sueno.js';

const COLOR = { poco: 'rojo', justo: 'naranja', bien: 'verde', mucho: 'naranja' };
const corta = f => fmtFecha(f, { day: 'numeric', month: 'short' });

/**
 * Un perfil de sueño: cuánto duermes y a qué hora, si es lo mejor para ti, el plan semana a semana y consejos.
 * `mostrarPlan`: enseñar la tabla del plan; `inicio`: día en que empieza (para poner la fecha de cada semana).
 */
export function perfilSuenoHTML(p, { semanaActual = 0, mostrarPlan = true, inicio = null } = {}) {
  const { plan } = p;
  const mejorable = plan.pasos.length > 0;
  const nivel = p.horario?.retrasado && p.nivel === 'bien' ? 'justo' : p.nivel; // buen número de horas, pero mal horario
  const intro = plan.tipo === 'horario'
    ? `Vamos a mover tu horario poco a poco hasta acostarte sobre las <b>${plan.destino.acostar}</b> y levantarte sobre las <b>${plan.destino.levantar}</b>, unos ${RITMO_HORARIO} minutos más pronto cada semana (más o menos 15 minutos cada 2-3 días), con mucha luz por la mañana. Los cambios bruscos no funcionan: el cuerpo se adapta despacio.`
    : `Levántate siempre a las <b>${p.levantar}</b> y adelanta la hora de acostarte <b>30 minutos cada semana</b>. Los cambios pequeños se mantienen mejor que los bruscos. Meta: <b>${horasTxt(plan.objetivo)}</b>.`;
  return `<div class="card sueno nivel-${nivel}">
    <div class="fila sep"><b>😴 ${esc(p.etiqueta)}</b><span class="badge ${COLOR[nivel]}">${horasTxt(plan.actual)}</span></div>
    <p class="mini" style="margin:2px 0 8px">Te acuestas a las <b>${p.acostar}</b> y te levantas a las <b>${p.levantar}</b>.</p>
    <p style="margin:0 0 6px"><b>${p.icono} ${esc(p.titulo)}</b></p>
    <p class="sub" style="margin:0 0 8px">${esc(p.texto)}</p>
    ${p.horario?.retrasado ? `<p style="margin:10px 0 6px"><b>${p.horario.icono} ${esc(p.horario.titulo)}</b></p><p class="sub" style="margin:0 0 8px">${esc(p.horario.texto)}</p>` : ''}
    ${mejorable && mostrarPlan ? `
      <p style="margin:10px 0 6px"><b>Plan para mejorarlo poco a poco</b></p>
      <p class="mini" style="margin:0 0 6px">${intro}</p>
      <ol class="plan-sueno">${plan.pasos.map(s => `<li class="${s.semana === semanaActual ? 'ahora' : ''}"><span>Semana ${s.semana}</span>${inicio ? ` <span class="mini">(desde el ${corta(addDays(inicio, 7 * (s.semana - 1)))})</span><br>` : ' '}acuéstate a las <b>${s.acostar}</b> · levántate a las <b>${s.levantar}</b> <span class="mini">(${horasTxt(s.durMin)})</span>${s.semana === semanaActual ? ' 👈 esta semana' : ''}</li>`).join('')}</ol>` : ''}
    <details style="margin-top:8px"><summary><b>Consejos para dormir mejor</b></summary>
      <ul class="consejos">${p.consejos.map(c => `<li><span>${c.emoji}</span><div><b>${esc(c.titulo)}</b><div class="mini">${esc(c.detalle)}</div></div></li>`).join('')}</ul>
      <p class="mini">Son pautas generales de expertos en sueño. Si sigues muy cansado, roncas mucho o tienes pausas al respirar, consúltalo con tu médico.</p>
    </details>
  </div>`;
}

/** Tarjeta de «Perfil»: lo que toca esta semana y acceso al plan completo (o invitación a crearlo). */
export async function tarjetaSuenoHTML() {
  const plan = await kvGet('planSueno');
  if (!plan?.perfiles?.length) return `<div class="card">
    <h3 style="margin-bottom:6px">😴 Tu sueño</h3>
    <p class="mini">Aún no tienes un plan de sueño. Dormir bien y a buena hora es la base de todo lo demás: contesta unas preguntas y te propongo cómo mejorarlo poco a poco.</p>
    <div class="acciones"><button class="btn sec chico" id="mejorar-sueno">Mejorar mi sueño</button></div></div>`;
  const hoy = hoyISO();
  const aj = await getAjustesSueno();
  const filas = plan.perfiles.map(p => {
    const o = acostarObjetivo(plan, p.clave, hoy);
    const texto = !o.total ? `Duermes ${horasTxt(p.plan.actual)}: mantén tus horas`
      : o.pendiente ? `Tu plan empieza el ${corta(plan.inicio)}`
      : `Semana ${o.semana} de ${o.total}: acuéstate a las <b>${o.acostar}</b> y levántate a las <b>${o.levantar}</b>`;
    return `<li><div class="grow"><div class="t">${esc(p.etiqueta)}</div><div class="mini">${texto}</div></div>
      <span class="badge ${COLOR[p.nivel]}">${horasTxt(p.plan.actual)}</span></li>`;
  }).join('');
  return `<div class="card">
    <h3 style="margin-bottom:6px">😴 Tu sueño</h3>
    <div class="card plano" style="box-shadow:none;margin:0"><ul class="lista">${filas}</ul></div>
    <div class="acciones"><button class="btn sec chico" id="ver-sueno">Ver mi plan de sueño</button></div>
    <h4 style="margin:16px 0 6px">Avisos y horario</h4>
    <label class="campo"><span>Aviso para prepararte a dormir</span>
      <select id="sueno-ant">${opciones([15, 30, 45, 60].map(m => [m, `${m} minutos antes de acostarte`]), aj.antelacion)}</select></label>
    <label class="switch"><span>Que suene como alarma</span><input type="checkbox" id="sueno-alarma" ${aj.alarma ? 'checked' : ''}></label>
    <label class="switch"><span>Ajustar mi horario al plan</span><input type="checkbox" id="sueno-ajustar" ${aj.ajustarHorario ? 'checked' : ''}></label>
    <p class="mini">Con el horario ajustado, tus objetivos dejan de ocupar la media hora previa a la hora de acostarte de cada semana del plan. Se aplica a los horarios que se creen a partir de ahora.</p>
  </div>`;
}

export async function abrirPlanSueno() {
  const plan = await kvGet('planSueno');
  if (!plan?.perfiles?.length) return;
  const hoy = hoyISO();
  sheet('😴 Tu plan de sueño', plan.perfiles.map(p => perfilSuenoHTML(p, { semanaActual: acostarObjetivo(plan, p.clave, hoy)?.semana || 0, inicio: plan.inicio })).join(''));
}

/** Guarda los ajustes de sueño al cambiarlos en la tarjeta de «Perfil». */
export function conectarAjustesSueno(root, avisar) {
  const guardar = async () => {
    await kvSet('ajustesSueno', {
      antelacion: Number(root.querySelector('#sueno-ant').value),
      alarma: root.querySelector('#sueno-alarma').checked,
      ajustarHorario: root.querySelector('#sueno-ajustar').checked,
    });
    avisar('✅ Ajustes de sueño guardados');
  };
  root.querySelectorAll('#sueno-ant, #sueno-alarma, #sueno-ajustar').forEach(el => el.addEventListener('change', guardar));
}

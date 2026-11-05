// Piezas de pantalla del sueño: valoración, plan gradual y consejos (las usan el cuestionario y el Perfil).
import { kvGet, kvSet } from '../db.js';
import { esc, sheet, hoyISO, opciones } from '../util.js';
import { getAjustesSueno } from '../datos.js';
import { horasTxt, acostarObjetivo } from '../sueno.js';

const COLOR = { poco: 'rojo', justo: 'naranja', bien: 'verde', mucho: 'naranja' };

/** Un perfil de sueño: cuánto duermes, si es suficiente, el plan semana a semana y consejos. */
export function perfilSuenoHTML(p, { semanaActual = 0 } = {}) {
  const { plan } = p;
  return `<div class="card sueno nivel-${p.nivel}">
    <div class="fila sep"><b>😴 ${esc(p.etiqueta)}</b><span class="badge ${COLOR[p.nivel]}">${horasTxt(plan.actual)}</span></div>
    <p class="mini" style="margin:2px 0 8px">Te acuestas a las <b>${p.acostar}</b> y te levantas a las <b>${p.levantar}</b>.</p>
    <p style="margin:0 0 6px"><b>${p.icono} ${esc(p.titulo)}</b></p>
    <p class="sub" style="margin:0 0 8px">${esc(p.texto)}</p>
    ${plan.pasos.length ? `
      <p style="margin:10px 0 6px"><b>Plan para mejorarlo poco a poco</b></p>
      <p class="mini" style="margin:0 0 6px">Levántate siempre a las <b>${p.levantar}</b> y adelanta la hora de acostarte <b>30 minutos cada semana</b>. Los cambios pequeños se mantienen mejor que los bruscos. Meta: <b>${horasTxt(plan.objetivo)}</b>.</p>
      <ol class="plan-sueno">${plan.pasos.map(s => `<li class="${s.semana === semanaActual ? 'ahora' : ''}"><span>Semana ${s.semana}</span> acuéstate a las <b>${s.acostar}</b> <span class="mini">(${horasTxt(s.durMin)})</span>${s.semana === semanaActual ? ' 👈 esta semana' : ''}</li>`).join('')}</ol>` : ''}
    <details style="margin-top:8px"><summary><b>Consejos para dormir mejor</b></summary>
      <ul class="consejos">${p.consejos.map(c => `<li><span>${c.emoji}</span><div><b>${esc(c.titulo)}</b><div class="mini">${esc(c.detalle)}</div></div></li>`).join('')}</ul>
      <p class="mini">Son pautas generales de expertos en sueño. Si sigues muy cansado, roncas mucho o tienes pausas al respirar, consúltalo con tu médico.</p>
    </details>
  </div>`;
}

/** Tarjeta de «Perfil»: la hora de acostarte esta semana y acceso al plan completo. */
export async function tarjetaSuenoHTML() {
  const plan = await kvGet('planSueno');
  if (!plan?.perfiles?.length) return '';
  const hoy = hoyISO();
  const aj = await getAjustesSueno();
  const filas = plan.perfiles.map(p => {
    const o = acostarObjetivo(plan, p.clave, hoy);
    return `<li><div class="grow"><div class="t">${esc(p.etiqueta)}</div>
      <div class="mini">${o.alDia ? `Duermes ${horasTxt(p.plan.actual)}: mantén tu hora (${p.acostar})` : `Semana ${o.semana} de ${o.total}: acuéstate a las <b>${o.acostar}</b>`}</div></div>
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
  sheet('😴 Tu plan de sueño', plan.perfiles.map(p => perfilSuenoHTML(p, { semanaActual: acostarObjetivo(plan, p.clave, hoy)?.semana || 0 })).join(''));
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

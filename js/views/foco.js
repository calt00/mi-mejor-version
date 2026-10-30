// Modo concentración: temporizador a pantalla completa para el bloque actual.
// El final se guarda en kv «foco» para seguir donde ibas si iOS pausa la app.
import { db, kvGet, kvSet } from '../db.js';
import { esc, parseISODate, toMin, refrescar, toast } from '../util.js';
import { frasesLocales } from '../frases.js';
import { marcarBloque } from '../rutinas.js';

const TRABAJO_MIN = 25, DESCANSO_MIN = 5;
let abierto = null; // { capa, intervalo, wakeLock }

const finDelBloque = b => { const d = parseISODate(b.fecha); d.setMinutes(toMin(b.fin)); return d.getTime(); };
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

async function pantallaEncendida() {
  try { if (abierto && 'wakeLock' in navigator) abierto.wakeLock = await navigator.wakeLock.request('screen'); } catch { /* sin soporte */ }
}

function cerrar() {
  if (!abierto) return;
  clearInterval(abierto.intervalo);
  abierto.wakeLock?.release?.().catch(() => {});
  abierto.capa.remove();
  document.body.classList.remove('no-scroll');
  document.removeEventListener('visibilitychange', alVolver);
  abierto = null;
  refrescar();
}

function alVolver() { if (!document.hidden) { pantallaEncendida(); abierto?.tick(); } }

function capaBase() {
  if (abierto) cerrar();
  const capa = document.createElement('div');
  capa.className = 'foco';
  capa.setAttribute('role', 'dialog');
  capa.setAttribute('aria-modal', 'true');
  document.body.appendChild(capa);
  document.body.classList.add('no-scroll');
  abierto = { capa };
  return capa;
}

/** Abre la pantalla para elegir el modo y empezar. */
export function abrirFoco(b) {
  const quedanMin = Math.round((finDelBloque(b) - Date.now()) / 60000);
  const capa = capaBase();
  capa.innerHTML = `
    <button class="btn-icon foco-cerrar" aria-label="Cerrar">✕</button>
    <div class="foco-centro">
      <div class="mini">🎯 Modo concentración</div>
      <h2 class="foco-titulo">${esc(b.titulo)}</h2>
      <p class="sub">Deja el móvil boca abajo y céntrate solo en esto. Al terminar, el bloque se marcará como hecho.</p>
      <div class="foco-opciones">
        <button class="btn ancho" data-modo="bloque" ${quedanMin > 0 ? '' : 'disabled'}>⏳ Hasta el final del bloque (${Math.max(0, quedanMin)} min)</button>
        <button class="btn sec ancho" data-modo="pomodoro">🍅 Pomodoro: ${TRABAJO_MIN} min + ${DESCANSO_MIN} de descanso</button>
      </div>
      <p class="mini">Si sales de la app, el tiempo sigue contando. Para que suene aunque la app esté cerrada, usa la alarma del Atajo.</p>
    </div>`;
  capa.querySelector('.foco-cerrar').addEventListener('click', cerrar);
  capa.querySelectorAll('[data-modo]').forEach(btn => btn.addEventListener('click', async () => {
    const modo = btn.dataset.modo;
    const finMs = modo === 'bloque' ? finDelBloque(b) : Date.now() + TRABAJO_MIN * 60000;
    const estado = { bloqueId: b.id, titulo: b.titulo, modo, fase: 'trabajo', empezado: Date.now(), inicioMs: Date.now(), finMs, finBloqueMs: finDelBloque(b), pomodoros: 0 };
    await kvSet('foco', estado);
    temporizador(estado);
  }));
}

/** Si había un temporizador en marcha (la app se cerró), lo retoma. */
export async function retomarFoco() {
  const estado = await kvGet('foco');
  if (estado && !abierto) temporizador(estado);
}

function temporizador(estado) {
  const capa = capaBase();
  capa.innerHTML = `
    <div class="foco-centro">
      <div class="mini" id="fase"></div>
      <h2 class="foco-titulo">${esc(estado.titulo)}</h2>
      <div class="foco-anillo" id="anillo"><span class="foco-tiempo" id="tiempo">--:--</span></div>
      <p class="sub" id="pie"></p>
      <div class="foco-opciones">
        <button class="btn verde ancho" id="hecho">✓ Ya he terminado</button>
        <button class="btn gris ancho" id="salir">Salir sin terminar</button>
      </div>
    </div>`;
  const $ = s => capa.querySelector(s);

  const tick = async () => {
    const ahora = Date.now();
    if (ahora >= estado.finMs) {
      if (estado.modo === 'pomodoro') {
        navigator.vibrate?.([200, 100, 200]);
        if (estado.fase === 'trabajo') {
          estado.pomodoros++;
          Object.assign(estado, { fase: 'descanso', inicioMs: ahora, finMs: ahora + DESCANSO_MIN * 60000 });
          toast(`🍅 ¡Pomodoro ${estado.pomodoros} hecho! Descansa ${DESCANSO_MIN} minutos.`);
        } else if (ahora < estado.finBloqueMs) {
          Object.assign(estado, { fase: 'trabajo', inicioMs: ahora, finMs: ahora + TRABAJO_MIN * 60000 });
          toast('💪 ¡A por otro!');
        } else return terminar(estado);
        await kvSet('foco', estado);
      } else return terminar(estado);
    }
    const total = estado.finMs - estado.inicioMs;
    $('#tiempo').textContent = mmss(estado.finMs - Date.now());
    $('#anillo').style.setProperty('--p', Math.min(100, (Date.now() - estado.inicioMs) / total * 100));
    $('#anillo').classList.toggle('descanso', estado.fase === 'descanso');
    $('#fase').textContent = estado.modo === 'pomodoro'
      ? (estado.fase === 'trabajo' ? `🍅 Pomodoro ${estado.pomodoros + 1} · concentración` : '☕ Descanso')
      : '🎯 Concentración hasta el final del bloque';
    $('#pie').textContent = estado.fase === 'descanso' ? 'Levántate, estira y bebe agua.' : 'Una cosa cada vez. Tú puedes.';
  };

  abierto.tick = tick;
  abierto.intervalo = setInterval(tick, 500);
  document.addEventListener('visibilitychange', alVolver);
  pantallaEncendida();
  tick();

  $('#hecho').addEventListener('click', () => terminar(estado));
  $('#salir').addEventListener('click', async () => {
    if (!confirm('¿Salir del modo concentración? El bloque seguirá pendiente.')) return;
    await db.del('kv', 'foco');
    cerrar();
  });
}

async function terminar(estado) {
  if (!abierto || abierto.terminando) return;
  abierto.terminando = true;
  clearInterval(abierto.intervalo);
  await db.del('kv', 'foco');
  const b = await db.get('blocks', estado.bloqueId);
  if (b && !b.hecho) await marcarBloque(b, true);
  const [frase] = await frasesLocales(1);
  const min = Math.round((Math.min(Date.now(), estado.finMs) - estado.empezado) / 60000);
  navigator.vibrate?.([100, 50, 100, 50, 200]);
  abierto.capa.innerHTML = `
    <div class="foco-centro">
      <div style="font-size:64px">🎉</div>
      <h2 class="foco-titulo">¡Bloque completado!</h2>
      <p class="sub">${esc(estado.titulo)}${estado.pomodoros ? ` · ${estado.pomodoros} ${estado.pomodoros === 1 ? 'pomodoro' : 'pomodoros'}` : min > 0 ? ` · ${min} min` : ''}</p>
      <p class="nota">«${esc(frase)}»</p>
      <div class="foco-opciones"><button class="btn ancho" id="cerrar">Seguir</button></div>
    </div>`;
  abierto.capa.querySelector('#cerrar').addEventListener('click', cerrar);
}

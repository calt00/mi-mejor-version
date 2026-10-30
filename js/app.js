// Arranque de la app: navegación por pestañas, tema y modo sin conexión.
import { $, $$, hoyISO } from './util.js';
import { db, kvGet, kvSet, pedirPersistencia } from './db.js';
import { getSettings, getProfile } from './datos.js';
import * as hoy from './views/hoy.js';
import * as objetivos from './views/objetivos.js';
import * as horario from './views/horario.js';
import * as ahorro from './views/ahorro.js';
import * as asistente from './views/asistente.js';
import * as perfil from './views/perfil.js';
import * as progreso from './views/progreso.js';
import { mostrarBienvenida } from './views/bienvenida.js';
import { retomarFoco } from './views/foco.js';

const RUTAS = {
  hoy: { titulo: 'Hoy', vista: hoy },
  objetivos: { titulo: 'Objetivos', vista: objetivos },
  horario: { titulo: 'Horario', vista: horario },
  ahorro: { titulo: 'Ahorro', vista: ahorro },
  asistente: { titulo: 'Asistente', vista: asistente },
  coach: { titulo: 'Asistente', vista: asistente }, // enlaces antiguos
  perfil: { titulo: 'Perfil', vista: perfil },
  progreso: { titulo: 'Progreso', vista: progreso },
};

let rutaActual = null;
let registroSW = null;

async function render() {
  const nombre = location.hash.slice(1).split('?')[0] || 'hoy';
  const ruta = RUTAS[nombre] || RUTAS.hoy;
  const mismaRuta = rutaActual === nombre;
  const scroll = mismaRuta ? window.scrollY : 0;
  rutaActual = nombre;
  $('#titulo').textContent = ruta.titulo;
  $$('.tabs a').forEach(a => a.classList.toggle('activa', a.dataset.ruta === nombre));
  const main = $('#vista');
  try {
    await ruta.vista.render(main);
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="card vacio"><span class="ico">😵</span>Algo ha fallado al cargar esta pantalla.<br><span class="mini">${e.message}</span></div>`;
  }
  window.scrollTo(0, scroll);
  await pintarAvatar();
}

async function pintarAvatar() {
  const p = await getProfile();
  $('#avatar').textContent = p.nombre ? p.nombre.trim().charAt(0).toUpperCase() : '🙂';
}

export async function aplicarTema() {
  const { tema } = await getSettings();
  if (tema === 'claro' || tema === 'oscuro') document.documentElement.dataset.tema = tema;
  else delete document.documentElement.dataset.tema;
}

async function iniciar() {
  if (!(await kvGet('inicioApp'))) await kvSet('inicioApp', hoyISO());
  await aplicarTema();
  pedirPersistencia();
  window.addEventListener('hashchange', render);
  window.addEventListener('refrescar', render);
  window.addEventListener('tema', aplicarTema);
  // Al volver a la app tras un rato, refresca (cambia el día, el bloque actual…).
  let oculto = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { oculto = Date.now(); return; }
    registroSW?.update().catch(() => {});
    if (Date.now() - oculto > 60_000 && !document.querySelector('.sheet-back, .foco, .bienvenida')) render();
  });
  await render();
  if (!(await kvGet('bienvenidaHecha')) && !(await db.all('goals')).length) mostrarBienvenida();
  else retomarFoco();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // Si ya había una versión instalada y entra otra, se avisa para recargar.
    const habiaVersion = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (habiaVersion) avisarVersionNueva(); });
    navigator.serviceWorker.register('sw.js').then(r => { registroSW = r; }).catch(e => console.warn('Service worker:', e));
  }
}

function avisarVersionNueva() {
  if (document.querySelector('.banner-version')) return;
  const b = document.createElement('button');
  b.className = 'banner-version';
  b.innerHTML = '✨ Hay una versión nueva · <b>Actualizar</b>';
  b.addEventListener('click', () => location.reload());
  document.body.appendChild(b);
}

iniciar();

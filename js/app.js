// Arranque de la app: navegación por pestañas, tema y modo sin conexión.
import { $, $$, hoyISO } from './util.js';
import { kvGet, kvSet, pedirPersistencia } from './db.js';
import { getSettings, getProfile } from './datos.js';
import * as hoy from './views/hoy.js';
import * as objetivos from './views/objetivos.js';
import * as horario from './views/horario.js';
import * as ahorro from './views/ahorro.js';
import * as coach from './views/coach.js';
import * as perfil from './views/perfil.js';

const RUTAS = {
  hoy: { titulo: 'Hoy', vista: hoy },
  objetivos: { titulo: 'Objetivos', vista: objetivos },
  horario: { titulo: 'Horario', vista: horario },
  ahorro: { titulo: 'Ahorro', vista: ahorro },
  coach: { titulo: 'Coach', vista: coach },
  perfil: { titulo: 'Perfil', vista: perfil },
};

let rutaActual = null;

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
    if (document.hidden) oculto = Date.now();
    else if (Date.now() - oculto > 60_000 && !document.querySelector('.sheet-back')) render();
  });
  await render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service worker:', e));
  }
}

iniciar();

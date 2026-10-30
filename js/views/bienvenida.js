// Bienvenida guiada: la primera vez que se abre la app, preguntas paso a paso (sin escribir textos).
import { kvSet } from '../db.js';
import { getProfile, saveProfile } from '../datos.js';
import { esc, toast, refrescar } from '../util.js';
import { montarConfigurador } from './configurar.js';

const PASOS = ['hola', 'configurar', 'asistente', 'instalar'];

export async function mostrarBienvenida() {
  if (document.querySelector('.bienvenida')) return;
  const perfil = await getProfile();
  const datos = { nombre: perfil.nombre };
  const capa = document.createElement('div');
  capa.className = 'bienvenida';
  capa.setAttribute('role', 'dialog');
  capa.setAttribute('aria-modal', 'true');
  document.body.appendChild(capa);
  document.body.classList.add('no-scroll');
  let paso = 0;

  const terminar = async completa => {
    await kvSet('bienvenidaHecha', true);
    capa.remove();
    document.body.classList.remove('no-scroll');
    if (location.hash !== '#hoy') location.hash = '#hoy'; else refrescar();
    if (completa) toast('🎉 ¡Todo listo! Tu asistente te dirá cada día qué te toca.', 4500);
  };

  const pantalla = {
    hola: () => `
      <div class="b-ico">🌱</div>
      <h2>¡Hola! Empieza tu mejor versión</h2>
      <p class="sub">Te haré unas preguntas muy rápidas (trabajo, a qué hora descansas y qué quieres conseguir) y te organizo el horario. Solo tienes que tocar botones.</p>
      <label class="campo" style="text-align:left"><span>¿Cómo te llamas? (opcional)</span>
        <input id="b-nombre" value="${esc(datos.nombre)}" placeholder="Tu nombre" autocomplete="given-name"></label>
      <button class="btn ancho" data-sig>Empezar</button>`,
    configurar: () => '<div id="b-configurador"></div>',
    asistente: () => `
      <div class="b-ico">🤖</div>
      <h2>Tu asistente</h2>
      <p class="sub">Cada día te saludará con tu plan y, si algo se queda sin hacer, te propondrá moverlo. En la pestaña <b>Asistente</b> (y en la caja de «Hoy») también puedes escribirle:</p>
      <ul class="sub" style="text-align:left;padding-left:20px">
        <li>«¿Qué me toca hoy?»</li><li>«Ya he hecho inglés»</li><li>«Hoy no puedo» o «pásalo a mañana»</li><li>«He gastado 5 € en café»</li>
      </ul>
      <button class="btn ancho" data-sig>Siguiente</button>`,
    instalar: () => {
      const instalada = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
      return `
      <div class="b-ico">📱</div>
      <h2>${instalada ? '¡Ya la tienes instalada!' : 'Ponla en tu pantalla de inicio'}</h2>
      ${instalada ? '<p class="sub">Perfecto: se abre como una app y tus datos quedan a salvo en este iPhone.</p>' : `
      <ol class="sub" style="text-align:left;padding-left:20px">
        <li>En Safari, pulsa el botón <b>Compartir</b> (el cuadrado con la flecha ↑).</li>
        <li>Elige <b>«Añadir a pantalla de inicio»</b>.</li>
        <li>Pulsa <b>Añadir</b>. ¡Ya la tienes como una app!</li>
      </ol>`}
      <p class="mini">💾 Tus datos solo están en este móvil. La app te recordará hacer una copia de seguridad cada semana.</p>
      <button class="btn ancho" data-sig>¡Empezar a usarla!</button>`;
    },
  };

  function pintar() {
    const id = PASOS[paso];
    capa.innerHTML = `
      <div class="b-arriba">
        ${paso && id !== 'configurar' ? '<button class="btn-icon" data-atras aria-label="Atrás">‹</button>' : '<span></span>'}
        <div class="b-puntos">${PASOS.map((_, i) => `<i class="${i <= paso ? 'on' : ''}"></i>`).join('')}</div>
        <button class="b-saltar" data-saltar>Saltar</button>
      </div>
      <form class="b-cuerpo">${pantalla[id]()}</form>`;
    const form = capa.querySelector('form');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (id === 'hola') {
        datos.nombre = capa.querySelector('#b-nombre').value.trim();
        await saveProfile({ ...(await getProfile()), nombre: datos.nombre });
      }
      if (paso === PASOS.length - 1) return terminar(true);
      paso++; pintar();
    });
    if (id === 'configurar') {
      montarConfigurador(capa.querySelector('#b-configurador'), {
        alTerminar: () => { paso++; pintar(); },
        alVolver: () => { paso--; pintar(); },
      });
    }
    capa.querySelector('[data-atras]')?.addEventListener('click', () => { paso--; pintar(); });
    capa.querySelector('[data-saltar]').addEventListener('click', () => {
      if (confirm('¿Saltar la bienvenida? Podrás configurar tu plan cuando quieras desde Horario.')) terminar(false);
    });
  }
  pintar();
}

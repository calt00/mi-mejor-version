// Bienvenida guiada: primeros pasos la primera vez que se abre la app.
import { db, kvGet, kvSet } from '../db.js';
import { AREAS, getProfile, saveProfile, saveDisponibilidad } from '../datos.js';
import { esc, opciones, toast, uid, hoyISO, refrescar } from '../util.js';
import { editarDisponibilidad } from './horario.js';
import { abrirPlan } from './plan.js';

const f = (inicio, fin) => ({ inicio, fin });
const PRESETS = {
  tardes: { t: '🌆 Tardes entre semana y fines de semana', d: 'L–V 18–22 h · S–D 10–13:30 y 17–21 h',
    v: [...Array(5).fill([f('18:00', '22:00')]), [f('10:00', '13:30'), f('17:00', '21:00')], [f('10:00', '13:30'), f('17:00', '20:00')]] },
  mananas: { t: '🌅 Primera hora y tardes', d: 'L–V 7–8:30 y 18–21 h · S–D 9–13 h',
    v: [...Array(5).fill([f('07:00', '08:30'), f('18:00', '21:00')]), [f('09:00', '13:00')], [f('09:00', '13:00')]] },
  finde: { t: '🗓️ Sobre todo el fin de semana', d: 'L–V 20–22 h · S–D 10–14 y 16–20 h',
    v: [...Array(5).fill([f('20:00', '22:00')]), [f('10:00', '14:00'), f('16:00', '20:00')], [f('10:00', '14:00'), f('16:00', '20:00')]] },
};

// La app monta el plan a partir de tu texto (sin IA); también se puede rellenar paso a paso.
const CON_TEXTO = ['hola', 'situacion', 'asistente', 'instalar'];
const MANUAL = ['hola', 'nombre', 'horas', 'objetivo', 'asistente', 'instalar'];

export async function mostrarBienvenida() {
  if (document.querySelector('.bienvenida')) return;
  const [perfil, situacion] = await Promise.all([getProfile(), kvGet('miSituacion')]);
  const datos = { nombre: perfil.nombre, preset: 'tardes', objetivo: null, situacion: situacion?.texto || '', planAplicado: false };
  let PASOS = CON_TEXTO;
  const capa = document.createElement('div');
  capa.className = 'bienvenida';
  capa.setAttribute('role', 'dialog');
  capa.setAttribute('aria-modal', 'true');
  document.body.appendChild(capa);
  document.body.classList.add('no-scroll');
  let paso = 0;

  const terminar = async (completa) => {
    await kvSet('bienvenidaHecha', true);
    capa.remove();
    document.body.classList.remove('no-scroll');
    const destino = datos.planAplicado ? '#horario' : '#hoy';
    if (location.hash !== destino) location.hash = destino; else refrescar();
    if (!completa) return;
    toast(datos.planAplicado ? '🎉 ¡Todo listo! Este es tu horario de la semana.'
      : datos.objetivo ? '🎉 ¡Todo listo! Ve a Horario → «Generar semana» para planificar tu objetivo.' : '🎉 ¡Todo listo! Empieza creando tu primer objetivo.', 5000);
  };

  const pantalla = {
    hola: () => `
      <div class="b-ico">🌱</div>
      <h2>¡Hola! Empieza tu mejor versión</h2>
      <p class="sub">Esta app te ayuda a <b>cumplir tus objetivos</b>, organizar tu <b>horario</b>, <b>ahorrar</b> con tu cerdito y tener un <b>asistente</b> que te ayuda cada día.</p>
      <p class="sub">Solo tienes que <b>contarme tu situación y lo que quieres conseguir</b>, con tus palabras. La app lo entiende y organiza tus objetivos, tus horas libres (también si trabajas a turnos), tus hábitos y tu horario. Sin claves ni registros.</p>
      <button class="btn ancho" data-sig>Empezar</button>`,
    situacion: () => `
      <div class="b-ico">📝</div>
      <h2>Cuéntame tu vida</h2>
      <p class="sub">Como se lo contarías a un amigo: tu trabajo y tu horario (o tus turnos), qué días libras, cuánto tardas en llegar, a qué hora te levantas y te acuestas, qué quieres conseguir y cómo (por ejemplo, «poco a poco»)… y si quieres, tu sueldo y para qué ahorras.</p>
      <textarea id="b-situacion" style="min-height:200px" placeholder="Ej.: Trabajo de lunes a viernes de 9 a 17 h y tardo 30 min en llegar. Me levanto a las 7… Quiero sacarme el B2 de inglés antes de junio, ir al gimnasio 3 días…">${esc(datos.situacion)}</textarea>
      <button class="btn ancho" data-sig>✨ Crear mi plan</button>
      <button class="btn gris ancho" data-manual>Prefiero rellenarlo paso a paso</button>`,
    nombre: () => `
      <div class="b-ico">👋</div>
      <h2>¿Cómo te llamas?</h2>
      <p class="sub">Así tu asistente te hablará por tu nombre.</p>
      <input id="b-nombre" value="${esc(datos.nombre)}" placeholder="Tu nombre" autocomplete="given-name">
      <button class="btn ancho" data-sig>Siguiente</button>`,
    horas: () => `
      <div class="b-ico">🕒</div>
      <h2>¿Cuándo tienes tiempo libre?</h2>
      <p class="sub">Son las horas en las que la app colocará tus objetivos. Elige la que más se parezca; luego puedes afinarla.</p>
      <div class="b-opciones">${Object.entries(PRESETS).map(([k, p]) => `
        <button type="button" class="b-opcion ${datos.preset === k && !datos.personalizada ? 'activa' : ''}" data-preset="${k}"><b>${p.t}</b><span class="mini">${p.d}</span></button>`).join('')}</div>
      <button type="button" class="btn gris chico" id="personalizar">✏️ Ajustar día a día</button>
      <button class="btn ancho" data-sig>Siguiente</button>`,
    objetivo: () => `
      <div class="b-ico">🎯</div>
      <h2>Tu primer objetivo</h2>
      <p class="sub">Algo que quieras conseguir. Ej.: «Aprender inglés», «Ir al gimnasio», «Leer más».</p>
      <input id="b-titulo" value="${esc(datos.objetivo?.titulo || '')}" placeholder="¿Qué quieres conseguir?">
      <div class="grid2" style="margin-top:10px">
        <label class="campo"><span>Área</span><select id="b-area">${opciones(AREAS, datos.objetivo?.area || 'personal')}</select></label>
        <label class="campo"><span>Horas por semana</span><select id="b-horas">${opciones([1, 2, 3, 4, 5, 6, 8, 10].map(h => [h, `${h} h`]), datos.objetivo?.horasSemana || 3)}</select></label>
      </div>
      <button class="btn ancho" data-sig>Siguiente</button>
      <button class="btn gris ancho" data-saltar-paso style="margin-top:8px">Lo creo más tarde</button>`,
    asistente: () => `
      <div class="b-ico">🤖</div>
      <h2>Tu asistente</h2>
      <p class="sub">En la pestaña <b>Asistente</b> (y en la caja de «Hoy») puedes escribirle con tus palabras y lo hace al momento. Funciona sin internet:</p>
      <ul class="sub" style="text-align:left;padding-left:20px">
        <li>«¿Qué me toca hoy?»</li><li>«Ya he hecho inglés»</li><li>«Hoy no puedo» o «pásalo a mañana»</li>
        <li>«Esta semana estoy de tarde»</li><li>«He gastado 5 € en café»</li>
      </ul>
      <p class="sub">Cada día te saludará con tu plan y, si algo se queda sin hacer, te propondrá moverlo.</p>
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

  // Guarda lo del paso actual. Devuelve false si falta algo.
  async function guardarPaso(saltar = false) {
    const id = PASOS[paso];
    const val = s => capa.querySelector(s)?.value.trim() || '';
    if (id === 'nombre') {
      datos.nombre = val('#b-nombre');
      await saveProfile({ ...(await getProfile()), nombre: datos.nombre });
    }
    if (id === 'horas' && !datos.personalizada) await saveDisponibilidad(PRESETS[datos.preset].v);
    if (id === 'objetivo' && !saltar) {
      const titulo = val('#b-titulo');
      if (!titulo) { toast('Escribe tu objetivo o pulsa «Lo creo más tarde».'); return false; }
      const g = { id: datos.objetivo?.id || uid(), titulo, porque: '', area: val('#b-area'), prioridad: 3, horasSemana: Number(val('#b-horas')),
        sesionMin: null, momento: 'cualquiera', fechaLimite: '', creado: hoyISO(), archivado: false };
      await db.put('goals', g);
      datos.objetivo = g;
    }
    if (id === 'situacion') {
      datos.situacion = val('#b-situacion');
      if (datos.situacion.length < 20) { toast('Cuéntame un poco más sobre ti y lo que quieres conseguir.'); return false; }
      // El plan se revisa en una ventana encima; al aplicarlo se pasa al siguiente paso.
      abrirPlan({ texto: datos.situacion, autoEnviar: true, onAplicado: () => { datos.planAplicado = true; paso++; pintar(); } });
      return false;
    }
    return true;
  }

  function pintar() {
    const id = PASOS[paso];
    capa.innerHTML = `
      <div class="b-arriba">
        ${paso ? '<button class="btn-icon" data-atras aria-label="Atrás">‹</button>' : '<span></span>'}
        <div class="b-puntos">${PASOS.map((_, i) => `<i class="${i <= paso ? 'on' : ''}"></i>`).join('')}</div>
        <button class="b-saltar" data-saltar>Saltar</button>
      </div>
      <form class="b-cuerpo">${pantalla[id]()}</form>`;
    const form = capa.querySelector('form');
    form.querySelector('input')?.focus({ preventScroll: true });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!(await guardarPaso())) return;
      if (paso === PASOS.length - 1) return terminar(true);
      paso++; pintar();
    });
    capa.querySelector('[data-saltar-paso]')?.addEventListener('click', async e => {
      e.preventDefault();
      await guardarPaso(true);
      paso++; pintar();
    });
    capa.querySelector('[data-manual]')?.addEventListener('click', e => {
      e.preventDefault();
      PASOS = MANUAL;
      pintar();
    });
    capa.querySelector('[data-atras]')?.addEventListener('click', () => { paso--; pintar(); });
    capa.querySelector('[data-saltar]').addEventListener('click', () => {
      if (confirm('¿Saltar la bienvenida? Podrás repetirla desde Perfil.')) terminar(false);
    });
    capa.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => { datos.preset = b.dataset.preset; datos.personalizada = false; pintar(); }));
    capa.querySelector('#personalizar')?.addEventListener('click', async () => {
      // Parte de la opción elegida; lo que guardes en el editor ya no se sobrescribe.
      if (!datos.personalizada) await saveDisponibilidad(PRESETS[datos.preset].v);
      datos.personalizada = true;
      editarDisponibilidad();
    });
  }
  pintar();
}

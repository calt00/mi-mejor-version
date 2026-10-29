// Bienvenida guiada: primeros pasos la primera vez que se abre la app.
import { db, kvSet } from '../db.js';
import { AREAS, getProfile, saveProfile, getSettings, saveSettings, saveDisponibilidad } from '../datos.js';
import { esc, opciones, toast, uid, hoyISO, refrescar } from '../util.js';
import { probarConexion } from '../coach.js';
import { editarDisponibilidad } from './horario.js';

const f = (inicio, fin) => ({ inicio, fin });
const PRESETS = {
  tardes: { t: '🌆 Tardes entre semana y fines de semana', d: 'L–V 18–22 h · S–D 10–13:30 y 17–21 h',
    v: [...Array(5).fill([f('18:00', '22:00')]), [f('10:00', '13:30'), f('17:00', '21:00')], [f('10:00', '13:30'), f('17:00', '20:00')]] },
  mananas: { t: '🌅 Primera hora y tardes', d: 'L–V 7–8:30 y 18–21 h · S–D 9–13 h',
    v: [...Array(5).fill([f('07:00', '08:30'), f('18:00', '21:00')]), [f('09:00', '13:00')], [f('09:00', '13:00')]] },
  finde: { t: '🗓️ Sobre todo el fin de semana', d: 'L–V 20–22 h · S–D 10–14 y 16–20 h',
    v: [...Array(5).fill([f('20:00', '22:00')]), [f('10:00', '14:00'), f('16:00', '20:00')], [f('10:00', '14:00'), f('16:00', '20:00')]] },
};

const PASOS = ['hola', 'nombre', 'horas', 'objetivo', 'gemini', 'instalar'];

export async function mostrarBienvenida() {
  if (document.querySelector('.bienvenida')) return;
  const [perfil, settings] = await Promise.all([getProfile(), getSettings()]);
  const datos = { nombre: perfil.nombre, preset: 'tardes', objetivo: null, apiKey: settings.apiKey };
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
    if (location.hash !== '#hoy' && location.hash) location.hash = '#hoy'; else refrescar();
    if (completa) toast(datos.objetivo ? '🎉 ¡Todo listo! Ve a Horario → «Generar semana» para planificar tu objetivo.' : '🎉 ¡Todo listo! Empieza creando tu primer objetivo.', 5000);
  };

  const pantalla = {
    hola: () => `
      <div class="b-ico">🌱</div>
      <h2>¡Hola! Empieza tu mejor versión</h2>
      <p class="sub">Esta app te ayuda a <b>cumplir tus objetivos</b>, organizar tu <b>horario</b>, <b>ahorrar</b> con tu cerdito y tener un <b>coach</b> que te conoce.</p>
      <p class="sub">Te haré 4 preguntas rápidas para dejarla preparada. Tardas 2 minutos.</p>
      <button class="btn ancho" data-sig>Empezar</button>`,
    nombre: () => `
      <div class="b-ico">👋</div>
      <h2>¿Cómo te llamas?</h2>
      <p class="sub">Así tu coach te hablará por tu nombre.</p>
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
    gemini: () => `
      <div class="b-ico">🤖</div>
      <h2>Activa tu coach (gratis)</h2>
      <p class="sub">El coach usa Gemini, la IA gratuita de Google. Necesitas una «clave» (API key):</p>
      <ol class="sub" style="text-align:left;padding-left:20px">
        <li>Abre <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> e inicia sesión con tu cuenta de Google.</li>
        <li>Pulsa «Create API key» y cópiala.</li>
        <li>Vuelve aquí y pégala abajo.</li>
      </ol>
      <input id="apiKey" type="password" value="${esc(datos.apiKey)}" placeholder="AIza…" autocomplete="off" autocapitalize="off" spellcheck="false">
      <div class="acciones" style="justify-content:center"><button type="button" class="btn sec chico" id="probar">🔌 Probar</button></div>
      <button class="btn ancho" data-sig>Siguiente</button>
      <button class="btn gris ancho" data-saltar-paso style="margin-top:8px">Ahora no</button>`,
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
    if (id === 'gemini' && !saltar && val('#apiKey')) {
      datos.apiKey = val('#apiKey');
      await saveSettings({ ...(await getSettings()), apiKey: datos.apiKey });
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
    capa.querySelector('#probar')?.addEventListener('click', async e => {
      const key = capa.querySelector('#apiKey').value.trim();
      if (!key) return toast('Pega primero tu clave.');
      await saveSettings({ ...(await getSettings()), apiKey: key });
      datos.apiKey = key;
      e.target.disabled = true; e.target.textContent = 'Probando…';
      try { toast(`✅ ${await probarConexion()}`, 3500); }
      catch (err) { toast(`❌ ${err.message}`, 5000); }
      finally { e.target.disabled = false; e.target.textContent = '🔌 Probar'; }
    });
  }
  pintar();
}

// Pantallas de tu huevo y tu compañero: el círculo de «Hoy», elegir huevo, el detalle y la eclosión con su nombre.
import { db, kvGet, kvSet } from '../db.js';
import { esc, sheet, toast, refrescar, hoyISO, fmtFecha } from '../util.js';
import { HUEVOS, huevoPorId, fraseAlTocar, estadoHuevo, etapaCriatura } from '../huevo.js';
import { progresoDiario } from '../progreso.js';
import { huevoSVG, huevoMisterioSVG, huevoMitadesSVG, criaturaSVG } from '../criaturas.js';

export const getHuevo = () => kvGet('huevo', null);
const guardar = huevo => kvSet('huevo', huevo);

const estrellas = n => '🔥'.repeat(n) + '<span style="opacity:.25">' + '🔥'.repeat(5 - n) + '</span>';
const num = n => String(n).replace('.', ',');

/** Lo que va dentro del círculo de «Hoy»: el huevo, la criatura o un huevo por elegir. */
export function huevoCentroHTML(estado, { completo = false } = {}) {
  const dibujo = !estado ? huevoMisterioSVG()
    : estado.eclosionado ? criaturaSVG(estado.def.id, estado.etapaCriatura, estado.humor)
    : huevoSVG(estado.def.id, estado.etapaHuevo);
  const nombre = estado?.eclosionado ? (estado.nombre || 'Sin nombre') : estado ? `Huevo ${estado.def.nombre}` : 'Elige tu huevo';
  return `<button type="button" class="huevo-btn ${completo ? 'completo' : ''} ${!estado ? 'por-elegir' : ''}" id="huevo" aria-label="${esc(nombre)}">${dibujo}<span class="huevo-nombre">${esc(nombre)}</span></button>`;
}

/** Efecto al tocar el huevo o la criatura: salta/se mueve y dice algo (sin decir nunca qué es). */
function reaccionar(contenedor, estado, { burbuja = contenedor, frase = null } = {}) {
  const svg = contenedor.querySelector('svg');
  if (!svg) return;
  svg.classList.remove('tocado'); void svg.getBoundingClientRect(); svg.classList.add('tocado');
  navigator.vibrate?.(estado?.eclosionado ? 18 : [14, 40, 14]);
  burbuja.querySelector('.huevo-frase')?.remove();
  const g = document.createElement('div');
  g.className = 'huevo-frase';
  g.textContent = frase || (estado ? fraseAlTocar(estado) : 'Toca para elegir tu huevo.');
  burbuja.appendChild(g);
  setTimeout(() => g.remove(), 2600);
}

// Al marcar algo como hecho se avisa aquí; «Hoy» se vuelve a pintar y entonces el huevo reacciona.
let reaccionPedida = 0;
export const pedirReaccion = () => { reaccionPedida = Date.now(); };

const AGRADECE_HUEVO = ['¡Lo has calentado un poquito!', 'Algo se movió dentro… ¡gracias!', 'Late más fuerte gracias a ti.', 'Se acurruca en su calor.'];
const AGRADECE_CRIATURA = ['¡Da un saltito de alegría!', 'Te mira orgulloso.', '¡Bate las alas contento!', 'Hace un sonidito feliz.'];

/** Tras pintar «Hoy»: si acabas de marcar algo, el huevo (o tu compañero) reacciona; si has completado el día, lo festeja. */
export function aplicarReaccion(root, estado, { completo = false } = {}) {
  const reciente = Date.now() - reaccionPedida < 8000;
  reaccionPedida = 0;
  const huevo = root.querySelector('#huevo');
  if (!reciente || !huevo) return;
  const lista = estado?.eclosionado ? AGRADECE_CRIATURA : AGRADECE_HUEVO;
  const frase = completo ? (estado?.eclosionado ? '¡Día completo! Está felicísimo. 🎉' : '¡Día completo! El huevo brilla de calor. 🔥') : lista[Math.floor(Math.random() * lista.length)];
  const hero = root.querySelector('.hero-dia') || huevo;
  setTimeout(() => {
    reaccionar(huevo, estado, { burbuja: hero, frase });
    if (completo) { hero.insertAdjacentHTML('beforeend', chispas()); setTimeout(() => hero.querySelector('.chispas')?.remove(), 1800); }
  }, 250);
}

/** Conecta el huevo del círculo: tocarlo abre su pantalla (o la de elegir uno). */
export function conectarHuevo(root, estado) {
  root.querySelector('#huevo')?.addEventListener('click', () => (estado ? abrirHuevo(estado) : abrirElegirHuevo()));
}

// ---------------------------------------------------------------------------------------------------
/** Elegir huevo: cinco, cada uno más difícil. No se dice qué hay dentro. */
export async function abrirElegirHuevo() {
  const actual = await getHuevo();
  const { el, close } = sheet('🥚 Elige tu huevo', `
    <p class="sub">Cada día que cumplas lo suficiente, lo calentarás. Cuanto más difícil, más tardará en abrirse… y más especial será lo que salga. No te diré qué hay dentro.</p>
    ${actual ? `<div class="aviso">${actual.eclosion ? 'Tu compañero actual pasará a «Tus compañeros» con la etapa que tenga, y empiezas de cero con el nuevo huevo.' : 'Si eliges otro huevo, empiezas de cero con él.'}</div>` : ''}
    <div class="huevos-lista">${HUEVOS.map(h => `
      <button type="button" class="huevo-opcion" data-elegir="${h.id}">
        <div class="hv">${huevoSVG(h.id, 0)}</div>
        <div class="datos"><b>${esc(h.nombre)}</b>
          <div class="mini">Dificultad ${estrellas(h.dificultad)}</div>
          <div class="mini">Se abre tras unos <b>${h.requisito} días buenos</b> (cumpliendo al menos el ${h.umbral} % del día).</div>
          <div class="mini" style="margin-top:4px"><em>${esc(h.frase)}</em></div></div></button>`).join('')}</div>`);
  el.querySelectorAll('[data-elegir]').forEach(b => b.addEventListener('click', () => confirmarElegir(b.dataset.elegir, close)));
}

function confirmarElegir(id, cerrarLista) {
  const h = huevoPorId(id);
  const { el, close } = sheet(`¿Empezar con ${h.nombre}?`, `
    <div class="centro">${huevoSVG(h.id, 0).replace('huevo-svg', 'huevo-svg grande')}</div>
    <p class="sub centro">Empiezas hoy. Se abrirá tras unos <b>${h.requisito} días buenos</b>, cumpliendo al menos el <b>${h.umbral} %</b> de tu día. Los días libres no cuentan ni te restan.</p>
    <div class="acciones"><button class="btn gris" id="no">Volver</button><button class="btn" id="si">🥚 Empezar con este huevo</button></div>`);
  el.querySelector('#no').addEventListener('click', close);
  el.querySelector('#si').addEventListener('click', async () => {
    const anterior = await getHuevo();
    const coleccion = [...(anterior?.coleccion || []), ...(anterior?.eclosion ? [{ id: anterior.id, nombre: anterior.nombre, eclosion: anterior.eclosion, etapa: etapaCriatura(anterior.pico || 0, huevoPorId(anterior.id)?.requisito || 7) }] : [])];
    await guardar({ id, inicio: hoyISO(), eclosion: null, nombre: '', pico: 0, coleccion });
    close(); cerrarLista(); refrescar();
    toast(`🥚 ${h.nombre} empieza a calentarse. ¡Cuídalo cada día!`, 3500);
  });
}

// ---------------------------------------------------------------------------------------------------
/** La pantalla de tu huevo (o de tu compañero): estado, cómo funciona y qué falta. */
export async function abrirHuevo(estado) {
  const huevo = await getHuevo();
  const { def } = estado;
  const dibujo = estado.eclosionado ? criaturaSVG(def.id, estado.etapaCriatura, estado.humor) : huevoSVG(def.id, estado.etapaHuevo);
  const sig = estado.siguiente;
  const cuerpo = estado.eclosionado ? `
      <h2 class="centro" style="margin:6px 0 0">${esc(estado.nombre || 'Sin nombre')}</h2>
      <div class="centro"><button class="btn gris chico" id="renombrar" style="margin-top:6px">✏️ ${estado.nombre ? 'Cambiar nombre' : 'Ponerle nombre'}</button></div>
      <p class="sub centro" style="margin-top:10px">${{ feliz: 'Está radiante: lo has hecho muy bien estos días. 🌟', normal: 'Está bien. Con un buen día se alegrará.', dormido: 'Está medio dormido: ha tenido unos días flojos. Un buen día lo despierta.' }[estado.humor]}</p>
      <div class="card"><div class="fila sep"><b>${['', 'Cría', 'Joven', 'Adulto'][estado.etapaCriatura]}</b><span class="mini">etapa ${estado.etapaCriatura} de 3</span></div>
        ${sig ? `<div class="barra" style="margin:8px 0 4px"><i style="width:${Math.min(100, Math.round((estado.pico - sig.desde) / (sig.hasta - sig.desde) * 100))}%"></i></div>
          <div class="mini">Va creciendo con cada día bueno: calor ${num(estado.pico)} de ${sig.hasta} para la siguiente etapa.</div>`
          : '<div class="mini" style="margin-top:6px">Ha alcanzado su forma completa. ¡Es todo un campeón! 🏆</div>'}</div>
      <p class="mini">Nació el ${esc(fmtFecha(huevo.eclosion, { day: 'numeric', month: 'long' }))}. Cada día que cumples el ${def.umbral} % o más lo mantiene fuerte; un día flojo lo entristece, pero nunca retrocede.</p>
      ${estado.etapaCriatura >= 3 ? '<div class="acciones"><button class="btn sec" id="otro">🥚 Empezar con otro huevo</button></div>' : ''}`
    : `
      <h2 class="centro" style="margin:6px 0 0">Huevo ${esc(def.nombre)}</h2>
      <p class="sub centro">${esc(def.frase)}</p>
      <div class="card"><div class="fila sep"><b>Calor</b><span class="mini">${num(estado.calor)} de ${def.requisito}</span></div>
        <div class="barra" style="margin:8px 0 4px"><i style="width:${Math.round(estado.fraccion * 100)}%"></i></div>
        <div class="mini">${estado.faltan <= 1 ? '¡Está a punto de abrirse!' : `Si sigues así, se abrirá en unos <b>${estado.faltan} días</b>.`}</div></div>
      <div class="regla" style="margin-bottom:12px">
        <div><b>${estado.buenos}</b><span class="mini">días buenos</span></div>
        <div><b>${estado.racha}</b><span class="mini">racha</span></div>
        <div><b>${estado.malos}</b><span class="mini">días flojos</span></div></div>
      <div class="nota"><b>Cómo se calienta:</b> cada día que cumples el <b>${def.umbral} %</b> o más suma 1 de calor, y si encadenas días buenos suma hasta el doble. Un día flojo lo enfría medio punto. Los días libres no cuentan ni restan.</div>
      <div class="acciones"><button class="btn gris chico" id="cambiar">Cambiar de huevo</button></div>`;
  const coleccion = (huevo.coleccion || []).length ? `<h3 style="margin:18px 4px 8px">Tus compañeros</h3><div class="coleccion">${huevo.coleccion.map(c => `<div class="col-item">${criaturaSVG(c.id, c.etapa || 3, 'feliz')}<b>${esc(c.nombre || 'Sin nombre')}</b></div>`).join('')}</div>` : '';
  const { el, close } = sheet(estado.eclosionado ? '🌟 Tu compañero' : '🥚 Tu huevo', `<div class="huevo-escena" id="escena">${dibujo}</div>${cuerpo}${coleccion}`);
  const escena = el.querySelector('#escena');
  escena.addEventListener('click', () => reaccionar(escena, estado));
  el.querySelector('#cambiar')?.addEventListener('click', () => { if (confirm('Si cambias de huevo, empiezas de cero con el nuevo. ¿Seguro?')) { close(); abrirElegirHuevo(); } });
  el.querySelector('#otro')?.addEventListener('click', () => { close(); abrirElegirHuevo(); });
  el.querySelector('#renombrar')?.addEventListener('click', () => { close(); pedirNombre(estado, { tituloCorto: true }); });
}

// ---------------------------------------------------------------------------------------------------
/** Pide (y guarda) el nombre de tu compañero. */
export function pedirNombre(estado, { dentro = null, tituloCorto = false } = {}) {
  const html = `<div class="nombrar">
    ${dentro ? '' : `<div class="huevo-escena pequena">${criaturaSVG(estado.def.id, estado.etapaCriatura, 'feliz')}</div>`}
    <h3 style="margin:6px 0 4px">${tituloCorto ? 'Cambia su nombre' : '¡Ha nacido! ¿Cómo se llamará?'}</h3>
    <input id="nombre-criatura" maxlength="20" placeholder="Su nombre" value="${esc(estado.nombre || '')}" autocomplete="off" enterkeyhint="done">
    <div class="acciones" style="justify-content:center"><button class="btn gris" id="luego">Más tarde</button><button class="btn" id="guardar-nombre">Guardar nombre</button></div></div>`;
  const montar = (cont, cerrar) => {
    const inp = cont.querySelector('#nombre-criatura');
    setTimeout(() => inp.focus(), 250);
    const ok = async () => {
      const nombre = inp.value.trim().slice(0, 20);
      if (!nombre) return toast('Escribe un nombre para él. 🙂');
      const h = await getHuevo();
      await guardar({ ...h, nombre });
      cerrar(); refrescar();
      toast(`🎉 ¡Se llama ${nombre}!`, 3000);
    };
    cont.querySelector('#guardar-nombre').addEventListener('click', ok);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
    cont.querySelector('#luego').addEventListener('click', cerrar);
  };
  if (dentro) { dentro.innerHTML = html; montar(dentro, () => dentro.closest('.eclosion')?.remove()); return; }
  const { el, close } = sheet(tituloCorto ? '✏️ Su nombre' : '🎉 ¡Ha nacido!', html);
  montar(el, close);
}

// ---------------------------------------------------------------------------------------------------
/** La eclosión: el huevo tiembla, se abre en dos, sale la criatura y se le pone nombre. */
function ceremonia(estado) {
  const capa = document.createElement('div');
  capa.className = 'eclosion';
  capa.setAttribute('role', 'dialog');
  capa.innerHTML = `<div class="escena tiembla" id="esc-ecl">${huevoSVG(estado.def.id, 4)}</div><p class="eclosion-texto" id="txt-ecl">Algo se mueve ahí dentro…</p><div id="panel-ecl"></div>`;
  document.body.appendChild(capa);
  document.body.classList.add('no-scroll');
  const escena = capa.querySelector('#esc-ecl'), texto = capa.querySelector('#txt-ecl'), panel = capa.querySelector('#panel-ecl');
  navigator.vibrate?.([60, 80, 60, 80, 100]);
  // 1) tiembla  2) se abre  3) nace  4) nombre
  setTimeout(() => {
    escena.classList.remove('tiembla');
    escena.innerHTML = `${huevoMitadesSVG(estado.def.id)}<div class="flash"></div>${chispas()}`;
    escena.classList.add('abre');
    texto.textContent = '¡Se está abriendo!';
    navigator.vibrate?.(120);
  }, 2000);
  setTimeout(() => {
    escena.classList.remove('abre');
    escena.classList.add('nace');
    escena.innerHTML = `${criaturaSVG(estado.def.id, 1, 'feliz')}${chispas(true)}`;
    texto.textContent = '¡Ha nacido!';
  }, 3300);
  setTimeout(() => {
    texto.remove(); escena.classList.add('sube');
    pedirNombre({ ...estado, etapaCriatura: 1, nombre: '' }, { dentro: panel });
  }, 4700);
}
const chispas = (suave = false) => `<div class="chispas">${Array.from({ length: suave ? 14 : 22 }, (_, i) => {
  const a = (i / (suave ? 14 : 22)) * Math.PI * 2 + Math.random() * 0.4, d = 90 + Math.random() * 90;
  return `<i style="--dx:${Math.round(Math.cos(a) * d)}px;--dy:${Math.round(Math.sin(a) * d)}px;animation-delay:${Math.round(Math.random() * 200)}ms"></i>`;
}).join('')}</div>`;

let ceremoniaEnCurso = false;

/**
 * Si el huevo ya está listo, lo abre con la ceremonia (una vez). Si ya había eclosionado y quedó sin nombre,
 * se lo pide con calma.
 */
export async function comprobarEclosion(estado) {
  if (!estado || ceremoniaEnCurso || document.querySelector('.sheet-back, .eclosion, .foco, .bienvenida')) return;
  const huevo = await getHuevo();
  if (estado.listo) {
    ceremoniaEnCurso = true;
    // Se guarda antes de empezar: así, aunque se cierre la app a mitad, no se repite ni se pierde.
    await guardar({ ...huevo, eclosion: hoyISO(), pico: Math.max(estado.pico, estado.def.requisito), nombre: huevo.nombre || '' });
    ceremonia(estado);
    setTimeout(() => { ceremoniaEnCurso = false; }, 9000);
    return;
  }
  // Si sube de pico, se recuerda (las etapas de la criatura no retroceden).
  if (estado.eclosionado && estado.pico > (huevo.pico || 0)) await guardar({ ...huevo, pico: estado.pico });
}

// ---------------------------------------------------------------------------------------------------
/** Carga el huevo y calcula su estado actual (para «Perfil», fuera de «Hoy»). */
export async function cargarEstadoHuevo() {
  const huevo = await getHuevo();
  if (!huevo) return { huevo: null, estado: null };
  const hoy = hoyISO();
  const [blocks, habits, tasks, inicioApp, libres] = await Promise.all([db.all('blocks'), db.all('habits'), db.all('tasks'), kvGet('inicioApp', hoy), kvGet('diasLibres', {})]);
  const serie = progresoDiario({ blocks, habits, tasks, desde: huevo.inicio, hasta: hoy, inicioApp, libres });
  return { huevo, estado: estadoHuevo({ huevo, serie, hoy }) };
}

/** Tarjeta de «Perfil»: tu huevo o compañero, y todo lo que se puede hacer con él. */
export function tarjetaCompaneroHTML({ huevo, estado }) {
  const coleccion = (huevo?.coleccion || []).length
    ? `<h4 style="margin:16px 0 8px">Tus compañeros</h4><div class="coleccion">${huevo.coleccion.map(c => `<div class="col-item">${criaturaSVG(c.id, c.etapa || 3, 'feliz')}<b>${esc(c.nombre || 'Sin nombre')}</b></div>`).join('')}</div>` : '';
  if (!estado) return `<div class="card"><h3 style="margin-bottom:8px">🥚 Tu compañero</h3>
    <div class="comp-fila"><div class="comp-dibujo">${huevoMisterioSVG()}</div>
      <div><p class="sub" style="margin:0 0 8px">Elige un huevo y cuídalo con tu constancia: si lo calientas cada día, un día eclosionará.</p>
      <button class="btn chico" id="comp-cambiar">Elegir mi huevo</button></div></div>${coleccion}</div>`;
  const e = estado;
  const dibujo = e.eclosionado ? criaturaSVG(e.def.id, e.etapaCriatura, e.humor) : huevoSVG(e.def.id, e.etapaHuevo);
  const datos = e.eclosionado
    ? `<b style="font-size:18px">${esc(e.nombre || 'Sin nombre')}</b><div class="mini">${['', 'Cría', 'Joven', 'Adulto'][e.etapaCriatura]} · etapa ${e.etapaCriatura} de 3</div>`
    : `<b style="font-size:18px">Huevo ${esc(e.def.nombre)}</b><div class="mini">Calor ${num(e.calor)} de ${e.def.requisito} · ${e.faltan <= 1 ? '¡a punto de abrirse!' : `unos ${e.faltan} días`}</div>`;
  const barra = e.eclosionado ? (e.siguiente ? Math.min(100, Math.round((e.pico - e.siguiente.desde) / (e.siguiente.hasta - e.siguiente.desde) * 100)) : 100) : Math.round(e.fraccion * 100);
  return `<div class="card"><h3 style="margin-bottom:8px">${e.eclosionado ? '🌟' : '🥚'} Tu compañero</h3>
    <div class="comp-fila"><button type="button" class="comp-dibujo" id="comp-ver" aria-label="Ver mi compañero">${dibujo}</button>
      <div class="grow" style="flex:1">${datos}<div class="barra" style="margin-top:8px"><i style="width:${barra}%"></i></div></div></div>
    <div class="acciones">
      <button class="btn sec chico" id="comp-ver2">Verlo</button>
      ${e.eclosionado ? `<button class="btn gris chico" id="comp-nombre">✏️ ${e.nombre ? 'Cambiar nombre' : 'Ponerle nombre'}</button>` : ''}
      <button class="btn gris chico" id="comp-cambiar">${e.eclosionado ? '🥚 Empezar con otro huevo' : 'Cambiar de huevo'}</button>
    </div>${coleccion}</div>`;
}

export function conectarCompanero(root, { estado }) {
  root.querySelector('#comp-ver')?.addEventListener('click', () => estado && abrirHuevo(estado));
  root.querySelector('#comp-ver2')?.addEventListener('click', () => estado && abrirHuevo(estado));
  root.querySelector('#comp-nombre')?.addEventListener('click', () => pedirNombre(estado, { tituloCorto: true }));
  root.querySelector('#comp-cambiar')?.addEventListener('click', () => {
    if (!estado || estado.eclosionado || confirm('Si cambias de huevo, empiezas de cero con el nuevo. ¿Seguro?')) abrirElegirHuevo();
  });
}

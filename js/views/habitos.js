// «Descubrir hábitos»: catálogo de hábitos saludables con filtros de dificultad, coste y tema,
// alternativas para probar dentro de cada propósito y sugerencias al azar.
import { db } from '../db.js';
import { esc, sheet, toast, refrescar, hoyISO } from '../util.js';
import { FAMILIAS, CATEGORIAS_HABITO, DIFICULTAD, COSTE, filtrar, sugerir, habitoPorId, habitoNuevo } from '../habitos.js';

const ETIQUETA_DIF = Object.fromEntries(DIFICULTAD), ETIQUETA_COSTE = Object.fromEntries(COSTE);
const CLASE_DIF = { 1: 'verde', 2: 'naranja', 3: 'rojo' };

/** Guarda un hábito del catálogo. Devuelve el hábito creado. */
export async function anadirHabitoCatalogo(id) {
  const nuevo = habitoNuevo(habitoPorId(id), hoyISO());
  await db.put('habits', nuevo);
  return nuevo;
}

export async function abrirCatalogoHabitos() {
  const filtros = { dificultad: null, coste: null, cat: null };
  let sugeridos = [];
  const { el } = sheet('✨ Descubrir hábitos', '<div id="cat-habitos"></div>', { onClose: refrescar });
  const cont = el.querySelector('#cat-habitos');

  const chips = (clave, lista, todas) => `<div class="chips">${[[null, todas], ...lista].map(([v, t]) => `<button type="button" class="chip ${filtros[clave] === v ? 'activa' : ''}" data-filtro="${clave}" data-valor="${v ?? ''}">${t}</button>`).join('')}</div>`;
  const tarjeta = (h, tiene) => `<div class="habito-cat">
    <div class="fila" style="align-items:flex-start"><span class="habito-cat-emoji">${h.emoji}</span>
      <div class="grow" style="flex:1;min-width:0"><div class="t">${esc(h.titulo)}</div>
        <div class="tags"><span class="badge ${CLASE_DIF[h.dificultad]}">${ETIQUETA_DIF[h.dificultad]}</span><span class="badge">${h.coste ? '€'.repeat(h.coste) + ' ' : ''}${ETIQUETA_COSTE[h.coste]}</span></div>
        <p class="mini" style="margin:6px 0 0">${esc(h.porque)}</p>
        <p class="mini" style="margin:4px 0 0">👉 <b>Cómo empezar:</b> ${esc(h.empezar)}</p></div></div>
    ${tiene ? '<div class="mini verde" style="margin-top:8px;text-align:right">✓ Ya lo tienes</div>' : `<div class="acciones" style="justify-content:flex-end"><button type="button" class="btn sec chico" data-anadir="${h.id}">+ Añadir</button></div>`}
  </div>`;

  async function pintar() {
    const habits = await db.all('habits');
    const tiene = new Set(habits.flatMap(h => [h.catalogo, h.titulo.toLowerCase()]).filter(Boolean));
    const lo = h => tiene.has(h.id) || tiene.has(h.titulo.toLowerCase());
    const visibles = new Set(filtrar(filtros).map(h => h.id));
    const familias = FAMILIAS.filter(f => !filtros.cat || f.cat === filtros.cat).map(f => ({ ...f, opciones: f.alternativas.filter(a => visibles.has(a.id)) })).filter(f => f.opciones.length);
    cont.innerHTML = `
      <p class="sub">Elige hábitos <b>pequeños</b> que puedas cumplir. Mejor uno que mantienes que cinco que abandonas: cuando lo tengas dominado, prueba la alternativa más retadora.</p>
      <span class="cfg-etiqueta">Dificultad</span>${chips('dificultad', DIFICULTAD, 'Todas')}
      <span class="cfg-etiqueta">Coste</span>${chips('coste', COSTE, 'Todos')}
      <span class="cfg-etiqueta">Tema</span>${chips('cat', CATEGORIAS_HABITO, 'Todos')}
      <button type="button" class="btn ancho" id="sugerir" style="margin:12px 0">🎲 Sugiéreme 3 para probar</button>
      ${sugeridos.length ? `<div class="card" style="background:var(--accent-soft)"><b>🎲 Prueba con estos:</b>${sugeridos.map(h => tarjeta(h, lo(h))).join('')}</div>` : ''}
      ${familias.length ? familias.map(f => `
        <div class="seccion" style="margin-top:18px"><h2 style="font-size:17px">${CATEGORIAS_HABITO.find(c => c[0] === f.cat)[1].split(' ')[0]} ${esc(f.nombre)}</h2></div>
        ${f.fuente ? `<p class="mini" style="margin:-4px 4px 8px">📚 ${esc(f.fuente)}</p>` : ''}
        <div class="card plano" style="padding:4px 12px">${f.opciones.map(h => tarjeta(h, lo(h))).join('')}</div>`).join('')
        : '<div class="card vacio">No hay hábitos con esos filtros. Prueba a quitar alguno.</div>'}`;

    cont.querySelectorAll('[data-filtro]').forEach(b => b.addEventListener('click', () => {
      const v = b.dataset.valor;
      filtros[b.dataset.filtro] = v === '' ? null : b.dataset.filtro === 'cat' ? v : Number(v);
      pintar();
    }));
    cont.querySelector('#sugerir').addEventListener('click', () => {
      sugeridos = sugerir(3, { yaTiene: [...tiene], dificultad: filtros.dificultad, coste: filtros.coste });
      if (!sugeridos.length) toast('Ya tienes un hábito de cada tipo con esos filtros. ¡Enhorabuena! 🎉');
      pintar();
    });
    cont.querySelectorAll('[data-anadir]').forEach(b => b.addEventListener('click', async () => {
      const h = await anadirHabitoCatalogo(b.dataset.anadir);
      toast(`${h.emoji} Añadido «${h.titulo}». ¡A por la racha! 🔥`);
      pintar();
    }));
  }
  pintar();
}

// Pantalla «Ahorro»: mes, recomendaciones, retos, metas con cerdito, gastos y regla 50/30/20.
import { db, kvSet } from '../db.js';
import { CATEGORIAS, catNombre, catIcono, getIngresos, saveIngresos, PRIORIDADES } from '../datos.js';
import { esc, sheet, formData, toast, refrescar, uid, hoyISO, fmtEur, fmtFecha, opciones, sum } from '../util.js';
import { datosFinanzas } from './comun.js';
import { resumenMes, regla503020, estadoMeta, recomendaciones, evaluarReto } from '../finanzas.js';
import { cerditoHTML, animarAportacion, etapa, ETAPAS } from '../cerdito.js';

const ESTADO_META = {
  'completada': ['verde', '🏆 Conseguida'], 'adelantado': ['verde', '🚀 Adelantado'], 'al-dia': ['', '✅ Al día'],
  'atrasado': ['rojo', '🐢 Con retraso'], 'sin-fecha': ['', 'Sin fecha'],
};

export async function render(root) {
  const d = await datosFinanzas();
  const r = resumenMes(d);
  const regla = regla503020(d, r);
  const metas = d.savingsGoals.map(m => ({ ...m, ...estadoMeta(m, d.contributions, d.hoy) }))
    .sort((a, b) => ((a.estado === 'completada') - (b.estado === 'completada')) || ((b.prioridad || 1) - (a.prioridad || 1)));
  const totalAhorrado = sum(metas, m => m.ahorrado), totalMeta = sum(metas, m => m.meta);
  const pctTotal = totalMeta ? totalAhorrado / totalMeta : 0;
  const recs = recomendaciones(d);
  const reto = evaluarReto(d.reto, d.expenses, d.hoy);
  const cats = Object.entries(r.porCategoria).sort((a, b) => b[1] - a[1]);
  const maxCat = cats[0]?.[1] || 1;
  const recientes = [...d.expenses].sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado || 0) - (a.creado || 0)).slice(0, 12);

  root.innerHTML = `
    <div class="card hero-ahorro">
      <div class="cerdito-caja" id="cerdito-total">${cerditoHTML(pctTotal)}</div>
      <div style="min-width:0">
        <div class="mini">Total ahorrado</div>
        <div class="grande">${fmtEur(totalAhorrado, true)}</div>
        <div class="sub">${totalMeta ? `de ${fmtEur(totalMeta, true)} · ${Math.round(pctTotal * 100)} %` : 'Crea tu primera meta'}</div>
        <div class="mini" style="margin-top:4px">${ETAPAS[etapa(pctTotal)]}</div>
      </div>
    </div>

    <div class="card">
      <div class="fila sep"><b>${fmtFecha(d.hoy, { month: 'long', year: 'numeric' })}</b>
        <button class="btn gris chico" id="config">💶 Nómina y fijos</button></div>
      ${r.ingresos ? `
        <div style="margin:10px 0 4px" class="mini">Te queda este mes</div>
        <div class="grande ${r.disponible < 0 ? 'rojo' : ''}">${fmtEur(r.disponible)}</div>
        <div class="sub">${r.diasRestantes} días · puedes gastar unos <b>${fmtEur(Math.max(0, r.porDia))}/día</b></div>
        <div class="barra" style="margin:10px 0"><i style="width:${Math.min(100, (r.fijos + r.variables + Math.max(0, r.aportado)) / r.ingresos * 100)}%;background:${r.disponible < 0 ? 'var(--red)' : 'var(--accent)'}"></i></div>
        <div class="grid2 mini">
          <div>💶 Ingresos: <b>${fmtEur(r.ingresos, true)}</b></div><div>🏠 Fijos: <b>${fmtEur(r.fijos, true)}</b></div>
          <div>🛒 Variables: <b>${fmtEur(r.variables, true)}</b></div><div>🐷 A metas: <b>${fmtEur(r.aportado, true)}</b></div>
        </div>` : '<p class="sub" style="margin-top:8px">Añade tu nómina y tus gastos fijos para empezar.</p>'}
      <button class="btn ancho" id="gasto" style="margin-top:12px">+ Apuntar gasto</button>
    </div>

    <div class="seccion"><h2>Cómo ahorrar más</h2></div>
    ${reto ? retoHTML(reto) : ''}
    ${recs.length ? recs.map((x, i) => `<div class="card rec"><span class="ico">${x.icono}</span><div style="flex:1;min-width:0">
      <div class="t">${esc(x.titulo)}</div><p>${esc(x.texto)}</p>
      ${x.accion ? `<div class="acciones"><button class="btn sec chico" data-rec="${i}">${textoAccion(x.accion)}</button></div>` : ''}</div></div>`).join('')
      : '<div class="card vacio">Apunta tus gastos unos días y aquí verás recomendaciones personalizadas. 💡</div>'}

    <div class="seccion"><h2>Mis metas</h2><button class="btn sec chico" id="nueva-meta">+ Meta</button></div>
    ${metas.length ? `<div class="metas">${metas.map(m => `
      <div class="meta" data-meta="${m.id}">
        <div class="cerdito-caja">${cerditoHTML(m.pct)}</div>
        <div class="t">${esc(m.emoji || '')} ${esc(m.nombre)}</div>
        <div class="mini"><b>${fmtEur(m.ahorrado, true)}</b> / ${fmtEur(m.meta, true)}</div>
        <div class="barra"><i style="width:${Math.min(100, m.pct * 100)}%"></i></div>
        <div><span class="badge ${ESTADO_META[m.estado][0]}">${ESTADO_META[m.estado][1]}</span></div>
      </div>`).join('')}</div>`
      : '<div class="card vacio"><span class="ico">🐷</span>Crea una meta (un viaje, un coche, un fondo de emergencia…) y mira cómo crece tu cerdito con cada aportación.</div>'}

    ${cats.length ? `<div class="seccion"><h2>Gastos del mes</h2></div><div class="card">${cats.map(([c, v]) => `
      <div class="cat-barra"><span style="font-size:22px">${catIcono(c)}</span><div class="grow">
        <div class="fila sep"><span>${catNombre(c)}</span><b>${fmtEur(v)}</b></div>
        <div class="barra"><i style="width:${v / maxCat * 100}%"></i></div></div></div>`).join('')}</div>` : ''}

    ${r.ingresos ? `<div class="seccion"><h2>Regla 50/30/20</h2></div>
    <div class="card"><p class="sub">Lo recomendable: 50 % necesidades, 30 % caprichos, 20 % ahorro.</p>
      <div class="regla">
        ${[['necesidades', '🏠 Necesidades', 50], ['deseos', '🎉 Caprichos', 30], ['ahorro', '🐷 Ahorro', 20]].map(([k, t, obj]) => {
          const p = regla.pct[k], bien = k === 'ahorro' ? p >= obj : p <= obj;
          return `<div><span class="mini">${t}</span><b class="${bien ? 'verde' : 'naranja'}">${Math.round(p)} %</b><span class="mini">objetivo ${obj} %</span></div>`;
        }).join('')}
      </div></div>` : ''}

    <div class="seccion"><h2>Últimos movimientos</h2></div>
    <div class="card plano"><ul class="lista">${recientes.length ? recientes.map(e => `
      <li class="toque" data-gasto="${e.id}"><span style="font-size:22px">${catIcono(e.categoria)}</span>
      <div class="grow"><div class="t">${esc(e.nota || catNombre(e.categoria))}</div><div class="mini">${fmtFecha(e.fecha, { weekday: 'short', day: 'numeric', month: 'short' })}</div></div>
      <b>−${fmtEur(e.importe)}</b></li>`).join('') : '<li class="sub">Aún no has apuntado gastos.</li>'}</ul></div>
    <button class="fab" id="fab-gasto" aria-label="Apuntar gasto">€</button>`;

  root.querySelector('#config').addEventListener('click', configurarIngresos);
  root.querySelector('#gasto').addEventListener('click', () => apuntarGasto());
  root.querySelector('#fab-gasto').addEventListener('click', () => apuntarGasto());
  root.querySelector('#nueva-meta').addEventListener('click', () => editarMeta());
  root.querySelectorAll('[data-meta]').forEach(el => el.addEventListener('click', () => detalleMeta(el.dataset.meta)));
  root.querySelectorAll('[data-gasto]').forEach(el => el.addEventListener('click', () => apuntarGasto(d.expenses.find(e => e.id === el.dataset.gasto))));
  root.querySelectorAll('[data-rec]').forEach(b => b.addEventListener('click', () => ejecutarAccion(recs[b.dataset.rec].accion, d)));
  conectarReto(root, reto, metas);
}

function textoAccion(a) {
  return { 'config-nomina': 'Configurar', 'aportar': `Aportar ${fmtEur(a.importe, true)}`, 'iniciar-reto': '🏆 Aceptar reto',
    'crear-meta': 'Crear meta', 'repartir-sobrante': 'Repartir en mis huchas' }[a.tipo] || 'Hacer';
}

async function ejecutarAccion(a, d) {
  switch (a.tipo) {
    case 'config-nomina': return configurarIngresos();
    case 'aportar': return detalleMeta(a.goalId, a.importe);
    case 'crear-meta': return editarMeta(null, { nombre: a.nombre, meta: a.meta, emoji: a.emoji, prioridad: 3 });
    case 'iniciar-reto':
      await kvSet('reto', { id: uid(), categoria: a.categoria, inicio: hoyISO(), ahorroEstimado: a.ahorroEstimado });
      toast(`🏆 Reto aceptado: 7 días sin ${catNombre(a.categoria).toLowerCase()}. ¡Tú puedes!`);
      return refrescar();
    case 'repartir-sobrante': {
      await db.putMany('contributions', a.reparto.map(x => ({ id: uid(), goalId: x.goalId, importe: x.importe, fecha: hoyISO(), nota: `Sobrante de ${a.mk}` })));
      await kvSet('sobrantesRepartidos', [...(d.sobrantesRepartidos || []), a.mk]);
      toast('🐷 ¡Sobrante repartido en tus huchas!');
      return refrescar();
    }
  }
}

function retoHTML(r) {
  const cat = catNombre(r.categoria).toLowerCase();
  if (r.cumplido) return `<div class="card rec" style="border:2px solid var(--green)"><span class="ico">🏆</span><div style="flex:1">
    <div class="t">¡Reto cumplido! Una semana sin ${cat}</div><p>Has ahorrado unos ${fmtEur(r.ahorroEstimado, true)}. Mételos en tu cerdito para que cuenten de verdad.</p>
    <div class="acciones"><button class="btn verde chico" data-reto="aportar">🐷 Aportar ${fmtEur(r.ahorroEstimado, true)}</button><button class="btn gris chico" data-reto="cerrar">Cerrar</button></div></div></div>`;
  if (r.roto) return `<div class="card rec"><span class="ico">💪</span><div style="flex:1">
    <div class="t">Reto: semana sin ${cat}</div><p>Esta vez se ha escapado un gasto de ${fmtEur(r.gastado)}. No pasa nada: lo importante es volver a intentarlo.</p>
    <div class="acciones"><button class="btn sec chico" data-reto="reintentar">Empezar de nuevo hoy</button><button class="btn gris chico" data-reto="cerrar">Dejarlo</button></div></div></div>`;
  return `<div class="card rec" style="border:2px solid var(--accent)"><span class="ico">🏆</span><div style="flex:1">
    <div class="t">Reto en marcha: semana sin ${cat}</div><p>Quedan ${r.diasRestantes} ${r.diasRestantes === 1 ? 'día' : 'días'}. Ahorro estimado: ${fmtEur(r.ahorroEstimado, true)}. ¡Vas genial!</p></div></div>`;
}

function conectarReto(root, reto, metas) {
  root.querySelectorAll('[data-reto]').forEach(b => b.addEventListener('click', async () => {
    const acc = b.dataset.reto;
    if (acc === 'cerrar') { await kvSet('reto', null); return refrescar(); }
    if (acc === 'reintentar') { await kvSet('reto', { ...reto, id: uid(), inicio: hoyISO() }); toast('🏆 ¡Reto reiniciado!'); return refrescar(); }
    if (acc === 'aportar') {
      const activa = metas.find(m => m.estado !== 'completada');
      if (!activa) return toast('Crea una meta de ahorro para aportar el dinero del reto.');
      await kvSet('reto', null);
      detalleMeta(activa.id, reto.ahorroEstimado);
    }
  }));
}

// ---------- Gastos ----------
function apuntarGasto(gasto = null) {
  let cat = gasto?.categoria || 'supermercado';
  const { el, close } = sheet(gasto ? 'Editar gasto' : 'Apuntar gasto', `
    <form>
      <input class="importe-input" name="importe" type="number" inputmode="decimal" step="0.01" min="0.01" required placeholder="0,00 €" value="${gasto?.importe ?? ''}">
      <div class="teclado-cats">${Object.entries(CATEGORIAS).filter(([k]) => k !== 'vivienda' && k !== 'seguros' && k !== 'deudas').map(([k, c]) =>
        `<button type="button" data-cat="${k}" class="${k === cat ? 'activa' : ''}"><b>${c.i}</b>${c.n}</button>`).join('')}</div>
      <label class="campo"><span>Concepto (opcional)</span><input name="nota" value="${esc(gasto?.nota || '')}" placeholder="Ej.: Cena con amigos"></label>
      <label class="campo"><span>Fecha</span><input type="date" name="fecha" value="${gasto?.fecha || hoyISO()}" required></label>
      <button class="btn ancho">${gasto ? 'Guardar' : 'Apuntar'}</button>
      ${gasto ? '<button type="button" class="btn peligro ancho" id="borrar" style="margin-top:8px">Borrar gasto</button>' : ''}
    </form>`);
  const form = el.querySelector('form');
  if (!gasto) setTimeout(() => form.importe.focus(), 300);
  el.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => {
    cat = b.dataset.cat;
    el.querySelectorAll('[data-cat]').forEach(x => x.classList.toggle('activa', x === b));
  }));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const d = formData(form);
    await db.put('expenses', { id: gasto?.id || uid(), creado: gasto?.creado || Date.now(), importe: Math.round(d.importe * 100) / 100, categoria: cat, nota: d.nota, fecha: d.fecha });
    close(); refrescar();
    toast(gasto ? 'Gasto actualizado' : `💸 ${fmtEur(d.importe)} en ${catNombre(cat)}`);
  });
  el.querySelector('#borrar')?.addEventListener('click', async () => {
    if (!confirm('¿Borrar este gasto?')) return;
    await db.del('expenses', gasto.id); close(); refrescar();
  });
}

async function configurarIngresos() {
  const [ing, fijos] = await Promise.all([getIngresos(), db.all('fixedExpenses')]);
  const { el, close } = sheet('Nómina y gastos fijos', `
    <form id="ing" class="card">
      <h3 style="margin-bottom:10px">💶 Ingresos mensuales</h3>
      <div class="grid2">
        <label class="campo"><span>Nómina neta (€)</span><input type="number" inputmode="decimal" step="0.01" name="nomina" value="${ing.nomina || ''}" placeholder="1500"></label>
        <label class="campo"><span>Día de cobro</span><input type="number" min="1" max="31" name="diaCobro" value="${ing.diaCobro || 1}"></label>
      </div>
      <label class="campo"><span>Otros ingresos al mes (€)</span><input type="number" inputmode="decimal" step="0.01" name="extras" value="${ing.extras || ''}" placeholder="0"></label>
      <button class="btn ancho">Guardar ingresos</button>
    </form>
    <h3 style="margin:16px 4px 8px">🏠 Gastos fijos mensuales</h3>
    <div class="card plano"><ul class="lista">${fijos.length ? fijos.map(f => `
      <li class="toque" data-fijo="${f.id}"><span style="font-size:22px">${catIcono(f.categoria)}</span>
      <div class="grow"><div class="t">${esc(f.nombre)}</div><div class="mini">Día ${f.dia || '—'}${f.suscripcion ? ' · suscripción' : ''}</div></div>
      <b>${fmtEur(f.importe)}</b></li>`).join('') : '<li class="sub">Alquiler, transporte, móvil, gimnasio, Netflix…</li>'}
      <li class="sub"><b>Total: ${fmtEur(sum(fijos, f => f.importe))}/mes</b></li></ul></div>
    <button class="btn sec ancho" id="nuevo-fijo">+ Añadir gasto fijo</button>`);
  el.querySelector('#ing').addEventListener('submit', async e => {
    e.preventDefault();
    const d = formData(e.target);
    await saveIngresos({ nomina: d.nomina || 0, diaCobro: Math.min(31, Math.max(1, d.diaCobro || 1)), extras: d.extras || 0 });
    toast('Ingresos guardados'); refrescar();
  });
  const reabrir = () => { close(); setTimeout(configurarIngresos, 260); };
  el.querySelector('#nuevo-fijo').addEventListener('click', () => editarFijo(null, reabrir));
  el.querySelectorAll('[data-fijo]').forEach(li => li.addEventListener('click', () => editarFijo(fijos.find(f => f.id === li.dataset.fijo), reabrir)));
}

function editarFijo(f, despues) {
  const { el, close } = sheet(f ? 'Editar gasto fijo' : 'Nuevo gasto fijo', `
    <form>
      <label class="campo"><span>Concepto</span><input name="nombre" required value="${esc(f?.nombre || '')}" placeholder="Ej.: Alquiler, Spotify…"></label>
      <div class="grid2">
        <label class="campo"><span>Importe (€/mes)</span><input type="number" inputmode="decimal" step="0.01" name="importe" required value="${f?.importe ?? ''}"></label>
        <label class="campo"><span>Día de cargo</span><input type="number" min="1" max="31" name="dia" value="${f?.dia ?? ''}"></label>
      </div>
      <label class="campo"><span>Categoría</span><select name="categoria">${opciones(Object.entries(CATEGORIAS).map(([k, c]) => [k, `${c.i} ${c.n}`]), f?.categoria || 'vivienda')}</select></label>
      <label class="switch"><span>📺 Es una suscripción</span><input type="checkbox" name="suscripcion" ${f?.suscripcion ? 'checked' : ''}></label>
      <button class="btn ancho">Guardar</button>
      ${f ? '<button type="button" class="btn peligro ancho" id="borrar" style="margin-top:8px">Borrar</button>' : ''}
    </form>`);
  const form = el.querySelector('form');
  form.categoria.addEventListener('change', () => { if (form.categoria.value === 'suscripciones') form.suscripcion.checked = true; });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const d = formData(form);
    await db.put('fixedExpenses', { id: f?.id || uid(), ...d, importe: d.importe || 0 });
    close(); refrescar(); despues();
  });
  el.querySelector('#borrar')?.addEventListener('click', async () => { await db.del('fixedExpenses', f.id); close(); refrescar(); despues(); });
}

// ---------- Metas ----------
function editarMeta(m = null, valores = {}) {
  const v = { nombre: '', meta: '', fechaLimite: '', prioridad: 2, emoji: '🐷', ...m, ...valores };
  const { el, close } = sheet(m ? 'Editar meta' : 'Nueva meta de ahorro', `
    <form>
      <div class="fila"><input name="emoji" maxlength="4" value="${esc(v.emoji)}" style="width:64px;text-align:center">
        <input name="nombre" required value="${esc(v.nombre)}" placeholder="Ej.: Viaje a Japón"></div>
      <label class="campo" style="margin-top:12px"><span>¿Cuánto quieres ahorrar? (€)</span><input type="number" inputmode="decimal" step="1" min="1" name="meta" required value="${v.meta}"></label>
      <div class="grid2">
        <label class="campo"><span>Fecha objetivo</span><input type="date" name="fechaLimite" value="${v.fechaLimite || ''}"></label>
        <label class="campo"><span>Prioridad</span><select name="prioridad">${opciones(PRIORIDADES, v.prioridad)}</select></label>
      </div>
      <button class="btn ancho">${m ? 'Guardar' : 'Crear meta'}</button>
    </form>`);
  el.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault();
    const d = formData(e.target);
    await db.put('savingsGoals', { id: m?.id || uid(), creado: m?.creado || hoyISO(), ...d, meta: d.meta, prioridad: Number(d.prioridad) });
    close(); refrescar();
    toast(m ? 'Meta guardada' : '🐷 ¡Meta creada! Tu lechón espera su primera moneda.');
  });
}

async function detalleMeta(id, importeSugerido = '') {
  const [m, aportes] = await Promise.all([db.get('savingsGoals', id), db.all('contributions')]);
  if (!m) return;
  const propias = aportes.filter(c => c.goalId === id).sort((a, b) => b.fecha.localeCompare(a.fecha));
  let e = estadoMeta(m, aportes, hoyISO());
  const { el, close } = sheet(`${m.emoji || '🐷'} ${m.nombre}`, `
    <div class="cerdito-caja" id="cerdo" style="max-width:230px;margin:4px auto 8px">${cerditoHTML(e.pct)}</div>
    <div class="centro" id="cifras"></div>
    <form id="aportar" class="card" style="margin-top:12px">
      <div class="chips" style="justify-content:center">${[10, 20, 50, 100].map(x => `<button type="button" class="chip" data-rapido="${x}">+${x} €</button>`).join('')}</div>
      <div class="fila"><input type="number" inputmode="decimal" step="0.01" name="importe" placeholder="Importe (€)" value="${importeSugerido}" required>
        <button class="btn verde" style="flex:none">🐷 Aportar</button></div>
      <button type="button" class="btn gris chico" id="retirar" style="margin-top:8px">Retirar dinero</button>
    </form>
    <h3 style="margin:16px 4px 8px">Historial</h3>
    <div class="card plano"><ul class="lista" id="hist"></ul></div>
    <div class="acciones">
      <button class="btn gris chico" id="editar">✏️ Editar meta</button>
      <button class="btn peligro chico" id="borrar">🗑 Eliminar</button>
    </div>`, { onClose: refrescar });

  const pintarCifras = () => {
    el.querySelector('#cifras').innerHTML = `
      <div class="grande">${fmtEur(e.ahorrado, true)} <span class="sub">de ${fmtEur(m.meta, true)}</span></div>
      <div class="barra" style="margin:8px 0"><i style="width:${Math.min(100, e.pct * 100)}%"></i></div>
      <div class="sub">${ETAPAS[etapa(e.pct)]} · ${Math.round(e.pct * 100)} %${e.falta > 0 ? ` · faltan ${fmtEur(e.falta, true)}` : ' · 🏆 ¡Conseguida!'}</div>
      ${e.necesarioMes && e.falta > 0 ? `<div class="mini" style="margin-top:4px">Para llegar a tiempo: ${fmtEur(e.necesarioMes, true)}/mes · tu ritmo: ${fmtEur(e.ritmoMes, true)}/mes</div>` : ''}
      ${!e.necesarioMes && e.ritmoMes > 0 && e.falta > 0 ? `<div class="mini" style="margin-top:4px">A tu ritmo (${fmtEur(e.ritmoMes, true)}/mes) la conseguirás en ${Math.ceil(e.etaMeses)} meses</div>` : ''}`;
  };
  const pintarHist = () => {
    el.querySelector('#hist').innerHTML = propias.length ? propias.map(c => `<li><div class="grow"><div class="t ${c.importe < 0 ? 'rojo' : 'verde'}">${c.importe < 0 ? '−' : '+'}${fmtEur(Math.abs(c.importe))}</div>
      <div class="mini">${fmtFecha(c.fecha, { day: 'numeric', month: 'short', year: 'numeric' })}${c.nota ? ` · ${esc(c.nota)}` : ''}</div></div>
      <button class="btn-icon" data-del="${c.id}" aria-label="Borrar">✕</button></li>`).join('') : '<li class="sub">Aún no hay aportaciones.</li>';
    el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      await db.del('contributions', b.dataset.del);
      propias.splice(propias.findIndex(c => c.id === b.dataset.del), 1);
      await actualizar();
    }));
  };
  async function actualizar() {
    const antes = e.pct;
    e = estadoMeta(m, [...propias], hoyISO());
    animarAportacion(el.querySelector('#cerdo'), antes, e.pct);
    pintarCifras(); pintarHist();
  }
  async function mover(importe) {
    if (!importe) return;
    const c = { id: uid(), goalId: id, importe, fecha: hoyISO(), nota: '' };
    await db.put('contributions', c);
    propias.unshift(c);
    await actualizar();
    if (importe > 0) toast(`🐷 +${fmtEur(importe)} a «${m.nombre}»`);
  }
  pintarCifras(); pintarHist();
  const form = el.querySelector('#aportar');
  el.querySelectorAll('[data-rapido]').forEach(b => b.addEventListener('click', () => mover(Number(b.dataset.rapido))));
  form.addEventListener('submit', async ev => { ev.preventDefault(); await mover(Math.abs(Number(form.importe.value))); form.importe.value = ''; });
  el.querySelector('#retirar').addEventListener('click', async () => {
    const v = Math.abs(Number(form.importe.value));
    if (!v) return toast('Escribe el importe a retirar.');
    if (!confirm(`¿Retirar ${fmtEur(v)} de «${m.nombre}»?`)) return;
    await mover(-v); form.importe.value = '';
  });
  el.querySelector('#editar').addEventListener('click', () => { close(); setTimeout(() => editarMeta(m), 260); });
  el.querySelector('#borrar').addEventListener('click', async () => {
    if (!confirm(`¿Eliminar la meta «${m.nombre}» y su historial?`)) return;
    await db.delMany('contributions', propias.map(c => c.id));
    await db.del('savingsGoals', id);
    close();
  });
}

export { apuntarGasto };

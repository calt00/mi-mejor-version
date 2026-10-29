// Pantalla «Horario»: vista día/semana, generador, horario a petición (IA) y disponibilidad.
import { db } from '../db.js';
import { getDisponibilidad, saveDisponibilidad, getPrefs, savePrefs, getSettings } from '../datos.js';
import { esc, sheet, toast, refrescar, uid, hoyISO, addDays, weekDates, fmtFecha, DIAS, toMin } from '../util.js';
import { bloqueHTML, conectarBloques, abrirEditorBloque, abrirEnvioIphone, cargando } from './comun.js';
import { generarSemana, validarBloques, seConserva, ordenarBloques, esImportante } from '../scheduler.js';
import { horarioPorPeticion, ErrorIA } from '../coach.js';
import { asignarFrases } from '../iphone.js';

const estado = { modo: 'dia', fecha: hoyISO(), avisos: [] };

export async function render(root) {
  const [goals, blocks] = await Promise.all([db.all('goals'), db.all('blocks')]);
  const goalsById = Object.fromEntries(goals.map(g => [g.id, g]));
  const hoy = hoyISO();
  const semana = weekDates(estado.fecha);
  const fechas = estado.modo === 'dia' ? [estado.fecha] : semana;
  const visibles = ordenarBloques(blocks.filter(b => fechas.includes(b.fecha)));
  const titulo = estado.modo === 'dia'
    ? fmtFecha(estado.fecha)
    : `${fmtFecha(semana[0], { day: 'numeric', month: 'short' })} – ${fmtFecha(semana[6], { day: 'numeric', month: 'short' })}`;

  const dia = f => {
    const bs = visibles.filter(b => b.fecha === f);
    return bs.length ? `<div class="bloques">${bs.map(b => bloqueHTML(b, goalsById)).join('')}</div>`
      : `<div class="card vacio" style="padding:14px">Sin bloques${f >= hoy ? ` · <a href="#" data-anadir="${f}">añadir</a>` : ''}</div>`;
  };

  root.innerHTML = `
    <div class="seg"><button data-modo="dia" class="${estado.modo === 'dia' ? 'activa' : ''}">Día</button>
      <button data-modo="semana" class="${estado.modo === 'semana' ? 'activa' : ''}">Semana</button></div>
    <div class="fila sep" style="margin-bottom:12px">
      <button class="btn-icon" data-mover="-1" aria-label="Anterior">‹</button>
      <div class="centro"><b>${titulo}</b>${!fechas.includes(hoy) ? '<br><a href="#" id="ir-hoy" class="mini">Volver a hoy</a>' : ''}</div>
      <button class="btn-icon" data-mover="1" aria-label="Siguiente">›</button>
    </div>
    <div class="chips">
      <button class="chip activa" id="pedir">✨ Pídeme tu horario</button>
      <button class="chip" id="generar">⚙️ Generar semana</button>
      <button class="chip" id="enviar">📲 Enviar al iPhone</button>
      <button class="chip" id="disp">🕒 Disponibilidad</button>
    </div>
    ${estado.avisos.length ? `<div class="aviso">${estado.avisos.map(esc).join('<br>')}</div>` : ''}
    ${estado.modo === 'dia' ? dia(estado.fecha) : semana.map(f => `
      <div class="dia-titulo ${f === hoy ? 'hoy' : ''}"><span>${fmtFecha(f, { weekday: 'long', day: 'numeric' })}</span>
        <span class="mini">${visibles.filter(b => b.fecha === f).length || ''}</span></div>${dia(f)}`).join('')}
    <button class="fab" id="nuevo" aria-label="Nuevo bloque">+</button>`;

  conectarBloques(root, visibles);
  root.querySelectorAll('[data-modo]').forEach(b => b.addEventListener('click', () => { estado.modo = b.dataset.modo; refrescar(); }));
  root.querySelectorAll('[data-mover]').forEach(b => b.addEventListener('click', () => {
    estado.fecha = addDays(estado.fecha, Number(b.dataset.mover) * (estado.modo === 'dia' ? 1 : 7));
    estado.avisos = [];
    refrescar();
  }));
  root.querySelector('#ir-hoy')?.addEventListener('click', e => { e.preventDefault(); estado.fecha = hoy; refrescar(); });
  root.querySelectorAll('[data-anadir]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); abrirEditorBloque(null, { fecha: a.dataset.anadir }); }));
  root.querySelector('#nuevo').addEventListener('click', () => abrirEditorBloque(null, { fecha: estado.fecha < hoy ? hoy : estado.fecha }));
  root.querySelector('#pedir').addEventListener('click', () => abrirPeticionHorario());
  root.querySelector('#generar').addEventListener('click', generar);
  root.querySelector('#enviar').addEventListener('click', () => abrirEnvioIphone(estado.modo === 'semana' ? 'semana' : estado.fecha === addDays(hoy, 1) ? 'manana' : 'hoy'));
  root.querySelector('#disp').addEventListener('click', editarDisponibilidad);
}

async function generar() {
  const [goals, blocks, disponibilidad, prefs, settings] = await Promise.all([db.all('goals'), db.all('blocks'), getDisponibilidad(), getPrefs(), getSettings()]);
  const fecha = estado.fecha < hoyISO() ? hoyISO() : estado.fecha;
  const { nuevos, borrar, avisos } = generarSemana({ fecha, goals, blocks, disponibilidad, prefs, settings });
  if (borrar.length && !confirm(`Se reorganizarán ${borrar.length} bloques no fijados de esta semana. Los fijados (📌) y los hechos se mantienen. ¿Continuar?`)) return;
  await db.delMany('blocks', borrar);
  await db.putMany('blocks', nuevos);
  estado.avisos = avisos;
  estado.modo = 'semana';
  estado.fecha = fecha;
  refrescar();
  toast(nuevos.length ? `🗓️ ${nuevos.length} bloques planificados` : 'No se ha podido planificar nada');
  asignarFrases(nuevos).then(refrescar).catch(() => {});
}

// Horario en lenguaje natural con vista previa (Aceptar / Ajustar / Descartar).
export async function abrirPeticionHorario(textoInicial = '') {
  const ejemplos = ['Mañana salgo a las 15h, quiero estudiar 2h, ir al gimnasio y leer antes de dormir',
    'Organízame el fin de semana con tiempo para descansar',
    'Reorganiza mi semana, el jueves no puedo por la tarde',
    'Hoy tengo 3 horas libres desde las 17h, ¿qué hago?'];
  const { el, close } = sheet('✨ Pídeme tu horario', `
    <p class="sub">Escríbeme lo que necesitas como si me lo contaras. Tendré en cuenta tus objetivos, tu disponibilidad y lo que ya tienes fijado.</p>
    <form id="f"><textarea name="peticion" required placeholder="Ej.: ${esc(ejemplos[0])}">${esc(textoInicial)}</textarea>
      <div class="chips" style="margin-top:8px">${ejemplos.slice(1).map(e => `<button type="button" class="chip" data-ej="${esc(e)}">${esc(e)}</button>`).join('')}</div>
      <button class="btn ancho" style="margin-top:6px">Crear propuesta</button></form>
    <div id="res"></div>`);
  const form = el.querySelector('#f'), res = el.querySelector('#res');
  el.querySelectorAll('[data-ej]').forEach(b => b.addEventListener('click', () => { form.peticion.value = b.dataset.ej; form.peticion.focus(); }));

  let historial = [];
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const texto = form.peticion.value.trim();
    if (!texto) return;
    historial.push(texto);
    const peticion = historial.length > 1 ? `${historial[0]}\nAjustes pedidos después: ${historial.slice(1).join(' | ')}` : texto;
    res.innerHTML = cargando('Organizando tu horario…');
    form.querySelector('button.btn').disabled = true;
    try {
      const [goals, blocks, disponibilidad, settings] = await Promise.all([db.all('goals'), db.all('blocks'), getDisponibilidad(), getSettings()]);
      const hoy = hoyISO(), limite = addDays(hoy, 14);
      const fijos = blocks.filter(b => b.fecha >= hoy && b.fecha <= limite && seConserva(b));
      const r = await horarioPorPeticion(peticion, fijos);
      const goalPorTitulo = t => t && goals.find(g => g.titulo.toLowerCase() === t.toLowerCase());
      const propuestos = (r.bloques || []).filter(b => b.fecha >= hoy).map(b => {
        const g = goalPorTitulo(b.objetivo);
        return { id: uid(), fecha: b.fecha, inicio: b.inicio, fin: b.fin, titulo: b.titulo, goalId: g?.id || null,
          importante: Boolean(b.importante) || esImportante(g, settings), fijado: false, hecho: false, frase: '', origen: 'ia' };
      });
      const { validos, avisos } = validarBloques(propuestos, fijos, disponibilidad);
      const dias = [...new Set(validos.map(b => b.fecha))].sort();
      const reemplaza = blocks.filter(b => dias.includes(b.fecha) && !seConserva(b));

      res.innerHTML = `<div class="card" style="margin-top:12px">
        <p>${esc(r.resumen || '')}</p>
        ${avisos.length ? `<div class="aviso">${avisos.map(esc).join('<br>')}</div>` : ''}
        ${dias.map(f => `<div class="dia-titulo"><span>${fmtFecha(f, { weekday: 'long', day: 'numeric', month: 'short' })}</span></div>
          <div class="card plano" style="background:var(--card2)"><ul class="lista">${validos.filter(b => b.fecha === f).map(b => `
            <li><span class="mini" style="width:86px;flex:none">${b.inicio}–${b.fin}</span><div class="grow">${b.importante ? '⏰ ' : ''}${esc(b.titulo)}</div></li>`).join('')}</ul></div>`).join('') || '<p class="sub">No hay bloques en la propuesta.</p>'}
        ${reemplaza.length ? `<p class="mini">Sustituirá ${reemplaza.length} bloques no fijados de esos días.</p>` : ''}
        <div class="acciones">
          <button class="btn verde" id="aceptar" ${validos.length ? '' : 'disabled'}>✓ Aceptar</button>
          <button class="btn sec" id="ajustar">✏️ Ajustar</button>
          <button class="btn gris" id="descartar">Descartar</button>
        </div></div>`;
      res.querySelector('#aceptar').addEventListener('click', async () => {
        await db.delMany('blocks', reemplaza.map(b => b.id));
        await db.putMany('blocks', validos);
        close();
        estado.fecha = dias[0]; estado.modo = dias.length > 1 ? 'semana' : 'dia'; estado.avisos = [];
        if (location.hash !== '#horario') location.hash = '#horario'; else refrescar();
        toast(`🗓️ Horario guardado (${validos.length} bloques)`);
        asignarFrases(validos).then(refrescar).catch(() => {});
      });
      res.querySelector('#ajustar').addEventListener('click', () => {
        form.peticion.value = ''; form.peticion.placeholder = 'Dime qué cambio: «el gimnasio mejor a las 19h», «más descanso»…';
        form.peticion.focus();
      });
      res.querySelector('#descartar').addEventListener('click', close);
    } catch (err) {
      historial.pop();
      res.innerHTML = `<div class="aviso" style="margin-top:12px">${esc(err instanceof ErrorIA ? err.message : 'No se pudo crear la propuesta. Inténtalo de nuevo.')}</div>
        ${err instanceof ErrorIA ? '<p class="mini">Mientras tanto puedes usar «⚙️ Generar semana», que funciona sin IA.</p>' : ''}`;
      console.error(err);
    } finally {
      form.querySelector('button.btn').disabled = false;
    }
  });
}

async function editarDisponibilidad() {
  const [disp, prefs] = await Promise.all([getDisponibilidad(), getPrefs()]);
  const copia = disp.map(d => d.map(f => ({ ...f })));
  const { el, close } = sheet('Disponibilidad', '<div id="cont"></div>');
  const cont = el.querySelector('#cont');

  function pintar() {
    cont.innerHTML = `
      <p class="sub">Tus horas <b>libres</b> para dedicar a tus objetivos cada día (fuera de trabajo, clases, comidas y sueño).</p>
      ${DIAS.map((d, i) => `<div class="card" style="padding:12px">
        <div class="fila sep" style="margin-bottom:6px"><b>${d}</b>
          <span class="fila" style="gap:6px">${i > 0 ? `<button type="button" class="btn gris chico" data-copiar="${i}">= ${DIAS[i - 1].slice(0, 3)}</button>` : ''}
          <button type="button" class="btn sec chico" data-mas="${i}">+ Franja</button></span></div>
        ${copia[i].length ? copia[i].map((f, j) => `<div class="franja">
          <input type="time" value="${f.inicio}" data-d="${i}" data-j="${j}" data-k="inicio"><span>–</span>
          <input type="time" value="${f.fin}" data-d="${i}" data-j="${j}" data-k="fin">
          <button type="button" class="btn-icon" data-quitar="${i}-${j}" aria-label="Quitar">✕</button></div>`).join('') : '<p class="mini">Día sin tiempo libre.</p>'}
      </div>`).join('')}
      <h3 style="margin:18px 4px 10px">Preferencias</h3>
      <div class="grid3">
        <label class="campo"><span>Sesión (min)</span><input type="number" id="sesion" min="15" step="15" value="${prefs.sesionMin}"></label>
        <label class="campo"><span>Descanso (min)</span><input type="number" id="descanso" min="0" step="5" value="${prefs.descansoMin}"></label>
        <label class="campo"><span>Máx. h/día</span><input type="number" id="max" min="1" max="16" step="0.5" value="${prefs.maxHorasDia}"></label>
      </div>
      <button class="btn ancho" id="guardar">Guardar</button>`;
    cont.querySelectorAll('input[data-d]').forEach(inp => inp.addEventListener('change', () => { copia[inp.dataset.d][inp.dataset.j][inp.dataset.k] = inp.value; }));
    cont.querySelectorAll('[data-mas]').forEach(b => b.addEventListener('click', () => {
      const d = copia[b.dataset.mas]; const ult = d[d.length - 1];
      d.push(ult ? { inicio: ult.fin, fin: ult.fin < '22:00' ? '22:00' : '23:30' } : { inicio: '18:00', fin: '21:00' });
      pintar();
    }));
    cont.querySelectorAll('[data-copiar]').forEach(b => b.addEventListener('click', () => {
      const i = Number(b.dataset.copiar); copia[i] = copia[i - 1].map(f => ({ ...f })); pintar();
    }));
    cont.querySelectorAll('[data-quitar]').forEach(b => b.addEventListener('click', () => {
      const [i, j] = b.dataset.quitar.split('-').map(Number); copia[i].splice(j, 1); pintar();
    }));
    cont.querySelector('#guardar').addEventListener('click', async () => {
      for (const d of copia) for (const f of d) if (toMin(f.fin) <= toMin(f.inicio)) return toast(`Revisa la franja ${f.inicio}–${f.fin}: el fin debe ser posterior al inicio.`);
      await saveDisponibilidad(copia.map(d => d.sort((a, b) => a.inicio.localeCompare(b.inicio))));
      await savePrefs({ sesionMin: Number(cont.querySelector('#sesion').value) || 60, descansoMin: Number(cont.querySelector('#descanso').value) || 0, maxHorasDia: Number(cont.querySelector('#max').value) || 4 });
      close(); toast('Disponibilidad guardada. Pulsa «Generar semana» para aplicarla.');
    });
  }
  pintar();
}

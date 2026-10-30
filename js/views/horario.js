// Pantalla «Horario»: vista día/semana, generador, horario a petición (IA) y disponibilidad.
import { db } from '../db.js';
import { getDisponibilidad, saveDisponibilidad, getPrefs, savePrefs, getSettings, getTurnos, saveTurnos, dispPorFecha } from '../datos.js';
import { tipoTurno, posicionEnPatron } from '../interprete.js';
import { esc, sheet, toast, refrescar, hoyISO, addDays, weekDates, weekday, fmtFecha, DIAS, toMin, opciones } from '../util.js';
import { bloqueHTML, conectarBloques, abrirEditorBloque, abrirEnvioIphone } from './comun.js';
import { generarSemana, ordenarBloques } from '../scheduler.js';
import { asignarFrases } from '../iphone.js';
import { abrirConfigurador } from './configurar.js';

const estado = { modo: 'dia', fecha: hoyISO(), avisos: [] };
const TURNO_TXT = { manana: 'mañana', tarde: 'tarde', noche: 'noche' };

export async function render(root) {
  const [goals, blocks, turnos] = await Promise.all([db.all('goals'), db.all('blocks'), getTurnos()]);
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
    ${turnos?.rotativo ? `<p class="mini centro" style="margin:-6px 0 10px">🏭 ${estado.modo === 'dia' ? 'Ese día' : 'Esa semana'} estás de turno de <b>${TURNO_TXT[tipoTurno(turnos, estado.fecha)]}</b></p>` : ''}
    <div class="chips">
      <button class="chip activa" id="plan">📝 Mi plan</button>
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
  root.querySelector('#plan').addEventListener('click', abrirConfigurador);
  root.querySelector('#generar').addEventListener('click', generar);
  root.querySelector('#enviar').addEventListener('click', () => abrirEnvioIphone(estado.modo === 'semana' ? 'semana' : estado.fecha === addDays(hoy, 1) ? 'manana' : 'hoy'));
  root.querySelector('#disp').addEventListener('click', editarDisponibilidad);
}

async function generar() {
  const [goals, blocks, disponibilidad, prefs, settings] = await Promise.all([db.all('goals'), db.all('blocks'), dispPorFecha(), getPrefs(), getSettings()]);
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

export async function editarDisponibilidad() {
  const [disp, prefs, turnos] = await Promise.all([getDisponibilidad(), getPrefs(), getTurnos()]);
  const clonar = semana => semana.map(d => d.map(f => ({ ...f })));
  // Con turnos rotativos se edita la plantilla de cada turno por separado.
  const rota = turnos?.rotativo && turnos.disponibilidad;
  const tipos = rota ? [...new Set(turnos.patron)] : [];
  const plantillas = rota ? Object.fromEntries(tipos.map(tp => [tp, clonar(turnos.disponibilidad[tp] || disp)])) : null;
  const hoy = hoyISO();
  let tipoEdit = rota ? tipoTurno(turnos, hoy) : null;
  let posActual = rota ? posicionEnPatron(turnos, hoy) : 0;
  let copia = rota ? plantillas[tipoEdit] : clonar(disp);
  const { el, close } = sheet('Disponibilidad', '<div id="cont"></div>');
  const cont = el.querySelector('#cont');
  const etiquetas = rota ? turnos.patron.map((tp, i) => {
    const n = turnos.patron.slice(0, i + 1).filter(x => x === tp).length, total = turnos.patron.filter(x => x === tp).length;
    return `${TURNO_TXT[tp][0].toUpperCase()}${TURNO_TXT[tp].slice(1)}${total > 1 ? ` (${n}.ª semana)` : ''}`;
  }) : [];

  function pintar() {
    cont.innerHTML = `
      <p class="sub">Tus horas <b>libres</b> para dedicar a tus objetivos cada día (fuera de trabajo, clases, comidas y sueño).</p>
      ${rota ? `<div class="card" style="padding:12px">
        <label class="campo" style="margin-bottom:8px"><span>🏭 Esta semana estoy de</span><select id="turno-actual">${opciones(etiquetas.map((e, i) => [i, e]), posActual)}</select></label>
        <div class="seg" style="margin:0">${tipos.map(tp => `<button type="button" data-plantilla="${tp}" class="${tp === tipoEdit ? 'activa' : ''}">Semanas de ${TURNO_TXT[tp]}</button>`).join('')}</div>
      </div>` : ''}
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
    cont.querySelectorAll('[data-plantilla]').forEach(b => b.addEventListener('click', () => { tipoEdit = b.dataset.plantilla; copia = plantillas[tipoEdit]; pintar(); }));
    cont.querySelector('#turno-actual')?.addEventListener('change', e => { posActual = Number(e.target.value); });
    cont.querySelector('#guardar').addEventListener('click', async () => {
      const semanas = rota ? Object.values(plantillas) : [copia];
      for (const s of semanas) for (const d of s) for (const f of d) if (toMin(f.fin) <= toMin(f.inicio)) return toast(`Revisa la franja ${f.inicio}–${f.fin}: el fin debe ser posterior al inicio.`);
      const ordenar = s => s.map(d => d.sort((a, b) => a.inicio.localeCompare(b.inicio)));
      if (rota) {
        // El turno elegido para esta semana fija dónde está el ciclo.
        const inicio = addDays(hoy, -((weekday(hoy) - turnos.inicioCiclo + 7) % 7));
        const nuevos = { ...turnos, referencia: addDays(inicio, -7 * posActual), disponibilidad: Object.fromEntries(Object.entries(plantillas).map(([k, v]) => [k, ordenar(v)])) };
        await saveTurnos(nuevos);
        await saveDisponibilidad(nuevos.disponibilidad[nuevos.patron[posActual]]);
      } else await saveDisponibilidad(ordenar(copia));
      await savePrefs({ sesionMin: Number(cont.querySelector('#sesion').value) || 60, descansoMin: Number(cont.querySelector('#descanso').value) || 0, maxHorasDia: Number(cont.querySelector('#max').value) || 4 });
      close(); toast('Disponibilidad guardada. Pulsa «Generar semana» para aplicarla.');
    });
  }
  pintar();
}

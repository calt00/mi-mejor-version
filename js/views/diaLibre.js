// «Día libre»: ¿seguro?, qué opinan los expertos, qué hacer ese día y una rutina provechosa si se quiere.
import { esc, sheet, toast, refrescar, fmtFecha } from '../util.js';
import { MOTIVOS, MOTIVO_TXT, getDiasLibres, diasLibresRecientes, opinionDiaLibre, sugerenciasPara, PREMARCADAS, marcarDiaLibre, quitarDiaLibre } from '../diasLibres.js';

const CLASE_NIVEL = { bien: 'nivel-bien', atencion: 'nivel-justo', exceso: 'nivel-poco' };

export async function abrirDiaLibre(fecha) {
  const libres = await getDiasLibres();
  const existente = libres[fecha];
  const recientes = diasLibresRecientes(libres, fecha);
  const s = { paso: 1, motivo: existente?.motivo || null, modo: null, quiere: null, elegidas: new Set(PREMARCADAS) };
  const { el, close } = sheet(`🏖️ Día libre · ${fmtFecha(fecha, { weekday: 'long', day: 'numeric', month: 'short' })}`, '<div id="dl"></div>');
  const cont = el.querySelector('#dl');

  const pie = (atras, texto, accion, activo = true) => `<div class="acciones" style="margin-top:14px">
    <button type="button" class="btn gris" data-accion="${atras}">${atras === 'cancelar' ? 'Cancelar' : '‹ Atrás'}</button>
    <button type="button" class="btn" data-accion="${accion}" ${activo ? '' : 'disabled'}>${texto}</button></div>`;

  const PASOS = {
    1() {
      const o = s.motivo ? opinionDiaLibre(s.motivo, recientes) : null;
      return `
        ${existente ? `<div class="card aviso-card"><b>Este día ya es libre</b>
          <div class="sub">${esc(MOTIVO_TXT[existente.motivo])} · ${existente.modo === 'rutina' ? 'haces tu rutina sin trabajar ni estudiar' : 'descanso total'}.</div>
          <div class="acciones"><button type="button" class="btn peligro chico" data-accion="quitar">Quitar día libre</button></div></div>` : ''}
        <h3 style="margin:4px 0 4px">¿Seguro que coges el día libre?</h3>
        <p class="sub">Dime por qué es libre y te doy una opinión sincera.</p>
        <div class="opciones-chip">${MOTIVOS.map(([v, t]) => `<button type="button" class="chip ${s.motivo === v ? 'activa' : ''}" data-accion="motivo" data-valor="${v}">${t}</button>`).join('')}</div>
        ${o ? `<div class="card sueno ${CLASE_NIVEL[o.nivel]}" style="margin-top:14px">
          <p style="margin:0 0 6px"><b>${o.icono} ${esc(o.titulo)}</b></p>
          <p class="sub" style="margin:0">${esc(o.texto)}</p>
          <p class="mini" style="margin:8px 0 0">Es una orientación general sobre descanso y prevención del agotamiento, no una norma.</p></div>` : ''}
        ${pie('cancelar', 'Sí, lo cojo ›', 'siguiente', Boolean(s.motivo))}`;
    },
    2() {
      return `
        <h3 style="margin:4px 0 4px">¿Qué quieres hacer ese día?</h3>
        <div class="b-opciones">
          <button type="button" class="b-opcion ${s.modo === 'rutina' ? 'activa' : ''}" data-accion="modo" data-valor="rutina">
            <b>🔁 Hacer mi rutina igualmente</b><span class="mini">Sin trabajar ni estudiar. Tus objetivos y hábitos siguen y cuentan en tus estadísticas.</span></button>
          <button type="button" class="b-opcion ${s.modo === 'libre' ? 'activa' : ''}" data-accion="modo" data-valor="libre">
            <b>🛋️ Tomarme el día libre del todo</b><span class="mini">Descansas. Ese día no cuenta en tus estadísticas, así que no te penaliza.</span></button>
        </div>
        ${pie('atras', s.modo === 'libre' ? 'Siguiente ›' : 'Confirmar día libre', s.modo === 'libre' ? 'siguiente' : 'confirmar', Boolean(s.modo))}`;
    },
    3() {
      const lista = sugerenciasPara(s.motivo);
      return `
        <h3 style="margin:4px 0 4px">${s.motivo === 'enfermo' ? 'Para recuperarte mejor' : 'Una rutina para tu día libre'}</h3>
        <p class="sub">${s.motivo === 'enfermo' ? 'Algunas cosas sencillas ayudan a recuperarte. Elige las que quieras.' : 'Un día libre sin nada de plan suele acabar en sofá y pantallas. Los expertos recomiendan combinar descanso con actividades que recarguen: aire libre, movimiento, gente que te cuide y una afición.'}</p>
        <div class="si-no">
          <button type="button" class="opcion-grande ${s.quiere === true ? 'activa' : ''}" data-accion="quiere" data-valor="si">✅ Sí, proponme una rutina</button>
          <button type="button" class="opcion-grande ${s.quiere === false ? 'activa' : ''}" data-accion="quiere" data-valor="no">No, solo descansar</button>
        </div>
        ${s.quiere ? `<div class="card plano" style="margin-top:12px"><ul class="lista">${lista.map(x => `
          <li style="align-items:flex-start"><input type="checkbox" class="elegir" data-sug="${x.id}" ${s.elegidas.has(x.id) ? 'checked' : ''} aria-label="${esc(x.titulo)}">
          <div class="grow"><div class="t">${x.emoji} ${esc(x.titulo)}</div><div class="mini">${x.hora} · ${x.min} min · ${esc(x.porque)}</div></div></li>`).join('')}</ul></div>
          <p class="mini">Las que marques se añaden a tu horario de ese día. Si no haces alguna, no pasa nada: no te penaliza.</p>` : ''}
        ${s.quiere === false ? '<p class="mini" style="margin-top:10px">Perfecto: ese día solo descansas y no cuenta en tus estadísticas.</p>' : ''}
        ${pie('atras', 'Confirmar día libre', 'confirmar', s.quiere != null)}`;
    },
  };

  const pintar = () => { cont.innerHTML = PASOS[s.paso](); };

  const ACCIONES = {
    motivo: v => { s.motivo = v; },
    siguiente: () => { s.paso = Math.min(3, s.paso + 1); },
    atras: () => { s.paso = Math.max(1, s.paso - 1); },
    cancelar: () => close(),
    modo: v => { s.modo = v; },
    quiere: v => { s.quiere = v === 'si'; },
    quitar: async () => {
      await quitarDiaLibre(fecha);
      close(); refrescar();
      toast('Día libre quitado. Para rehacer ese día, pulsa «Generar semana» en Horario.', 4000);
    },
    confirmar: async () => {
      await marcarDiaLibre({ fecha, motivo: s.motivo, modo: s.modo, extras: s.modo === 'libre' && s.quiere ? [...s.elegidas] : [] });
      close(); refrescar();
      toast(s.modo === 'rutina' ? '🔁 Día libre anotado: haces tu rutina sin trabajar.' : '🏖️ Día libre anotado. ¡A descansar!', 3500);
    },
  };

  cont.addEventListener('click', ev => {
    const b = ev.target.closest('[data-accion]');
    if (!b || b.disabled) return;
    const r = ACCIONES[b.dataset.accion]?.(b.dataset.valor);
    if (b.dataset.accion !== 'cancelar' && b.dataset.accion !== 'confirmar' && b.dataset.accion !== 'quitar') pintar();
    return r;
  });
  cont.addEventListener('change', ev => {
    const c = ev.target.closest('[data-sug]');
    if (c) c.checked ? s.elegidas.add(c.dataset.sug) : s.elegidas.delete(c.dataset.sug);
  });
  pintar();
}

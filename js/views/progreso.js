// Pantalla «Progreso»: gráfica de lo cumplido cada día, horas por objetivo, hábitos, logros y revisiones.
import { db, kvGet } from '../db.js';
import { areaColor } from '../datos.js';
import { esc, sheet, refrescar, hoyISO, addDays, monthKey, prevMonthKey, fmtFecha, weekStart } from '../util.js';
import { progresoDiario, mediaMovil, mediaSerie, horasPorObjetivo, mejorRacha, inicioHabito } from '../progreso.js';
import { barrasSVG, leyendaHTML, barrasObjetivos, calendarioHTML } from '../grafica.js';
import { LOGROS } from '../logros.js';
import { racha } from './comun.js';
import { abrirRevision } from './revision.js';

const estado = { rango: 30 };
const mayuscula = s => s.charAt(0).toUpperCase() + s.slice(1);

export async function render(root) {
  const hoy = hoyISO();
  const [goals, blocks, habits, tasks, inicioApp, logros, revisiones] = await Promise.all([
    db.all('goals'), db.all('blocks'), db.all('habits'), db.all('tasks'),
    kvGet('inicioApp', hoy), kvGet('logros', {}), kvGet('revisiones', []),
  ]);
  const n = estado.rango;
  const desde = addDays(hoy, -(n - 1));
  // Se calcula 6 días antes para que la media de 7 días empiece completa.
  const extendida = progresoDiario({ blocks, habits, tasks, desde: addDays(desde, -6), hasta: hoy, inicioApp });
  const serie = extendida.slice(6);
  const media = mediaMovil(extendida).slice(6);
  const promedio = mediaSerie(serie);
  const anterior = mediaSerie(progresoDiario({ blocks, habits, tasks, desde: addDays(desde, -n), hasta: addDays(desde, -1), inicioApp }));
  const diff = promedio != null && anterior != null ? promedio - anterior : null;
  const buenos = serie.filter(d => d.pct >= 80).length;
  const horas = horasPorObjetivo(goals, blocks, desde, hoy, n);
  const conseguidos = LOGROS.filter(l => logros[l.id]).length;

  root.innerHTML = `
    <div class="seg">${[7, 30, 90].map(r => `<button data-rango="${r}" class="${r === n ? 'activa' : ''}">${r} días</button>`).join('')}</div>

    <div class="card">
      <div class="fila sep" style="align-items:flex-end">
        <div><div class="grande">${promedio ?? '–'}${promedio != null ? ' %' : ''}</div>
          <div class="sub">cumplido de media</div></div>
        ${diff != null ? `<span class="badge ${diff >= 0 ? 'verde' : 'rojo'}">${diff >= 0 ? '▲' : '▼'} ${Math.abs(diff)} puntos vs. ${n} días antes</span>` : ''}
      </div>
      ${serie.some(d => d.pct != null) ? `${barrasSVG(serie, { linea: media })}${leyendaHTML()}
        <p class="mini" style="margin:8px 0 0">${buenos ? `🔥 ${buenos} ${buenos === 1 ? 'día' : 'días'} al 80 % o más. ` : ''}Cuenta los bloques del horario y los hábitos de cada día; las tareas que terminas suman extra.</p>`
        : '<div class="vacio"><span class="ico">📈</span>Aún no hay datos. Marca como hechos tus bloques y hábitos y aquí verás tu progreso día a día.</div>'}
    </div>

    <div class="seccion"><h2>Horas por objetivo</h2><span class="mini">últimos ${n} días</span></div>
    <div class="card">${horas.length ? barrasObjetivos(horas, areaColor) : '<p class="sub" style="margin:0">Cuando completes bloques de tus objetivos, verás aquí las horas dedicadas frente a las que te propusiste.</p>'}</div>

    <div class="seccion"><h2>Hábitos</h2></div>
    ${habits.length ? `<div class="card plano"><ul class="lista">${habits.map(h => `
      <li class="toque" data-habito="${h.id}"><span style="font-size:24px">${esc(h.emoji || '✨')}</span>
        <div class="grow"><div class="t">${esc(h.titulo)}</div>
        <div class="mini">🔥 ${racha(h)} ahora · 🏆 mejor racha ${mejorRacha(h)} · ${h.registros.length} días en total</div></div>
        <span class="mini">📅 ›</span></li>`).join('')}</ul></div>`
      : '<div class="card vacio">Añade hábitos desde la pantalla Hoy y aquí verás su calendario.</div>'}

    <div class="seccion"><h2>Logros</h2><span class="badge">${conseguidos}/${LOGROS.length}</span></div>
    <div class="medallas">${LOGROS.map(l => `
      <div class="medalla ${logros[l.id] ? '' : 'bloqueada'}" title="${esc(l.desc)}">
        <div class="ico">${l.icono}</div><div class="t">${esc(l.titulo)}</div>
        <div class="mini">${logros[l.id] ? `✓ ${esc(fmtFecha(logros[l.id], { day: 'numeric', month: 'short' }))}` : esc(l.desc)}</div></div>`).join('')}</div>

    <div class="seccion"><h2>Revisiones semanales</h2><button class="btn sec chico" id="revision">Esta semana</button></div>
    ${revisiones.length ? `<div class="card plano"><ul class="lista">${[...revisiones].reverse().map(r => `
      <li class="toque" data-semana="${r.semana}"><div class="grow"><div class="t">Semana del ${esc(fmtFecha(r.semana, { day: 'numeric', month: 'long' }))}</div>
        <div class="mini">${r.numeros.pct ?? '–'}${r.numeros.pct != null ? ' %' : ''} cumplido · ${r.numeros.bloques.hechos}/${r.numeros.bloques.total} bloques${r.texto ? ' · 💬' : ''}</div></div><span class="mini">›</span></li>`).join('')}</ul></div>`
      : '<div class="card vacio">Cada domingo tendrás aquí el resumen de tu semana.</div>'}`;

  root.querySelectorAll('[data-rango]').forEach(b => b.addEventListener('click', () => { estado.rango = Number(b.dataset.rango); refrescar(); }));
  root.querySelectorAll('[data-habito]').forEach(el => el.addEventListener('click', () => abrirCalendarioHabito(el.dataset.habito)));
  root.querySelectorAll('[data-semana]').forEach(el => el.addEventListener('click', () => abrirRevision(el.dataset.semana)));
  root.querySelector('#revision').addEventListener('click', () => abrirRevision(weekStart(hoy)));
}

/** Calendario mensual de un hábito; tocar un día lo marca o desmarca. */
export async function abrirCalendarioHabito(id) {
  const h = await db.get('habits', id);
  if (!h) return;
  const inicioApp = await kvGet('inicioApp', hoyISO());
  let mk = monthKey(hoyISO());
  const { el } = sheet(`${h.emoji || '✨'} ${h.titulo}`, '<div id="cal"></div>', { onClose: refrescar });
  const cont = el.querySelector('#cal');

  const pintar = () => {
    const marcados = new Set(h.registros);
    cont.innerHTML = `
      <div class="regla" style="margin-bottom:14px">
        <div><b>🔥 ${racha(h)}</b><span class="mini">racha actual</span></div>
        <div><b>🏆 ${mejorRacha(h)}</b><span class="mini">mejor racha</span></div>
        <div><b>${h.registros.length}</b><span class="mini">días en total</span></div>
      </div>
      <div class="card">
        <div class="fila sep" style="margin-bottom:10px">
          <button class="btn-icon" data-mes="-1" aria-label="Mes anterior">‹</button>
          <b>${esc(mayuscula(fmtFecha(`${mk}-01`, { month: 'long', year: 'numeric' })))}</b>
          <button class="btn-icon" data-mes="1" aria-label="Mes siguiente" ${mk >= monthKey(hoyISO()) ? 'disabled' : ''}>›</button>
        </div>
        ${calendarioHTML(mk, marcados, { desde: inicioHabito(h, inicioApp) })}
      </div>
      <p class="mini centro">Toca un día para marcarlo o desmarcarlo (por si se te olvidó apuntarlo).</p>`;
    cont.querySelectorAll('[data-mes]').forEach(b => b.addEventListener('click', () => {
      mk = b.dataset.mes === '1' ? prevMonthKey(mk, -1) : prevMonthKey(mk, 1);
      pintar();
    }));
    cont.querySelectorAll('[data-dia]').forEach(b => b.addEventListener('click', async () => {
      const f = b.dataset.dia;
      h.registros = h.registros.includes(f) ? h.registros.filter(d => d !== f) : [...h.registros, f].sort();
      await db.put('habits', h);
      pintar();
    }));
  };
  pintar();
}

// Pantalla «Hoy»: progreso del día, bloques, consejo del coach, hábitos y ahorro.
import { db, kvGet, kvSet } from '../db.js';
import { getProfile } from '../datos.js';
import { esc, hoyISO, fmtFecha, sheet, formData, toast, refrescar, uid, fmtEur, miniMarkdown } from '../util.js';
import { bloqueHTML, conectarBloques, abrirEditorBloque, abrirEnvioIphone, racha, datosFinanzas, cargando, momentoBloque } from './comun.js';
import { iaDisponible, consejoDelDia } from '../coach.js';
import { estadoMeta, recomendaciones } from '../finanzas.js';
import { cerditoHTML } from '../cerdito.js';

function saludo(nombre) {
  const h = new Date().getHours();
  const s = h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
  return nombre ? `${s}, ${nombre}` : s;
}

export async function render(root) {
  const hoy = hoyISO();
  const [perfil, goals, blocks, habits, fin] = await Promise.all([getProfile(), db.all('goals'), db.all('blocks'), db.all('habits'), datosFinanzas()]);
  const goalsById = Object.fromEntries(goals.map(g => [g.id, g]));
  const deHoy = blocks.filter(b => b.fecha === hoy).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const hechos = deHoy.filter(b => b.hecho).length;
  const pct = deHoy.length ? Math.round(hechos / deHoy.length * 100) : 0;
  const actual = deHoy.find(b => momentoBloque(b) === 'ahora' && !b.hecho);
  const siguiente = deHoy.find(b => momentoBloque(b) === 'futuro' && !b.hecho);

  const metas = fin.savingsGoals.map(m => ({ ...m, ...estadoMeta(m, fin.contributions, hoy) }));
  const totalAhorrado = metas.reduce((a, m) => a + m.ahorrado, 0);
  const totalMeta = metas.reduce((a, m) => a + (Number(m.meta) || 0), 0);
  const rec = recomendaciones(fin)[0];

  let estado = 'Sin bloques para hoy.';
  if (actual) estado = `Ahora: <b>${esc(actual.titulo)}</b> hasta las ${actual.fin}`;
  else if (siguiente) estado = `Siguiente: <b>${esc(siguiente.titulo)}</b> a las ${siguiente.inicio}`;
  else if (deHoy.length && hechos === deHoy.length) estado = '¡Has completado todo lo de hoy! 🎉';
  else if (deHoy.length) estado = 'No quedan bloques pendientes por hoy.';

  root.innerHTML = `
    <p class="sub" style="margin:0 4px 12px">${fmtFecha(hoy)} · ${esc(saludo(perfil.nombre))}</p>

    <div class="card">
      <div class="fila">
        <div class="anillo" style="--p:${pct}"><span>${pct}%</span></div>
        <div class="grow" style="flex:1">
          <div style="font-weight:700">${deHoy.length ? `${hechos} de ${deHoy.length} bloques hechos` : 'Tu día está libre'}</div>
          <div class="sub">${estado}</div>
        </div>
      </div>
      <div class="acciones">
        <button class="btn chico" id="enviar">📲 Enviar al iPhone</button>
        <button class="btn sec chico" id="nuevo-bloque">+ Bloque</button>
        <a class="btn gris chico" href="#horario">Ver horario</a>
      </div>
    </div>

    <div class="card" id="consejo" hidden></div>

    <div class="seccion"><h2>Tu día</h2></div>
    ${deHoy.length ? `<div class="bloques">${deHoy.map(b => bloqueHTML(b, goalsById)).join('')}</div>` : `
      <div class="card vacio"><span class="ico">🗓️</span>No tienes nada planificado para hoy.
        <div class="acciones" style="justify-content:center"><a class="btn chico" href="#horario">Crear mi horario</a></div></div>`}

    <div class="seccion"><h2>Hábitos</h2><button class="btn sec chico" id="habitos">${habits.length ? 'Gestionar' : '+ Hábito'}</button></div>
    ${habits.length ? `<div class="habitos">${habits.map(h => {
      const on = h.registros.includes(hoy), r = racha(h);
      return `<div class="habito ${on ? 'on' : ''}" data-habito="${h.id}" role="button" aria-pressed="${on}">
        <div class="e">${esc(h.emoji || '✨')}</div><div class="t">${esc(h.titulo)}</div><div class="r">${r ? `🔥 ${r}` : '&nbsp;'}</div></div>`;
    }).join('')}</div>` : '<div class="card vacio">Añade hábitos diarios (beber agua, leer, meditar…) y mantén tu racha. 🔥</div>'}

    <div class="seccion"><h2>Ahorro</h2><a class="btn sec chico" href="#ahorro">Abrir</a></div>
    <a class="card hero-ahorro" href="#ahorro" style="color:inherit">
      <div class="cerdito-caja">${cerditoHTML(totalMeta ? totalAhorrado / totalMeta : 0)}</div>
      <div>
        <div class="grande">${fmtEur(totalAhorrado, true)}</div>
        <div class="sub">${totalMeta ? `ahorrado de ${fmtEur(totalMeta, true)}` : 'Crea tu primera meta de ahorro'}</div>
        ${rec ? `<div class="mini" style="margin-top:6px">${rec.icono} ${esc(rec.titulo)}</div>` : ''}
      </div>
    </a>`;

  conectarBloques(root, deHoy);
  root.querySelector('#enviar').addEventListener('click', () => abrirEnvioIphone('hoy'));
  root.querySelector('#nuevo-bloque').addEventListener('click', () => abrirEditorBloque(null, { fecha: hoy }));
  root.querySelector('#habitos').addEventListener('click', () => gestionarHabitos(habits));
  root.querySelectorAll('[data-habito]').forEach(el => el.addEventListener('click', async () => {
    const h = habits.find(x => x.id === el.dataset.habito);
    const on = h.registros.includes(hoy);
    h.registros = on ? h.registros.filter(d => d !== hoy) : [...h.registros, hoy];
    await db.put('habits', h);
    if (!on) { navigator.vibrate?.(30); const r = racha(h); if (r > 1) toast(`🔥 ¡Racha de ${r} días!`); }
    refrescar();
  }));

  pintarConsejo(root.querySelector('#consejo'));
}

async function pintarConsejo(caja, forzar = false) {
  const hoy = hoyISO();
  const guardado = await kvGet('consejoDia');
  if (guardado?.fecha === hoy && !forzar) return mostrar(caja, guardado.texto);
  if (!(await iaDisponible())) return;
  caja.hidden = false;
  caja.innerHTML = cargando('Tu coach está pensando el consejo del día…');
  try {
    const texto = await consejoDelDia();
    await kvSet('consejoDia', { fecha: hoy, texto });
    mostrar(caja, texto);
  } catch (e) {
    caja.innerHTML = `<div class="mini">💬 No se pudo cargar el consejo del día: ${esc(e.message)}</div>
      <button class="btn gris chico" style="margin-top:8px">Reintentar</button>`;
    caja.querySelector('button').addEventListener('click', () => pintarConsejo(caja, true));
  }
}

function mostrar(caja, texto) {
  if (!caja.isConnected) return;
  caja.hidden = false;
  caja.innerHTML = `<div class="fila sep"><b>💬 Consejo del día</b><button class="btn-icon" aria-label="Otro consejo">↻</button></div>
    <div style="margin-top:6px">${miniMarkdown(texto)}</div>
    <div class="acciones"><a class="btn sec chico" href="#coach">Hablar con el coach</a></div>`;
  caja.querySelector('.btn-icon').addEventListener('click', () => pintarConsejo(caja, true));
}

function gestionarHabitos(habits) {
  const { el, close } = sheet('Hábitos', `
    ${habits.length ? `<div class="card plano"><ul class="lista">${habits.map(h => `
      <li><span style="font-size:24px">${esc(h.emoji || '✨')}</span><div class="grow"><div class="t">${esc(h.titulo)}</div>
      <div class="mini">🔥 Racha: ${racha(h)} días · ${h.registros.length} días en total</div></div>
      <button class="btn-icon" data-borrar="${h.id}" aria-label="Borrar">🗑</button></li>`).join('')}</ul></div>` : ''}
    <form class="card">
      <h3 style="margin-bottom:10px">Nuevo hábito</h3>
      <div class="fila"><input name="emoji" maxlength="4" placeholder="💧" style="width:64px;text-align:center">
      <input name="titulo" required placeholder="Ej.: Beber 2 L de agua"></div>
      <button class="btn ancho" style="margin-top:10px">Añadir</button>
    </form>`);
  el.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault();
    const d = formData(e.target);
    await db.put('habits', { id: uid(), titulo: d.titulo, emoji: d.emoji || '✨', registros: [] });
    close(); refrescar();
  });
  el.querySelectorAll('[data-borrar]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('¿Borrar este hábito y su racha?')) return;
    await db.del('habits', b.dataset.borrar);
    close(); refrescar();
  }));
}

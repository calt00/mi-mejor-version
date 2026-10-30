// Pantalla «Hoy»: progreso del día, asistente, bloques, hábitos y ahorro.
import { db, kvGet, kvSet } from '../db.js';
import { getProfile } from '../datos.js';
import { esc, hoyISO, fmtFecha, sheet, formData, toast, refrescar, uid, fmtEur, addDays, diasEntre } from '../util.js';
import { bloqueHTML, conectarBloques, abrirEditorBloque, abrirEnvioIphone, racha, datosFinanzas, momentoBloque } from './comun.js';
import { responder, mensajeHTML, conectarMensajes } from './asistente.js';
import { estadoMeta, recomendaciones } from '../finanzas.js';
import { cerditoHTML } from '../cerdito.js';
import { progresoDiario, mediaSerie, semanaPendiente } from '../progreso.js';
import { barrasSVG } from '../grafica.js';
import { comprobarLogros } from '../logros.js';
import { abrirRevision } from './revision.js';
import { abrirCalendarioHabito } from './progreso.js';
import { exportar } from './perfil.js';

const DIAS_ENTRE_COPIAS = 7;

// Aviso si hay datos y hace más de una semana que no se hace copia.
function tocaCopia({ hoy, ultimaCopia, copiaPospuesta, inicioApp, hayDatos }) {
  if (!hayDatos || (copiaPospuesta && copiaPospuesta > hoy)) return null;
  const dias = diasEntre(ultimaCopia || inicioApp, hoy);
  return dias >= DIAS_ENTRE_COPIAS ? { dias, nunca: !ultimaCopia } : null;
}

function saludo(nombre) {
  const h = new Date().getHours();
  const s = h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
  return nombre ? `${s}, ${nombre}` : s;
}

export async function render(root) {
  const hoy = hoyISO();
  const [perfil, goals, blocks, habits, tasks, fin, revisiones, ultimaCopia, copiaPospuesta] = await Promise.all([
    getProfile(), db.all('goals'), db.all('blocks'), db.all('habits'), db.all('tasks'), datosFinanzas(),
    kvGet('revisiones', []), kvGet('ultimaCopia'), kvGet('copiaPospuesta'),
  ]);
  const inicioApp = fin.inicioApp || hoy;
  const semana = progresoDiario({ blocks, habits, tasks, desde: addDays(hoy, -6), hasta: hoy, inicioApp });
  const mediaSemana = mediaSerie(semana);
  const lunesRevision = semanaPendiente(hoy, revisiones, inicioApp);
  const hayDatos = goals.length + blocks.length + habits.length + fin.expenses.length + fin.savingsGoals.length > 0;
  const copia = tocaCopia({ hoy, ultimaCopia, copiaPospuesta, inicioApp, hayDatos });
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

    ${lunesRevision ? `<div class="card aviso-card">
      <div class="fila"><span style="font-size:30px">📋</span><div class="grow" style="flex:1">
        <b>Tu revisión semanal está lista</b><div class="sub">Mira cómo te ha ido esta semana y qué mejorar en la siguiente.</div></div></div>
      <div class="acciones"><button class="btn chico" id="revision">Ver mi semana</button></div></div>` : ''}

    ${copia ? `<div class="card aviso-card naranja">
      <div class="fila"><span style="font-size:30px">💾</span><div class="grow" style="flex:1">
        <b>${copia.nunca ? 'Aún no has hecho ninguna copia' : `Hace ${copia.dias} días de tu última copia`}</b>
        <div class="sub">Tus datos solo están en este iPhone. Guarda una copia en Archivos o iCloud Drive por si cambias de móvil.</div></div></div>
      <div class="acciones"><button class="btn chico" id="copia">Hacer copia ahora</button><button class="btn gris chico" id="copia-luego">Más tarde</button></div></div>` : ''}

    <div class="card" id="asistente">
      <div class="fila sep"><b>🤖 Tu asistente</b><a class="mini" href="#asistente">Abrir chat ›</a></div>
      <form id="orden" class="fila" style="margin-top:8px">
        <input name="texto" placeholder="«hoy no puedo», «ya he hecho inglés», «5 € en café»…" autocomplete="off" enterkeyhint="send">
        <button class="btn" style="flex:none;padding:0 14px" aria-label="Enviar">↑</button>
      </form>
      <div id="respuesta"></div>
    </div>

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

    <div class="seccion"><h2>Tu progreso</h2><a class="btn sec chico" href="#progreso">Ver más</a></div>
    <a class="card" href="#progreso" style="display:block;color:inherit">
      ${semana.some(d => d.pct != null) ? `<div class="fila sep"><span class="sub">Últimos 7 días</span><b>${mediaSemana} % de media</b></div>
        ${barrasSVG(semana, { compacto: true })}` : '<div class="sub">📈 Marca tus bloques y hábitos como hechos y aquí verás una gráfica de tu progreso día a día.</div>'}
    </a>

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
  root.querySelector('#revision')?.addEventListener('click', () => abrirRevision(lunesRevision).then(() => setTimeout(refrescar, 300)));
  root.querySelector('#copia')?.addEventListener('click', async () => { if (await exportar()) refrescar(); });
  root.querySelector('#copia-luego')?.addEventListener('click', async () => { await kvSet('copiaPospuesta', addDays(hoy, 2)); refrescar(); });

  conectarAsistente(root.querySelector('#asistente'));
  comprobarLogros().catch(e => console.warn('Logros:', e));
}

// Caja para escribir al asistente sin salir de «Hoy»: muestra su respuesta y, si cambia algo, refresca la pantalla.
function conectarAsistente(caja) {
  const form = caja.querySelector('#orden'), zona = caja.querySelector('#respuesta');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const texto = form.texto.value.trim();
    if (!texto) return;
    form.texto.value = '';
    const m = await responder(texto);
    if (m.ops) { recordar(m); refrescar(); return; }
    pintar(m);
  });
  const recordar = m => { try { sessionStorage.setItem('respuestaAsistente', JSON.stringify(m)); } catch { /* sin almacenamiento */ } };
  const pintar = m => {
    zona.innerHTML = `<div class="respuesta-asistente">${mensajeHTML(m)}</div>`;
    zona.querySelector('.msg')?.classList.remove('msg', 'model');
    conectarMensajes(zona, [m], nueva => { if (nueva.ops) { recordar(nueva); refrescar(); } else pintar(nueva); }, refrescar);
  };
  // Tras un cambio se repinta «Hoy» y se vuelve a enseñar la última respuesta (con su «Deshacer»).
  let guardada = null;
  try { guardada = JSON.parse(sessionStorage.getItem('respuestaAsistente') || 'null'); sessionStorage.removeItem('respuestaAsistente'); } catch { /* sin almacenamiento */ }
  if (guardada) pintar(guardada);
}

function gestionarHabitos(habits) {
  const { el, close } = sheet('Hábitos', `
    ${habits.length ? `<div class="card plano"><ul class="lista">${habits.map(h => `
      <li><span style="font-size:24px">${esc(h.emoji || '✨')}</span><div class="grow"><div class="t">${esc(h.titulo)}</div>
      <div class="mini">🔥 Racha: ${racha(h)} días · ${h.registros.length} días en total</div></div>
      <button class="btn-icon" data-calendario="${h.id}" aria-label="Ver calendario">📅</button>
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
    await db.put('habits', { id: uid(), titulo: d.titulo, emoji: d.emoji || '✨', registros: [], creado: hoyISO() });
    close(); refrescar();
  });
  el.querySelectorAll('[data-calendario]').forEach(b => b.addEventListener('click', () => { close(); setTimeout(() => abrirCalendarioHabito(b.dataset.calendario), 260); }));
  el.querySelectorAll('[data-borrar]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('¿Borrar este hábito y su racha?')) return;
    await db.del('habits', b.dataset.borrar);
    close(); refrescar();
  }));
}

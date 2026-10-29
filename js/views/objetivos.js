// Pantalla «Objetivos»: lista, detalle con tareas y «¿Cómo empiezo?».
import { db } from '../db.js';
import { AREAS, MOMENTOS, PRIORIDADES, areaNombre, areaColor, getPrefs } from '../datos.js';
import { esc, sheet, formData, toast, refrescar, uid, hoyISO, weekDates, fmtHoras, opciones, miniMarkdown, diasEntre } from '../util.js';
import { duracionMin, cargando } from './comun.js';
import { comoEmpiezo, ErrorIA } from '../coach.js';

let verArchivados = false;

function progreso(g, tasks, blocks) {
  const ts = tasks.filter(t => t.goalId === g.id);
  const semana = new Set(weekDates(hoyISO()));
  const bs = blocks.filter(b => b.goalId === g.id && semana.has(b.fecha));
  const hechoMin = bs.filter(b => b.hecho).reduce((a, b) => a + duracionMin(b), 0);
  return { ts, hechas: ts.filter(t => t.hecho).length, hechoMin, objetivoMin: (g.horasSemana || 0) * 60 };
}

export async function render(root) {
  const [goals, tasks, blocks] = await Promise.all([db.all('goals'), db.all('tasks'), db.all('blocks')]);
  const lista = goals.filter(g => !!g.archivado === verArchivados)
    .sort((a, b) => (b.prioridad - a.prioridad) || a.titulo.localeCompare(b.titulo));
  const archivados = goals.filter(g => g.archivado).length;

  root.innerHTML = `
    ${lista.length ? lista.map(g => {
      const p = progreso(g, tasks, blocks);
      const pctH = p.objetivoMin ? Math.min(100, p.hechoMin / p.objetivoMin * 100) : 0;
      const dias = g.fechaLimite ? diasEntre(hoyISO(), g.fechaLimite) : null;
      return `<div class="card toque" data-goal="${g.id}" style="border-left:5px solid ${areaColor(g.area)}">
        <div class="fila sep"><span class="mini">${esc(areaNombre(g.area))}</span>
          <span class="badge ${g.prioridad == 3 ? 'rojo' : g.prioridad == 2 ? 'naranja' : ''}">${g.prioridad == 3 ? 'Alta' : g.prioridad == 2 ? 'Media' : 'Baja'}</span></div>
        <h3 style="margin:4px 0 2px;font-size:18px">${esc(g.titulo)}</h3>
        ${g.porque ? `<p class="sub" style="margin:0 0 8px">${esc(g.porque)}</p>` : ''}
        ${p.objetivoMin ? `<div class="mini">Esta semana: ${fmtHoras(p.hechoMin)} de ${fmtHoras(p.objetivoMin)}</div>
          <div class="barra" style="margin:4px 0 8px"><i style="width:${pctH}%;background:${areaColor(g.area)}"></i></div>` : ''}
        <div class="fila sep mini"><span>✅ ${p.hechas}/${p.ts.length} tareas</span>
          ${dias != null ? `<span>${dias >= 0 ? `⏳ ${dias} días` : '⌛ Fecha pasada'}</span>` : ''}</div>
      </div>`;
    }).join('') : `<div class="card vacio"><span class="ico">🎯</span>
      ${verArchivados ? 'No tienes objetivos archivados.' : 'Aún no tienes objetivos. Crea el primero: algo que quieras conseguir y cuántas horas a la semana quieres dedicarle.'}
      ${verArchivados ? '' : '<div class="acciones" style="justify-content:center"><button class="btn chico" data-nuevo>Crear objetivo</button></div>'}</div>`}
    ${archivados || verArchivados ? `<div class="centro"><button class="btn gris chico" id="archivo">${verArchivados ? '← Ver activos' : `Ver archivados (${archivados})`}</button></div>` : ''}
    <button class="fab" data-nuevo aria-label="Nuevo objetivo">+</button>`;

  root.querySelectorAll('[data-nuevo]').forEach(b => b.addEventListener('click', () => editarObjetivo()));
  root.querySelector('#archivo')?.addEventListener('click', () => { verArchivados = !verArchivados; refrescar(); });
  root.querySelectorAll('[data-goal]').forEach(el => el.addEventListener('click', () => detalle(goals.find(g => g.id === el.dataset.goal))));
}

export async function editarObjetivo(g = null, valores = {}) {
  const prefs = await getPrefs();
  const v = { titulo: '', porque: '', area: 'personal', prioridad: 2, horasSemana: 3, sesionMin: '', momento: 'cualquiera', fechaLimite: '', ...g, ...valores };
  const { el, close } = sheet(g ? 'Editar objetivo' : 'Nuevo objetivo', `
    <form>
      <label class="campo"><span>¿Qué quieres conseguir?</span><input name="titulo" required value="${esc(v.titulo)}" placeholder="Ej.: Correr 10 km, aprender inglés…"></label>
      <label class="campo"><span>¿Por qué es importante para ti?</span><textarea name="porque" placeholder="Tu motivo te ayudará en los días difíciles">${esc(v.porque)}</textarea></label>
      <div class="grid2">
        <label class="campo"><span>Área</span><select name="area">${opciones(AREAS, v.area)}</select></label>
        <label class="campo"><span>Prioridad</span><select name="prioridad">${opciones(PRIORIDADES, v.prioridad)}</select></label>
      </div>
      <div class="grid2">
        <label class="campo"><span>Horas por semana</span><input type="number" name="horasSemana" min="0" max="80" step="0.5" value="${v.horasSemana ?? ''}"></label>
        <label class="campo"><span>Sesión (min)</span><input type="number" name="sesionMin" min="15" max="240" step="15" value="${v.sesionMin ?? ''}" placeholder="${prefs.sesionMin}"></label>
      </div>
      <label class="campo"><span>Mejor momento del día</span><select name="momento">${opciones(MOMENTOS, v.momento)}</select></label>
      <label class="campo"><span>Fecha límite (opcional)</span><input type="date" name="fechaLimite" value="${v.fechaLimite || ''}"></label>
      <button class="btn ancho">${g ? 'Guardar' : 'Crear objetivo'}</button>
    </form>`);
  el.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault();
    const d = formData(e.target);
    await db.put('goals', { id: g?.id || uid(), creado: g?.creado || hoyISO(), archivado: g?.archivado || false, ...d,
      prioridad: Number(d.prioridad), horasSemana: d.horasSemana || 0, sesionMin: d.sesionMin || null });
    close(); refrescar();
    toast(g ? 'Objetivo guardado' : '🎯 ¡Objetivo creado! Ve a Horario para planificarlo.');
  });
}

async function detalle(g) {
  const tasks = (await db.all('tasks')).filter(t => t.goalId === g.id).sort((a, b) => (a.hecho - b.hecho) || (a.creado - b.creado));
  const { el, close } = sheet(g.titulo, `
    <p class="sub">${esc(areaNombre(g.area))} · ${g.horasSemana || 0} h/semana${g.fechaLimite ? ` · hasta el ${g.fechaLimite}` : ''}</p>
    ${g.porque ? `<p class="nota">💭 ${esc(g.porque)}</p>` : ''}

    <button class="btn ancho" id="empezar" style="margin:6px 0 4px">💡 ¿Cómo empiezo?</button>
    <div id="ia"></div>

    <div class="seccion"><h2>Pasos y tareas</h2></div>
    <div class="card plano"><ul class="lista" id="tareas">${tasks.length ? tasks.map(t => `
      <li><button class="check ${t.hecho ? 'on' : ''}" data-t="${t.id}">${t.hecho ? '✓' : ''}</button>
      <div class="grow" style="${t.hecho ? 'text-decoration:line-through;opacity:.6' : ''}">${esc(t.titulo)}</div>
      <button class="btn-icon" data-del="${t.id}" aria-label="Borrar">✕</button></li>`).join('') : '<li class="sub">Sin tareas todavía. Divide tu objetivo en pasos pequeños.</li>'}</ul></div>
    <form id="nueva" class="fila" style="margin-bottom:16px"><input name="titulo" placeholder="Nueva tarea…" required><button class="btn" style="flex:none">+</button></form>

    <div class="acciones">
      <button class="btn gris chico" id="editar">✏️ Editar</button>
      <button class="btn gris chico" id="archivar">${g.archivado ? '📤 Reactivar' : '📦 Archivar'}</button>
      <button class="btn peligro chico" id="borrar">🗑 Eliminar</button>
    </div>`, { onClose: refrescar });

  const reabrir = () => { close(); setTimeout(() => detalle(g), 260); };
  el.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', async () => {
    const t = tasks.find(x => x.id === b.dataset.t);
    await db.put('tasks', { ...t, hecho: !t.hecho });
    if (!t.hecho) toast('✅ ¡Tarea completada!');
    reabrir();
  }));
  el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => { await db.del('tasks', b.dataset.del); reabrir(); }));
  el.querySelector('#nueva').addEventListener('submit', async e => {
    e.preventDefault();
    await db.put('tasks', { id: uid(), goalId: g.id, titulo: e.target.titulo.value.trim(), hecho: false, creado: Date.now() });
    reabrir();
  });
  el.querySelector('#editar').addEventListener('click', () => { close(); setTimeout(() => editarObjetivo(g), 260); });
  el.querySelector('#archivar').addEventListener('click', async () => { await db.put('goals', { ...g, archivado: !g.archivado }); close(); });
  el.querySelector('#borrar').addEventListener('click', async () => {
    if (!confirm(`¿Eliminar «${g.titulo}» y sus tareas? Los bloques del horario se quedarán sin objetivo.`)) return;
    await db.delMany('tasks', tasks.map(t => t.id));
    await db.del('goals', g.id);
    close();
  });

  el.querySelector('#empezar').addEventListener('click', async () => {
    const zona = el.querySelector('#ia');
    zona.innerHTML = cargando('Tu coach está preparando un plan para arrancar…');
    try {
      const r = await comoEmpiezo(g, tasks);
      zona.innerHTML = `<div class="card">
        <div>${miniMarkdown(r.consejo)}</div>
        <ol style="padding-left:20px;margin:10px 0">${r.pasos.map((p, i) => `<li style="margin-bottom:8px"><b>${esc(p.titulo)}</b><br><span class="sub">${esc(p.detalle)}</span>
          <br><button class="btn sec chico" style="margin-top:4px" data-paso="${i}">+ Añadir como tarea</button></li>`).join('')}</ol>
        <button class="btn ancho" id="todos">Añadir todos los pasos</button></div>`;
      const anadir = async pasos => {
        await db.putMany('tasks', pasos.map((p, i) => ({ id: uid(), goalId: g.id, titulo: p.titulo, hecho: false, creado: Date.now() + i })));
        toast(pasos.length > 1 ? `✅ ${pasos.length} tareas añadidas` : '✅ Tarea añadida');
      };
      const anadidos = new Set();
      zona.querySelectorAll('[data-paso]').forEach(b => b.addEventListener('click', async () => {
        anadidos.add(Number(b.dataset.paso));
        await anadir([r.pasos[b.dataset.paso]]); b.disabled = true; b.textContent = '✓ Añadida';
      }));
      zona.querySelector('#todos').addEventListener('click', async () => {
        const pendientes = r.pasos.filter((_, i) => !anadidos.has(i));
        if (pendientes.length) await anadir(pendientes);
        reabrir();
      });
    } catch (e) {
      zona.innerHTML = `<div class="aviso">${esc(e instanceof ErrorIA ? e.message : 'No se pudo generar el plan. Inténtalo de nuevo.')}</div>`;
    }
  });
}

// Pantalla «Perfil»: datos personales, ajustes, guías y copia de seguridad.
import { exportAll, importAll, kvGet, kvSet } from '../db.js';
import { getProfile, saveProfile, getSettings, saveSettings } from '../datos.js';
import { esc, formData, toast, refrescar, sheet, miniMarkdown, hoyISO, opciones, fmtFecha } from '../util.js';
import { mostrarBienvenida } from './bienvenida.js';
import { abrirPlan } from './plan.js';

export async function render(root) {
  const [p, s, ultimaCopia, situacion] = await Promise.all([getProfile(), getSettings(), kvGet('ultimaCopia'), kvGet('miSituacion')]);
  let persistente = null;
  try { persistente = await navigator.storage?.persisted?.(); } catch { /* sin soporte */ }
  const instalada = matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  root.innerHTML = `
    ${!instalada ? `<div class="aviso">📱 <b>Instálala en tu iPhone</b>: en Safari pulsa Compartir → «Añadir a pantalla de inicio». Así se abre como una app y tus datos quedan a salvo. <a href="#" data-guia="acceso-rapido">Ver cómo</a></div>` : ''}

    <div class="card">
      <h3 style="margin-bottom:4px">📝 Tu situación y tus propósitos</h3>
      <p class="mini" style="margin-bottom:10px">${situacion?.texto ? `Me lo contaste el ${fmtFecha(situacion.fecha, { day: 'numeric', month: 'long' })}. Si tu vida cambia (nuevo trabajo, exámenes, vacaciones…), actualízalo y rehago tu plan.` : 'Cuéntame tu vida y tus objetivos con tus palabras y organizo tu horario, tus hábitos y tu ahorro por ti.'}</p>
      ${situacion?.texto ? `<p class="nota" style="white-space:pre-line;max-height:120px;overflow:hidden">${esc(situacion.texto)}</p>` : ''}
      <button class="btn ancho" id="plan">${situacion?.texto ? '✏️ Actualizar y rehacer mi plan' : '🧠 Crear mi plan a medida'}</button>
    </div>

    <form id="perfil" class="card">
      <h3 style="margin-bottom:4px">👤 Sobre ti</h3>
      <p class="mini" style="margin-bottom:12px">Para recordarte quién eres y por qué empezaste. Tu asistente usa tu nombre para hablarte.</p>
      <label class="campo"><span>Nombre</span><input name="nombre" value="${esc(p.nombre)}" placeholder="¿Cómo te llamo?"></label>
      <label class="campo"><span>Quién eres</span><textarea name="sobreMi" placeholder="Edad, a qué te dedicas, qué estudias, tu situación…">${esc(p.sobreMi)}</textarea></label>
      <label class="campo"><span>Tu rutina</span><textarea name="rutina" placeholder="A qué hora te levantas, trabajas, entrenas, te acuestas…">${esc(p.rutina)}</textarea></label>
      <label class="campo"><span>Puntos fuertes</span><textarea name="fortalezas" placeholder="En qué eres bueno, qué te sale fácil">${esc(p.fortalezas)}</textarea></label>
      <label class="campo"><span>Puntos débiles</span><textarea name="debilidades" placeholder="Procrastinación, el móvil, la constancia…">${esc(p.debilidades)}</textarea></label>
      <label class="campo"><span>Qué te motiva</span><textarea name="motivacion" placeholder="Por qué quieres llegar a tu mejor versión">${esc(p.motivacion)}</textarea></label>
      <button class="btn ancho">Guardar perfil</button>
    </form>

    <form id="ajustes" class="card">
      <h3 style="margin-bottom:12px">⚙️ Ajustes</h3>
      <label class="campo"><span>Tema</span><select name="tema">${opciones([['auto', 'Automático'], ['claro', 'Claro'], ['oscuro', 'Oscuro']], s.tema)}</select></label>
      <label class="campo"><span>¿Qué bloques suenan como alarma?</span><select name="importantes">${opciones([['ninguno', 'Ninguno (solo recordatorios)'], ['alta', 'Los de objetivos de prioridad alta'], ['todos', 'Todos']], s.importantes)}</select></label>
      <label class="campo"><span>Nombre de tu Atajo</span><input name="nombreAtajo" value="${esc(s.nombreAtajo)}"></label>
      <button class="btn ancho">Guardar ajustes</button>
    </form>

    <div class="card">
      <h3 style="margin-bottom:10px">📖 Guías</h3>
      <div class="acciones" style="margin-top:0">
        <button class="btn sec chico" data-guia="atajo-recordatorios">⏰ Recordatorios y alarmas</button>
        <button class="btn sec chico" data-guia="acceso-rapido">📱 Acceso rápido</button>
        <button class="btn sec chico" id="bienvenida">👋 Repetir bienvenida</button>
      </div>
    </div>

    <div class="card">
      <h3 style="margin-bottom:6px">💾 Copia de seguridad</h3>
      <p class="mini">Tus datos están solo en este iPhone${persistente ? ' (almacenamiento protegido ✓)' : ''}. Haz una copia de vez en cuando y guárdala en Archivos o iCloud Drive.</p>
      <p class="mini">${ultimaCopia ? `Última copia: ${fmtFecha(ultimaCopia, { day: 'numeric', month: 'long' })}` : 'Todavía no has hecho ninguna copia.'}</p>
      <div class="acciones">
        <button class="btn sec chico" id="exportar">⬇️ Exportar copia</button>
        <label class="btn gris chico">⬆️ Importar copia<input type="file" id="importar" accept="application/json,.json" hidden></label>
      </div>
    </div>
    <p class="mini centro" style="margin:20px 0">Mi Mejor Versión · hecha para ti 💜</p>`;

  root.querySelector('#perfil').addEventListener('submit', async e => {
    e.preventDefault();
    await saveProfile(formData(e.target));
    toast('Perfil guardado. 💜');
    refrescar();
  });

  const fa = root.querySelector('#ajustes');
  fa.addEventListener('submit', async e => {
    e.preventDefault();
    const d = formData(fa);
    await saveSettings({ ...s, ...d });
    window.dispatchEvent(new Event('tema'));
    toast('Ajustes guardados');
  });

  root.querySelectorAll('[data-guia]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); abrirGuia(b.dataset.guia); }));
  root.querySelector('#exportar').addEventListener('click', async () => { if (await exportar()) refrescar(); });
  root.querySelector('#bienvenida').addEventListener('click', mostrarBienvenida);
  root.querySelector('#plan').addEventListener('click', () => abrirPlan());
  root.querySelector('#importar').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('Importar sustituirá TODOS los datos actuales por los de la copia. ¿Continuar?')) return;
    try {
      await importAll(JSON.parse(await file.text()));
      toast('✅ Copia restaurada');
      window.dispatchEvent(new Event('tema'));
      refrescar();
    } catch (err) { toast(`❌ ${err.message}`, 4000); }
  });
}

export async function abrirGuia(nombre) {
  const titulos = { 'atajo-recordatorios': 'Recordatorios y alarmas', 'acceso-rapido': 'Acceso rápido' };
  const { el } = sheet(titulos[nombre] || 'Guía', '<div class="cargando"><span class="spinner"></span></div>');
  try {
    const res = await fetch(`docs/${nombre}.md`);
    if (!res.ok) throw new Error();
    el.innerHTML = `<div class="prosa">${miniMarkdown(await res.text())}</div>`;
  } catch {
    el.innerHTML = '<div class="aviso">No se pudo cargar la guía. Comprueba tu conexión.</div>';
  }
}

// Devuelve true si la copia se ha guardado o compartido.
export async function exportar() {
  const datos = await exportAll();
  const nombre = `mi-mejor-version-${hoyISO()}.json`;
  const blob = new Blob([JSON.stringify(datos, null, 1)], { type: 'application/json' });
  const file = new File([blob], nombre, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Copia de Mi Mejor Versión' });
      await kvSet('ultimaCopia', hoyISO());
      toast('✅ Copia guardada. ¡Datos a salvo!');
      return true;
    } catch (e) { if (e.name === 'AbortError') return false; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  await kvSet('ultimaCopia', hoyISO());
  toast('Copia descargada');
  return true;
}

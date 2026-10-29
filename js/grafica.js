// Gráficas y calendario dibujados a mano (SVG/HTML), sin librerías, para que funcionen sin conexión.
import { esc, fmtFecha, weekday, DIAS_CORTO, daysInMonth, hoyISO, fmtHoras } from './util.js';

const nivel = p => (p >= 80 ? 'alta' : p >= 50 ? 'media' : 'baja');

/**
 * Barras con el % de cada día y, opcionalmente, una línea con la media.
 * serie = [{ fecha, pct, hechos, tareas, planificados }], linea = [números o null]
 */
export function barrasSVG(serie, { linea = null, compacto = false } = {}) {
  const W = 320, H = compacto ? 90 : 150;
  const izq = compacto ? 4 : 30, der = 4, arr = 8, abajo = 18;
  const ancho = W - izq - der, alto = H - arr - abajo;
  const paso = ancho / serie.length;
  const anchoBarra = Math.max(1.5, paso * (serie.length > 40 ? 0.7 : 0.62));
  const y = p => arr + alto - (p / 100) * alto;
  const x = i => izq + paso * i + paso / 2;
  const hoy = hoyISO();

  const rejilla = (compacto ? [0, 100] : [0, 50, 100]).map(p => `<line class="g-rejilla" x1="${izq}" x2="${W - der}" y1="${y(p)}" y2="${y(p)}"/>
    ${compacto ? '' : `<text class="g-eje" x="${izq - 5}" y="${y(p) + 3.5}" text-anchor="end">${p}%</text>`}`).join('');

  const barras = serie.map((d, i) => {
    const titulo = `<title>${esc(fmtFecha(d.fecha, { weekday: 'short', day: 'numeric', month: 'short' }))}: ${d.pct == null ? 'sin nada planificado' : `${d.pct} % (${d.hechos + d.tareas} de ${d.planificados})`}</title>`;
    if (d.pct == null) return `<g><circle class="g-vacio" cx="${x(i)}" cy="${y(0) - 2}" r="${Math.min(2, anchoBarra / 2)}"/>${titulo}</g>`;
    const h = Math.max(2, y(0) - y(d.pct));
    return `<rect class="g-barra ${nivel(d.pct)} ${d.fecha === hoy ? 'hoy' : ''}" x="${x(i) - anchoBarra / 2}" y="${y(0) - h}" width="${anchoBarra}" height="${h}" rx="${Math.min(3, anchoBarra / 2)}">${titulo}</rect>`;
  }).join('');

  // La línea se corta en los huecos sin datos.
  let trazo = '';
  if (linea) {
    let abierto = false;
    linea.forEach((v, i) => {
      if (v == null) { abierto = false; return; }
      trazo += `${abierto ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
      abierto = true;
    });
  }

  const cada = serie.length <= 7 ? 1 : serie.length <= 31 ? 5 : 15;
  const etiquetas = serie.map((d, i) => {
    if (serie.length > 7 && (serie.length - 1 - i) % cada) return '';
    const txt = serie.length <= 7 ? DIAS_CORTO[weekday(d.fecha)] : serie.length <= 31 ? Number(d.fecha.slice(8)) : `${Number(d.fecha.slice(8))}/${Number(d.fecha.slice(5, 7))}`;
    return `<text class="g-eje ${d.fecha === hoy ? 'hoy' : ''}" x="${x(i)}" y="${H - 4}" text-anchor="middle">${txt}</text>`;
  }).join('');

  return `<svg class="grafica" viewBox="0 0 ${W} ${H}" role="img" aria-label="Porcentaje cumplido cada día">
    ${rejilla}${barras}${trazo ? `<path class="g-linea" d="${trazo}"/>` : ''}${etiquetas}</svg>`;
}

export function leyendaHTML(conLinea = true) {
  return `<div class="leyenda">
    <span><i class="alta"></i>80 % o más</span><span><i class="media"></i>50–79 %</span><span><i class="baja"></i>Menos del 50 %</span>
    ${conLinea ? '<span><i class="linea"></i>Media de 7 días</span>' : ''}</div>`;
}

// Barras horizontales «hecho / objetivo» (reutiliza el estilo .cat-barra de Ahorro).
export function barrasObjetivos(items, colorDe) {
  return items.map(({ goal, hechoMin, objetivoMin }) => {
    const pct = objetivoMin ? Math.min(100, hechoMin / objetivoMin * 100) : 100;
    return `<div class="cat-barra"><div class="grow">
      <div class="fila sep"><b style="overflow-wrap:anywhere">${esc(goal.titulo)}</b>
        <span class="mini" style="flex:none">${fmtHoras(hechoMin)}${objetivoMin ? ` / ${fmtHoras(objetivoMin)}` : ''}</span></div>
      <div class="barra"><i style="width:${pct}%;background:${colorDe(goal.area)}"></i></div></div></div>`;
  }).join('');
}

/** Calendario de un mes. marcados = Set de fechas ISO; desde = primer día que cuenta. */
export function calendarioHTML(mk, marcados, { desde = '0000-01-01' } = {}) {
  const hoy = hoyISO();
  const primero = `${mk}-01`;
  const huecos = weekday(primero);
  const celdas = Array.from({ length: huecos }, () => '<span></span>');
  for (let d = 1; d <= daysInMonth(mk); d++) {
    const f = `${mk}-${String(d).padStart(2, '0')}`;
    const futuro = f > hoy;
    celdas.push(`<button type="button" class="cal-dia ${marcados.has(f) ? 'on' : ''} ${f === hoy ? 'hoy' : ''} ${f < desde ? 'antes' : ''}"
      data-dia="${f}" ${futuro ? 'disabled' : ''} aria-pressed="${marcados.has(f)}">${d}</button>`);
  }
  return `<div class="calendario">${DIAS_CORTO.map(l => `<b>${l}</b>`).join('')}${celdas.join('')}</div>`;
}

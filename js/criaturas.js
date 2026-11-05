// Huevos y criaturas en SVG, dibujados con código. Cinco especies inventadas (aves y reptiles voladores) que
// no se nombran: el usuario solo ve nombres misteriosos y, al final, el que él mismo les pone.
let contador = 0;
const nuevoId = () => `cr${++contador}`;
const f1 = n => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------------------------------
// Plumas: una hoja cónica que sale de (bx, by) hacia `ang` grados (eje y hacia arriba) y se curva `curl` grados.
function pluma(bx, by, ang, L, W, curl, { espejo = false, n = 14 } = {}) {
  const cl = [];
  let x = 0, y = 0;
  const paso = L / n;
  for (let i = 0; i <= n; i++) {
    const a = ((ang + curl * (i / n)) * Math.PI) / 180;
    cl.push([x, y, a]);
    x += Math.cos(a) * paso; y += Math.sin(a) * paso;
  }
  const forma = t => Math.pow(t, 0.4) * Math.pow(1 - t, 0.8);
  const mx = Math.max(...cl.map((_, i) => forma(i / n)));
  const izq = [], der = [];
  cl.forEach(([cx, cy, a], i) => {
    const w = (W * forma(i / n)) / mx, nx = -Math.sin(a), ny = Math.cos(a);
    izq.push([cx + nx * w, cy + ny * w]); der.push([cx - nx * w, cy - ny * w]);
  });
  const pts = [...izq, ...der.reverse()].map(([px, py]) => `${f1(espejo ? 200 - (bx + px) : bx + px)},${f1(by - py)}`);
  return `M${pts.join(' L')}Z`;
}

// ---------------------------------------------------------------------------------------------------
// HUEVOS (viewBox 0 0 100 130)
const HUEVO = 'M50 4 C78 4 94 44 94 78 C94 108 74 126 50 126 C26 126 6 108 6 78 C6 44 22 4 50 4Z';

const COLORES_HUEVO = {
  ascua: ['#ffb347', '#ff6a1a', '#d9291a'],
  rocio: ['#7be0d0', '#2aa6c9', '#1b6f9c'],
  niebla: ['#d6cdf0', '#9b8fc9', '#5b4f86'],
  eclipse: ['#4b3f94', '#241a55', '#0c0820'],
  aurora: ['#fff3f8', '#ffd1ea', '#b6f0f0'],
};

function decoracionHuevo(id, u) {
  switch (id) {
    case 'ascua': return `<g fill="#ffe27a" opacity=".85"><ellipse cx="34" cy="52" rx="4" ry="5"/><ellipse cx="62" cy="40" rx="3" ry="4"/><ellipse cx="70" cy="78" rx="5" ry="6"/><ellipse cx="38" cy="92" rx="4" ry="5"/><ellipse cx="56" cy="108" rx="3" ry="4"/><ellipse cx="24" cy="76" rx="2.5" ry="3"/></g>`;
    case 'rocio': return `<g fill="none" stroke="#e8fffb" stroke-width="2.4" stroke-linecap="round" opacity=".7"><path d="M14 62 q9 -8 18 0 t18 0 t18 0 t18 0"/><path d="M12 84 q9 -8 18 0 t18 0 t18 0 t20 0"/><path d="M18 106 q9 -8 18 0 t18 0 t16 0"/></g>`;
    case 'niebla': return `<g fill="none" stroke="#f1ecff" stroke-width="1.6" opacity=".55">${[[30, 50], [50, 40], [70, 50], [22, 72], [42, 66], [62, 66], [80, 72], [30, 90], [50, 86], [70, 90], [40, 108], [60, 108]].map(([x, y]) => `<path d="M${x - 9} ${y} q9 -12 18 0"/>`).join('')}</g>`;
    case 'eclipse': return `<circle cx="64" cy="48" r="17" fill="#f2c14e"/><circle cx="71" cy="44" r="16" fill="#241a55"/><g fill="#f6dc8a"><circle cx="30" cy="38" r="1.8"/><circle cx="22" cy="68" r="1.4"/><circle cx="38" cy="96" r="1.8"/><circle cx="74" cy="92" r="1.4"/><circle cx="56" cy="112" r="1.6"/><circle cx="46" cy="70" r="1.2"/></g>`;
    default: return `<g opacity=".7"><path d="M-10 40 L110 96 L110 112 L-10 56Z" fill="url(#${u}ba)"/><path d="M-10 70 L110 126 L110 140 L-10 84Z" fill="url(#${u}bb)"/></g><g fill="#fff"><path d="M30 34 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/><path d="M68 70 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6z"/></g>`;
  }
}

/** Grietas según la etapa (0 = sin grietas … 4 = a punto de abrirse). */
function grietas(etapa) {
  if (etapa < 1) return '';
  const trazos = [
    'M50 6 L46 20 L52 30 L47 42',
    'M30 28 L38 38 L33 50 M72 32 L64 44 L70 54',
    'M20 52 L33 60 L28 72 L44 78 L40 90 L56 84 L66 96 L80 80 L72 70 L88 62',
    'M10 70 L26 78 L22 92 L40 96 L38 110 L56 102 L70 114 L84 98 L78 88 L92 80',
  ];
  const dibujo = trazos.slice(0, etapa).join(' ');
  const luz = etapa >= 3 ? `<path d="${dibujo}" fill="none" stroke="#fff3a8" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity=".55" class="hv-luz-grieta"/>` : '';
  return `${luz}<path d="${dibujo}" fill="none" stroke="#2b1208" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>`;
}

/** El cuerpo del huevo (sin grietas) con su dibujo. */
function cuerpoHuevo(id, u) {
  const [c1, c2, c3] = COLORES_HUEVO[id];
  return `<defs>
    <radialGradient id="${u}g" cx=".38" cy=".3" r=".9"><stop offset="0" stop-color="${c1}"/><stop offset=".55" stop-color="${c2}"/><stop offset="1" stop-color="${c3}"/></radialGradient>
    <linearGradient id="${u}ba" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff9fd0"/><stop offset=".5" stop-color="#9be7ff"/><stop offset="1" stop-color="#ffe08a"/></linearGradient>
    <linearGradient id="${u}bb" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffe08a"/><stop offset=".5" stop-color="#ff9fd0"/><stop offset="1" stop-color="#9be7ff"/></linearGradient>
    <clipPath id="${u}c"><path d="${HUEVO}"/></clipPath></defs>
    <path d="${HUEVO}" fill="url(#${u}g)"/>
    <g clip-path="url(#${u}c)">${decoracionHuevo(id, u)}</g>
    <path d="${HUEVO}" fill="none" stroke="#000" stroke-opacity=".18" stroke-width="2"/>
    <ellipse cx="34" cy="34" rx="9" ry="16" fill="#fff" opacity=".38" transform="rotate(24 34 34)"/>`;
}

/** Un huevo entero: `etapa` es cuánto se ha calentado (0-4). */
export function huevoSVG(id, etapa = 0) {
  const u = nuevoId();
  return `<svg class="huevo-svg etapa-${etapa}" viewBox="0 0 100 130" role="img" aria-label="Huevo">
    <defs><radialGradient id="${u}h"><stop offset="0" stop-color="#ffd23f" stop-opacity=".85"/><stop offset=".6" stop-color="#ffb21a" stop-opacity=".35"/><stop offset="1" stop-color="#ff8a1f" stop-opacity="0"/></radialGradient></defs>
    ${etapa >= 2 ? `<ellipse cx="50" cy="68" rx="${62 + etapa * 6}" ry="${78 + etapa * 6}" fill="url(#${u}h)" opacity="${0.25 + etapa * 0.14}" class="hv-brillo"/>` : ''}
    <g class="hv-cuerpo">${cuerpoHuevo(id, u)}${grietas(etapa)}</g></svg>`;
}

/** Un huevo sin elegir: solo el contorno con una interrogación. */
export function huevoMisterioSVG() {
  return `<svg class="huevo-svg misterio" viewBox="0 0 100 130" role="img" aria-label="Huevo por elegir">
    <g class="hv-cuerpo"><path d="${HUEVO}" fill="rgba(255,138,31,.10)" stroke="#e8431a" stroke-width="3" stroke-dasharray="7 6" stroke-linecap="round"/>
    <text x="50" y="86" text-anchor="middle" font-size="46" font-weight="800" fill="#e8431a" font-family="system-ui,sans-serif">?</text></g></svg>`;
}

/** Las dos mitades del huevo, separadas por una línea en zigzag, para la animación de eclosión. */
export function huevoMitadesSVG(id) {
  const u = nuevoId();
  const zig = '0,72 12,60 24,76 36,60 50,78 62,60 76,76 88,60 100,72';
  return `<svg class="huevo-svg mitades" viewBox="-30 -20 160 180" role="img" aria-label="Huevo abriéndose">
    <defs><clipPath id="${u}sup"><polygon points="-30,-20 130,-20 130,72 ${zig.split(' ').reverse().join(' ')} -30,72"/></clipPath>
    <clipPath id="${u}inf"><polygon points="-30,200 130,200 130,72 ${zig.split(' ').reverse().join(' ')} -30,72"/></clipPath></defs>
    <g class="mitad-inf"><g clip-path="url(#${u}inf)">${cuerpoHuevo(id, u + 'b')}</g></g>
    <g class="mitad-sup"><g clip-path="url(#${u}sup)">${cuerpoHuevo(id, u + 'a')}</g></g></svg>`;
}

// ---------------------------------------------------------------------------------------------------
// CRIATURAS (viewBox 0 0 200 200). `especie` coincide con el id del huevo del que salen.
const ESPECIES = {
  ascua: { cuerpo: ['#ffa42b', '#e8281e'], vientre: '#ffe9a0', ala: ['#ff5a1a', '#ffc400'], acento: '#ffd23f', pico: '#ffb21a', alas: 'plumas', cabeza: 'pico', cola: 'abanico', cresta: 'plumas', brillo: '#ffd23f' },
  rocio: { cuerpo: ['#4fd4c4', '#1d7fa8'], vientre: '#e2fff8', ala: ['#1f9ec4', '#8ff0dc'], acento: '#bff6ff', pico: '#ffd37a', alas: 'plumas', cabeza: 'pico', cola: 'cintas', cresta: 'plumas', brillo: '#9be7ff' },
  niebla: { cuerpo: ['#a79ed0', '#5b4f86'], vientre: '#ece6ff', ala: ['#6f60a3', '#c9bdf3'], acento: '#ffd479', pico: '#ffd479', alas: 'membrana', cabeza: 'hocico', cola: 'puas', cresta: 'cuernos', brillo: '#d9ceff' },
  eclipse: { cuerpo: ['#5648b8', '#1d1547'], vientre: '#6a5bb0', ala: ['#2e2470', '#f2c14e'], acento: '#f2c14e', pico: '#f2c14e', alas: 'plumas4', cabeza: 'pico', cola: 'abanico', cresta: 'luz', brillo: '#f2c14e' },
  aurora: { cuerpo: ['#ffa7d6', '#7ee3ea'], vientre: '#fff6fb', ala: ['#ff9fd0', '#9be7ff'], acento: '#ffe08a', pico: '#ffd37a', alas: 'plumas', cabeza: 'pico', cola: 'cintas3', cresta: 'plumas', brillo: '#ffe08a' },
};

// Tamaños según la etapa: 1 = cría, 2 = joven, 3 = adulta.
const ETAPAS = {
  1: { cuerpo: [34, 30, 100, 134], cabeza: [32, 100, 102], ala: 0.4, cola: 0.35, cresta: 0.35, plumasAla: 2 },
  2: { cuerpo: [32, 34, 100, 128], cabeza: [28, 100, 90], ala: 0.72, cola: 0.7, cresta: 0.7, plumasAla: 3 },
  3: { cuerpo: [30, 38, 100, 124], cabeza: [26, 100, 80], ala: 1, cola: 1, cresta: 1, plumasAla: 5 },
};

function alasPlumas(sp, et, u, cuatro) {
  const [, , cx, cy] = et.cuerpo;
  const ws = et.ala, hombro = [cx + 20, cy - 12];
  const juegos = {
    5: [[70, 58, 9, 16], [48, 72, 10, 14], [26, 78, 10, 10], [4, 70, 9, 6], [-18, 54, 8, 2]],
    3: [[55, 46, 8, 14], [30, 52, 9, 10], [5, 44, 8, 6]],
    2: [[38, 30, 7, 12], [8, 26, 7, 4]],
  }[et.plumasAla];
  const hoja = (lista, dx = 0, dy = 0, esc = 1, gr = `${u}al`) => lista.map(([a, L, W, c]) => `<path d="${pluma(hombro[0] + dx, hombro[1] + dy, a, L * ws * esc, W * Math.max(0.6, ws) * esc, c)}" fill="url(#${gr})" stroke="#000" stroke-opacity=".18" stroke-width="1.2"/>`).join('');
  const principal = hoja(juegos);
  const segunda = cuatro ? hoja(juegos.slice(0, 4).map(([a, L, W, c]) => [a - 28, L, W, c]), 2, 22, 0.78, `${u}al2`) : '';
  return `<g class="cr-ala-d" style="transform-origin:${hombro[0]}px ${hombro[1]}px">${segunda}${principal}</g>`;
}

function alasMembrana(sp, et, u) {
  const [, , cx, cy] = et.cuerpo;
  const ws = et.ala, h = [cx + 20, cy - 12];
  const p = (dx, dy) => `${f1(h[0] + dx * ws)},${f1(h[1] + dy * ws)}`;
  const puntas = et.plumasAla >= 5 ? [[62, -66], [88, -26], [78, 18]] : et.plumasAla >= 3 ? [[48, -46], [68, -12], [58, 20]] : [[30, -28], [40, -2]];
  const lista = puntas.map(([dx, dy]) => p(dx, dy));
  let membrana = `M${p(0, 0)} L${lista[0]}`;
  for (let i = 1; i < lista.length; i++) {
    const [ax, ay] = puntas[i - 1], [bx, by] = puntas[i];
    membrana += ` Q${p((ax + bx) / 2 - 8, (ay + by) / 2 + 12)} ${lista[i]}`;
  }
  membrana += ` Q${p(24, 30)} ${p(4, 22)}Z`;
  const huesos = lista.map(pt => `<path d="M${p(0, 0)} L${pt}" stroke="#2d2350" stroke-opacity=".55" stroke-width="2.4" stroke-linecap="round"/>`).join('');
  return `<g class="cr-ala-d" style="transform-origin:${h[0]}px ${h[1]}px"><path d="${membrana}" fill="url(#${u}al)" stroke="#000" stroke-opacity=".2" stroke-width="1.4" stroke-linejoin="round"/>${huesos}</g>`;
}

function cola(sp, et, u) {
  const [, ry, cx, cy] = et.cuerpo, k = et.cola, base = [cx, cy + ry - 8];
  if (sp.cola === 'abanico') {
    const lista = et.plumasAla >= 5 ? [[-90 - 36, 38, 9, -24], [-90 + 36, 38, 9, 24], [-90 - 18, 48, 10, -14], [-90 + 18, 48, 10, 14], [-90, 52, 11, 0]] : et.plumasAla >= 3 ? [[-90 - 22, 32, 8, -14], [-90 + 22, 32, 8, 14], [-90, 38, 9, 0]] : [[-90 - 14, 18, 6, -8], [-90 + 14, 18, 6, 8]];
    return `<g class="cr-cola">${lista.map(([a, L, W, c]) => `<path d="${pluma(base[0], base[1], a, L * Math.max(k, 0.5), W * Math.max(k, 0.6), c)}" fill="url(#${u}co)" stroke="#000" stroke-opacity=".16" stroke-width="1.1"/>`).join('')}</g>`;
  }
  if (sp.cola === 'puas') {
    const largo = 26 + 34 * k;
    return `<g class="cr-cola"><path d="M${base[0] + 6} ${base[1]} C${base[0] + largo} ${base[1] + 10} ${base[0] + largo + 12} ${base[1] - 4} ${base[0] + largo + 4} ${base[1] - 24}" fill="none" stroke="url(#${u}cu)" stroke-width="${8 + 3 * k}" stroke-linecap="round"/>
      <path d="M${base[0] + largo - 6} ${base[1] - 28} L${base[0] + largo + 4} ${base[1] - 50 - 8 * k} L${base[0] + largo + 16} ${base[1] - 26} Q${base[0] + largo + 4} ${base[1] - 18} ${base[0] + largo - 6} ${base[1] - 28}Z" fill="${sp.acento}" stroke="#000" stroke-opacity=".2" stroke-width="1.2"/></g>`;
  }
  // Plumas largas y estrechas que salen de atrás y se curvan hacia los lados (no cuelgan como patas).
  if (et.plumasAla < 3) return '';
  const largas = sp.cola === 'cintas3'
    ? [[-90 - 38, 54, 6, -44, `url(#${u}co)`], [-90 + 38, 54, 6, 44, `url(#${u}co)`], [-90, 46, 5, 0, '#ffe08a']]
    : [[-90 - 34, 52, 6, -40, `url(#${u}co)`], [-90 + 34, 52, 6, 40, `url(#${u}co)`]];
  return `<g class="cr-cola">${largas.map(([a, L, W, c, col]) => `<path d="${pluma(base[0], base[1] - 6, a, L * Math.max(k, 0.7), W, c)}" fill="${col}" stroke="#000" stroke-opacity=".16" stroke-width="1.1"/>`).join('')}</g>`;
}

function cresta(sp, et, u) {
  const [r, hx, hy] = et.cabeza, k = et.cresta, top = hy - r + 4;
  if (sp.cresta === 'plumas') {
    const lista = [[118, 26, 4.5, 24], [90, 32, 5, 4], [62, 26, 4.5, -24]];
    return `<g class="cr-cresta">${lista.map(([a, L, W, c]) => `<path d="${pluma(hx, top, a, L * k, W * Math.max(k, 0.6), c)}" fill="${sp.acento}" stroke="#000" stroke-opacity=".18" stroke-width="1"/>`).join('')}</g>`;
  }
  if (sp.cresta === 'cuernos') {
    const L = 16 + 14 * k;
    return `<g class="cr-cresta">${[-1, 1].map(s => `<path d="M${hx + s * 12} ${top + 6} C${hx + s * 14} ${top - L * 0.6} ${hx + s * 22} ${top - L} ${hx + s * 30} ${top - L - 4} C${hx + s * 28} ${top - L * 0.4} ${hx + s * 26} ${top + 2} ${hx + s * 18} ${top + 10}Z" fill="${sp.acento}" stroke="#000" stroke-opacity=".22" stroke-width="1.2"/>`).join('')}</g>`;
  }
  const arco = 14 + 14 * k;
  return `<g class="cr-cresta"><path d="M${hx - arco} ${top + 2} Q${hx} ${top - 22 * k - 6} ${hx + arco} ${top + 2}" fill="none" stroke="${sp.acento}" stroke-width="${3 + k}" stroke-linecap="round"/>${k > 0.6 ? `<circle cx="${hx}" cy="${top - 14 * k - 5}" r="${2.4 + k}" fill="${sp.acento}"/>` : ''}</g>`;
}

function cara(sp, et, humor) {
  const [r, hx, hy] = et.cabeza;
  const ojoR = 6.2 + (4 - et.plumasAla * 0.4);
  const ojos = humor === 'dormido'
    ? `<g fill="none" stroke="#2a1608" stroke-width="2.6" stroke-linecap="round"><path d="M${hx - 17} ${hy + 1} q6 5 12 0"/><path d="M${hx + 5} ${hy + 1} q6 5 12 0"/></g><text x="${hx + r * 0.7}" y="${hy - r * 0.8}" font-size="14" font-weight="800" fill="#7d6252" opacity=".8" class="cr-zz">z</text>`
    : `<g class="cr-ojos">${[-1, 1].map(s => `<circle cx="${hx + s * 12}" cy="${hy + 1}" r="${ojoR}" fill="#fff"/><circle cx="${hx + s * 12 + (s > 0 ? -0.6 : 0.6)}" cy="${hy + 2}" r="${ojoR * 0.62}" fill="#241008"/><circle cx="${hx + s * 12 - 1.6}" cy="${hy - 1}" r="${ojoR * 0.24}" fill="#fff"/>`).join('')}</g>`;
  const mejillas = `<ellipse cx="${hx - 21}" cy="${hy + 10}" rx="${humor === 'feliz' ? 6 : 4.5}" ry="3.4" fill="#ff7aa8" opacity="${humor === 'feliz' ? 0.55 : 0.3}"/><ellipse cx="${hx + 21}" cy="${hy + 10}" rx="${humor === 'feliz' ? 6 : 4.5}" ry="3.4" fill="#ff7aa8" opacity="${humor === 'feliz' ? 0.55 : 0.3}"/>`;
  let boca;
  if (sp.cabeza === 'pico') {
    const L = 7 + et.plumasAla * 1.3;
    boca = `<path d="M${hx - 7} ${hy + 8} Q${hx} ${hy + 8 + L} ${hx + 7} ${hy + 8} Q${hx} ${hy + 5} ${hx - 7} ${hy + 8}Z" fill="${sp.pico}" stroke="#000" stroke-opacity=".25" stroke-width="1.2" stroke-linejoin="round"/>`;
  } else {
    boca = `<ellipse cx="${hx}" cy="${hy + 12}" rx="13" ry="9" fill="${sp.vientre}" opacity=".95"/><circle cx="${hx - 4}" cy="${hy + 10}" r="1.4" fill="#4b3f6c"/><circle cx="${hx + 4}" cy="${hy + 10}" r="1.4" fill="#4b3f6c"/><path d="M${hx - 6} ${hy + 15} Q${hx} ${hy + (humor === 'feliz' ? 20 : 17)} ${hx + 6} ${hy + 15}" fill="none" stroke="#4b3f6c" stroke-width="1.8" stroke-linecap="round"/>`;
  }
  return ojos + mejillas + boca;
}

/**
 * Una criatura. especie: id del huevo; etapa: 1-3; humor: 'feliz' | 'normal' | 'dormido'.
 */
export function criaturaSVG(especie, etapa = 1, humor = 'normal') {
  const sp = ESPECIES[especie] || ESPECIES.ascua, et = ETAPAS[etapa] || ETAPAS[1], u = nuevoId();
  const [rx, ry, cx, cy] = et.cuerpo, [hr, hx, hy] = et.cabeza;
  const alas = sp.alas === 'membrana' ? alasMembrana(sp, et, u) : alasPlumas(sp, et, u, sp.alas === 'plumas4');
  const patas = `<g fill="${sp.pico}" stroke="#000" stroke-opacity=".22" stroke-width="1.1"><ellipse cx="${cx - 12}" cy="${cy + ry - 1}" rx="8" ry="4.4"/><ellipse cx="${cx + 12}" cy="${cy + ry - 1}" rx="8" ry="4.4"/></g>`;
  return `<svg class="cr-svg etapa-${etapa} humor-${humor}" viewBox="0 0 200 200" role="img" aria-label="Tu compañero">
    <defs>
      <linearGradient id="${u}cu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sp.cuerpo[0]}"/><stop offset="1" stop-color="${sp.cuerpo[1]}"/></linearGradient>
      <linearGradient id="${u}al" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${sp.ala[0]}"/><stop offset="1" stop-color="${sp.ala[1]}"/></linearGradient>
      <linearGradient id="${u}al2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${sp.ala[0]}" stop-opacity=".85"/><stop offset="1" stop-color="${sp.ala[1]}" stop-opacity=".85"/></linearGradient>
      <linearGradient id="${u}co" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sp.ala[0]}"/><stop offset="1" stop-color="${sp.ala[1]}"/></linearGradient>
      <radialGradient id="${u}au"><stop offset="0" stop-color="${sp.brillo}" stop-opacity=".55"/><stop offset="1" stop-color="${sp.brillo}" stop-opacity="0"/></radialGradient>
    </defs>
    ${etapa >= 3 ? `<circle cx="100" cy="112" r="92" fill="url(#${u}au)" class="cr-aura"/>` : ''}
    <ellipse cx="100" cy="${cy + ry + 3}" rx="${rx + 8}" ry="5" fill="#000" opacity=".14"/>
    <g class="cr-todo" transform="translate(100 172) scale(${etapa === 1 ? 1.45 : etapa === 2 ? 1.2 : 0.94}) translate(-100 -172)">
    <g class="cr-cuerpo">
      ${cola(sp, et, u)}
      <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${u}cu)" stroke="#000" stroke-opacity=".18" stroke-width="1.6"/>
      <ellipse cx="${cx}" cy="${cy + ry * 0.2}" rx="${rx * 0.62}" ry="${ry * 0.68}" fill="${sp.vientre}" opacity=".92"/>
      ${patas}
      <g class="cr-ala-i" style="transform-origin:${200 - (cx + 20)}px ${cy - 12}px"><g transform="translate(200 0) scale(-1 1)">${alas.replace('class="cr-ala-d"', '').replace(/style="[^"]*"/, '')}</g></g>
      ${alas}
      <circle cx="${hx}" cy="${hy}" r="${hr}" fill="url(#${u}cu)" stroke="#000" stroke-opacity=".18" stroke-width="1.6"/>
      <ellipse cx="${hx - hr * 0.35}" cy="${hy - hr * 0.45}" rx="${hr * 0.3}" ry="${hr * 0.16}" fill="#fff" opacity=".35" transform="rotate(-25 ${hx - hr * 0.35} ${hy - hr * 0.45})"/>
      <ellipse cx="${hx}" cy="${hy + 5}" rx="${hr * 0.82}" ry="${hr * 0.68}" fill="${sp.vientre}" opacity="${especie === 'eclipse' ? 0.38 : 0.22}"/>
      ${cresta(sp, et, u)}
      ${cara(sp, et, humor)}
    </g>
    </g>
    ${especie === 'aurora' && etapa >= 2 ? '<g fill="#fff" class="cr-brillos"><path d="M26 56 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z"/><path d="M168 74 l1.6 5 5 1.6 -5 1.6 -1.6 5 -1.6 -5 -5 -1.6 5 -1.6z"/></g>' : ''}
  </svg>`;
}

export const ESPECIES_IDS = Object.keys(ESPECIES);

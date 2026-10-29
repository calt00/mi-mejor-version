// Cerdito hucha en SVG que crece y evoluciona según el porcentaje ahorrado.
import { toast } from './util.js';

export const ETAPAS = ['Lechón', 'Cerdito ahorrador', 'Cerdito rollizo', 'Gran cerdo', 'Cerdo dorado', 'Rey cerdo'];

export function etapa(pct) {
  if (pct >= 1) return 5;
  if (pct >= 0.8) return 4;
  if (pct >= 0.6) return 3;
  if (pct >= 0.4) return 2;
  if (pct >= 0.2) return 1;
  return 0;
}

export const escala = pct => 0.6 + 0.8 * Math.min(Math.max(pct, 0), 1);

let n = 0;
function svg(pct) {
  const e = etapa(pct);
  const id = `c${++n}`;
  const oro = e >= 4;
  const cuerpo = oro ? `url(#${id}g)` : '#ffb6c8';
  const oscuro = oro ? '#e0a52a' : '#f28fae';
  const hocico = oro ? '#ffe08a' : '#ff9dbb';
  const fosas = oro ? '#b07d16' : '#c4587a';

  const monedaRanura = e >= 1 ? `<circle cx="110" cy="40" r="9" fill="#ffcc33" stroke="#e0a52a" stroke-width="2"/><text x="110" y="44" font-size="10" text-anchor="middle" fill="#b07d16" font-weight="700">€</text>` : '';
  const mejillas = e >= 2 ? `<ellipse cx="160" cy="112" rx="11" ry="6" fill="#ff6f96" opacity=".45"/>` : '';
  const brillo = e >= 3 ? `<ellipse cx="78" cy="72" rx="24" ry="9" fill="#fff" opacity=".45" transform="rotate(-25 78 72)"/>` : '';
  const monton = e >= 3 ? `<g class="monton">
      <ellipse cx="22" cy="160" rx="13" ry="5" fill="#e0a52a"/><ellipse cx="22" cy="155" rx="13" ry="5" fill="#ffcc33" stroke="#e0a52a"/>
      <ellipse cx="22" cy="150" rx="13" ry="5" fill="#ffcc33" stroke="#e0a52a"/><ellipse cx="200" cy="162" rx="11" ry="4" fill="#ffcc33" stroke="#e0a52a"/></g>` : '';
  const destellos = e >= 4 ? `<g class="destellos" fill="#fff">
      <path d="M60 40 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z"/><path d="M196 60 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/>
      <path d="M40 120 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/></g>` : '';
  const corona = e >= 5 ? `<g class="corona">
      <path d="M128 30 L132 4 L144 20 L152 0 L160 20 L172 4 L176 30 Z" fill="#ffcc33" stroke="#c98f12" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="152" cy="20" r="3.5" fill="#ff375f"/><circle cx="138" cy="24" r="2.5" fill="#30b0c7"/><circle cx="166" cy="24" r="2.5" fill="#34c759"/></g>` : '';
  const confeti = e >= 5 ? `<g class="confeti">
      <rect x="20" y="20" width="6" height="10" fill="#ff375f" transform="rotate(20 20 20)"/><rect x="196" y="24" width="6" height="10" fill="#5856d6" transform="rotate(-30 196 24)"/>
      <rect x="70" y="8" width="5" height="9" fill="#34c759" transform="rotate(45 70 8)"/><rect x="190" y="120" width="5" height="9" fill="#ff9f0a" transform="rotate(10 190 120)"/>
      <circle cx="44" cy="70" r="3" fill="#30b0c7"/><circle cx="104" cy="14" r="3" fill="#ff9f0a"/></g>` : '';

  return `<svg viewBox="0 0 220 180" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${ETAPAS[e]}: ${Math.round(Math.min(pct, 1) * 100)} % ahorrado">
    <defs><linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#f2b02e"/></linearGradient></defs>
    ${confeti}
    <ellipse cx="110" cy="168" rx="72" ry="7" fill="#000" opacity=".1"/>
    ${monton}
    <rect x="62" y="128" width="18" height="34" rx="8" fill="${oscuro}"/>
    <rect x="140" y="128" width="18" height="34" rx="8" fill="${oscuro}"/>
    <path d="M36 98 c-16 -2 -20 -18 -8 -21 c10 -2 10 12 -2 12" fill="none" stroke="${oscuro}" stroke-width="5" stroke-linecap="round"/>
    <path d="M140 58 L152 26 L170 62 Z" fill="${oscuro}" stroke-linejoin="round"/>
    <ellipse cx="110" cy="100" rx="78" ry="55" fill="${cuerpo}"/>
    <rect x="80" y="130" width="18" height="34" rx="8" fill="${cuerpo}"/>
    <rect x="122" y="130" width="18" height="34" rx="8" fill="${cuerpo}"/>
    <path d="M122 54 L130 22 L148 54 Z" fill="${cuerpo}" stroke-linejoin="round"/>
    <path d="M128 50 L131 34 L141 50 Z" fill="${oscuro}" opacity=".6"/>
    ${brillo}
    ${monedaRanura}
    <rect x="90" y="46" width="40" height="7" rx="3.5" fill="#6b3a4a" opacity=".75"/>
    <ellipse cx="186" cy="104" rx="16" ry="20" fill="${hocico}"/>
    <ellipse cx="181" cy="98" rx="3" ry="5" fill="${fosas}"/><ellipse cx="191" cy="98" rx="3" ry="5" fill="${fosas}"/>
    <circle cx="158" cy="84" r="6" fill="#2b2b2b"/><circle cx="160" cy="82" r="2" fill="#fff"/>
    ${mejillas}
    ${destellos}
    ${corona}
  </svg>`;
}

export function cerditoHTML(pct, { clase = '' } = {}) {
  const e = etapa(pct);
  return `<div class="cerdito etapa-${e} ${clase}" data-pct="${pct}" style="--s:${escala(pct).toFixed(3)}">
    <div class="cerdito-in">${svg(pct)}</div></div>`;
}

// Anima la caída de una moneda, el crecimiento y, si cambia de etapa, la celebración.
export function animarAportacion(cont, pctAntes, pctDespues) {
  const viejo = cont.querySelector('.cerdito');
  if (!viejo) return;
  const clase = [...viejo.classList].filter(c => !c.startsWith('etapa-') && c !== 'cerdito' && c !== 'rebote').join(' ');
  const sube = pctDespues > pctAntes;
  if (sube) {
    const moneda = document.createElement('div');
    moneda.className = 'moneda-cae';
    moneda.textContent = '€';
    viejo.appendChild(moneda);
  }
  setTimeout(() => {
    viejo.outerHTML = cerditoHTML(pctDespues, { clase: `${clase} ${sube ? 'rebote' : ''}` });
    const eA = etapa(pctAntes), eD = etapa(pctDespues);
    if (eD > eA) celebrar(cont, eD);
  }, sube ? 650 : 0);
}

function celebrar(cont, e) {
  const capa = document.createElement('div');
  capa.className = 'celebracion';
  const colores = ['#ff375f', '#ff9f0a', '#ffcc33', '#34c759', '#30b0c7', '#5856d6', '#af52de'];
  capa.innerHTML = Array.from({ length: 36 }, (_, i) =>
    `<i style="left:${Math.random() * 100}%;background:${colores[i % colores.length]};animation-delay:${Math.random() * 0.4}s;--r:${Math.random() * 720 - 360}deg"></i>`).join('');
  document.body.appendChild(capa);
  setTimeout(() => capa.remove(), 2600);
  toast(e === 5 ? '👑 ¡META CONSEGUIDA! Tu cerdito es el rey.' : `✨ ¡Tu cerdito ha evolucionado a «${ETAPAS[e]}»!`, 3500);
  navigator.vibrate?.(80);
}

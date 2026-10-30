// Cálculos de presupuesto, estado de metas y recomendaciones de ahorro (sin IA).
import { monthKey, daysInMonth, prevMonthKey, addDays, diasEntre, fmtEur, sum } from './util.js';
import { CATEGORIAS, catNombre, catIcono } from './datos.js';

const MES = 30.44;
const enMes = (arr, mk) => arr.filter(x => monthKey(x.fecha) === mk);
const esSuscripcion = f => f.suscripcion || f.categoria === 'suscripciones';

export function ingresosMes(ingresos) { return (Number(ingresos.nomina) || 0) + (Number(ingresos.extras) || 0); }

export function resumenMes(d, mk = monthKey(d.hoy)) {
  const ingresos = ingresosMes(d.ingresos);
  const fijos = sum(d.fixed, f => f.importe);
  const gastos = enMes(d.expenses, mk);
  const variables = sum(gastos, g => g.importe);
  const aportado = sum(enMes(d.contributions, mk), c => c.importe);
  const disponible = ingresos - fijos - variables - aportado;
  const dim = daysInMonth(mk);
  const actual = mk === monthKey(d.hoy);
  const dia = actual ? Number(d.hoy.slice(8, 10)) : dim;
  const diasRestantes = actual ? dim - dia + 1 : 0;
  const porCategoria = {};
  for (const g of gastos) porCategoria[g.categoria] = (porCategoria[g.categoria] || 0) + g.importe;
  return { mk, ingresos, fijos, variables, aportado, disponible, dia, dim, diasRestantes, porDia: diasRestantes ? disponible / diasRestantes : 0, porCategoria };
}

export function regla503020(d, r = resumenMes(d)) {
  let necesidades = 0, deseos = 0;
  for (const f of d.fixed) (CATEGORIAS[f.categoria]?.tipo === 'necesidad' ? (necesidades += f.importe) : (deseos += f.importe));
  for (const [c, v] of Object.entries(r.porCategoria)) (CATEGORIAS[c]?.tipo === 'necesidad' ? (necesidades += v) : (deseos += v));
  const base = r.ingresos || 1;
  return {
    necesidades, deseos, ahorro: Math.max(0, r.aportado),
    pct: { necesidades: necesidades / base * 100, deseos: deseos / base * 100, ahorro: Math.max(0, r.aportado) / base * 100 },
    objetivo: { necesidades: r.ingresos * 0.5, deseos: r.ingresos * 0.3, ahorro: r.ingresos * 0.2 },
  };
}

export function estadoMeta(meta, contributions, hoy) {
  const propias = contributions.filter(c => c.goalId === meta.id);
  const ahorrado = Math.max(0, sum(propias, c => c.importe));
  const pct = meta.meta > 0 ? ahorrado / meta.meta : 0;
  const falta = Math.max(0, meta.meta - ahorrado);
  // Ritmo: media mensual de los últimos 90 días (o desde que se creó la meta).
  const desde = addDays(hoy, -90);
  const inicio = meta.creado && meta.creado > desde ? meta.creado : desde;
  const dias = Math.max(30, diasEntre(inicio, hoy) + 1);
  const ritmoMes = sum(propias.filter(c => c.fecha >= inicio), c => c.importe) / (dias / MES);
  const mesesRestantes = meta.fechaLimite ? Math.max(0.5, diasEntre(hoy, meta.fechaLimite) / MES) : null;
  const necesarioMes = mesesRestantes ? falta / mesesRestantes : null;
  const etaMeses = ritmoMes > 0 ? falta / ritmoMes : Infinity;
  let estado = 'sin-fecha';
  if (pct >= 1) estado = 'completada';
  else if (necesarioMes != null) estado = ritmoMes >= necesarioMes * 1.2 ? 'adelantado' : ritmoMes >= necesarioMes * 0.95 ? 'al-dia' : 'atrasado';
  return { ahorrado, pct, falta, ritmoMes, mesesRestantes, necesarioMes, etaMeses, estado };
}

// Meses (de los 3 anteriores) en los que hay algún gasto registrado.
function mesesConHistorial(d, mk) {
  return [1, 2, 3].map(n => prevMonthKey(mk, n)).filter(m => d.expenses.some(e => monthKey(e.fecha) === m));
}

export function evaluarReto(reto, expenses, hoy) {
  if (!reto) return null;
  const fin = addDays(reto.inicio, 7);
  const gastado = sum(expenses.filter(e => e.categoria === reto.categoria && e.fecha >= reto.inicio && e.fecha < fin), e => e.importe);
  const terminado = hoy >= fin;
  return { ...reto, fin, gastado, terminado, cumplido: terminado && gastado === 0, roto: gastado > 0, diasRestantes: Math.max(0, diasEntre(hoy, fin)) };
}

function repartoPorPrioridad(importe, metas) {
  const total = sum(metas, m => m.prioridad || 1);
  let restante = importe;
  const out = metas.map(m => {
    const parte = Math.min(m.falta, Math.floor(importe * (m.prioridad || 1) / total));
    restante -= parte;
    return { goalId: m.id, nombre: m.nombre, importe: parte };
  });
  if (restante > 0 && out.length) out[0].importe += Math.min(restante, metas[0].falta - out[0].importe);
  return out.filter(x => x.importe > 0);
}

/**
 * d = { hoy, ingresos, fixed, expenses, savingsGoals, contributions, reto, sobrantesRepartidos, inicioApp }
 * Devuelve recomendaciones ordenadas por relevancia.
 */
export function recomendaciones(d) {
  const recs = [];
  const add = (prio, icono, titulo, texto, accion) => recs.push({ prio, icono, titulo, texto, accion });
  const mk = monthKey(d.hoy);
  const r = resumenMes(d, mk);

  if (!r.ingresos) {
    add(100, '💶', 'Configura tu nómina', 'Añade tu nómina y tus gastos fijos para ver cuánto puedes ahorrar y recibir recomendaciones.', { tipo: 'config-nomina' });
    return recs;
  }

  const metas = d.savingsGoals.map(m => ({ ...m, ...estadoMeta(m, d.contributions, d.hoy) }));
  const activas = metas.filter(m => m.estado !== 'completada').sort((a, b) => (b.prioridad || 1) - (a.prioridad || 1));
  const principal = activas[0];

  // Cuánto adelanta una meta ahorrar `extra` €/mes más.
  const adelanto = extra => {
    if (!principal || extra <= 0) return '';
    const ahora = principal.etaMeses;
    const nueva = principal.falta / (principal.ritmoMes + extra);
    if (!isFinite(ahora)) return ` Con ese dinero llegarías a tu meta «${principal.nombre}» en ${Math.ceil(nueva)} meses.`;
    const gana = ahora - nueva;
    return gana >= 0.5 ? ` Eso adelanta tu meta «${principal.nombre}» unos ${Math.round(gana)} ${Math.round(gana) === 1 ? 'mes' : 'meses'}.` : '';
  };

  // 1. Ritmo de gasto del mes.
  const objetivoAhorro = activas.some(m => m.necesarioMes) ? sum(activas, m => m.necesarioMes || 0) : r.ingresos * 0.2;
  const presupuestoVar = r.ingresos - r.fijos - objetivoAhorro;
  const frac = r.dia / r.dim;
  if (presupuestoVar > 0 && r.dia >= 5 && r.variables > presupuestoVar * frac * 1.1) {
    const proyeccion = r.variables / frac;
    add(90, '⚠️', 'Vas por encima del ritmo de gasto',
      `Llevas ${fmtEur(r.variables)} en gastos variables y tu presupuesto del mes es ${fmtEur(presupuestoVar)}. A este ritmo terminarás en unos ${fmtEur(proyeccion, true)}. Intenta no pasar de ${fmtEur(Math.max(0, (presupuestoVar - r.variables) / r.diasRestantes))}/día lo que queda de mes.`);
  }

  // 2. Metas atrasadas o adelantadas.
  for (const m of activas) {
    if (m.estado === 'atrasado') {
      const faltaMes = m.necesarioMes - m.ritmoMes;
      add(85, '🐢', `«${m.nombre}» va con retraso`,
        `Para llegar a tiempo necesitas aportar ${fmtEur(m.necesarioMes, true)}/mes y ahora vas a ${fmtEur(m.ritmoMes, true)}/mes. Te faltan ${fmtEur(faltaMes, true)} al mes: aparta esa cantidad el día de cobro o recorta un gasto de ocio.`,
        { tipo: 'aportar', goalId: m.id, importe: Math.ceil(faltaMes) });
    } else if (m.estado === 'adelantado') {
      add(40, '🚀', `¡Vas adelantado en «${m.nombre}»!`,
        `Aportas ${fmtEur(m.ritmoMes, true)}/mes y solo necesitas ${fmtEur(m.necesarioMes, true)}. Si sigues así, llegarás antes de lo previsto. Puedes subir la meta o empezar otra.`);
    }
  }

  // 3. Categorías que han subido frente a la media de los meses anteriores.
  const historial = mesesConHistorial(d, mk);
  if (historial.length) {
    for (const [cat, actual] of Object.entries(r.porCategoria)) {
      if (CATEGORIAS[cat]?.tipo !== 'deseo') continue;
      const media = sum(d.expenses.filter(e => e.categoria === cat && historial.includes(monthKey(e.fecha))), e => e.importe) / historial.length;
      if (media > 0 && actual > media * 1.2 && actual - media >= 15) {
        const extra = actual - media;
        add(80, catIcono(cat), `${catNombre(cat)}: +${Math.round((actual / media - 1) * 100)} % sobre tu media`,
          `Llevas ${fmtEur(actual, true)} este mes y tu media es ${fmtEur(media, true)}. Volviendo a tu media ahorrarías unos ${fmtEur(extra * 12, true)} al año.${adelanto(extra)}`);
      }
    }
  } else {
    // Sin historial: avisa si una categoría de deseos pesa mucho sobre la nómina.
    for (const [cat, actual] of Object.entries(r.porCategoria)) {
      if (CATEGORIAS[cat]?.tipo === 'deseo' && actual > r.ingresos * 0.12) {
        add(60, catIcono(cat), `${catNombre(cat)} se lleva mucho`,
          `Este mes llevas ${fmtEur(actual, true)} en ${catNombre(cat).toLowerCase()}, un ${Math.round(actual / r.ingresos * 100)} % de tus ingresos. Reducirlo un 30 % serían ${fmtEur(actual * 0.3 * 12, true)} al año.${adelanto(actual * 0.3)}`);
      }
    }
  }

  // 4. Gastos pequeños repetidos en los últimos 30 días.
  const hace30 = addDays(d.hoy, -30);
  const recientes = d.expenses.filter(e => e.fecha > hace30);
  const porCat = {};
  for (const e of recientes) if (CATEGORIAS[e.categoria]?.pequeno || e.importe < 10) (porCat[e.categoria] ||= []).push(e);
  for (const [cat, lista] of Object.entries(porCat)) {
    if (lista.length < 6 || CATEGORIAS[cat]?.tipo === 'necesidad') continue;
    const total = sum(lista, e => e.importe);
    add(70, catIcono(cat), `Los pequeños gastos en ${catNombre(cat).toLowerCase()} suman`,
      `${lista.length} gastos en 30 días: ${fmtEur(total)}. Al año son unos ${fmtEur(total * 12, true)}. Reducirlos a la mitad te ahorraría ${fmtEur(total * 6, true)}/año.${adelanto(total / 2)}`,
      { tipo: 'iniciar-reto', categoria: cat, ahorroEstimado: Math.round(total / 30 * 7) });
  }

  // 5. Suscripciones.
  const subs = d.fixed.filter(esSuscripcion);
  if (subs.length) {
    const mensual = sum(subs, s => s.importe);
    add(55, '📺', `Tus suscripciones: ${fmtEur(mensual * 12, true)} al año`,
      `${subs.map(s => `${s.nombre} (${fmtEur(s.importe)})`).join(', ')}. Revisa cuáles usas de verdad: cancelar una de ${fmtEur(Math.max(...subs.map(s => s.importe)))} son ${fmtEur(Math.max(...subs.map(s => s.importe)) * 12, true)} al año.`);
  }

  // 6. Exceso en deseos según la regla 50/30/20.
  const regla = regla503020(d, r);
  if (regla.pct.deseos > 35 && r.dia >= 10) {
    add(65, '⚖️', 'Mucho gasto en caprichos',
      `Tus gastos en deseos son el ${Math.round(regla.pct.deseos)} % de tus ingresos (lo recomendable es un 30 %). Bajando al 30 % liberarías ${fmtEur((regla.deseos - regla.objetivo.deseos) * 12, true)} al año para tus metas.`);
  }

  // 7. Fondo de emergencia.
  if (r.fijos > 0 && !d.savingsGoals.some(m => /emergencia/i.test(m.nombre))) {
    const meta = Math.ceil(r.fijos * 3 / 100) * 100;
    add(50, '🛟', 'Crea un fondo de emergencia',
      `Lo recomendable es tener ahorrados entre 3 y 6 meses de gastos fijos: entre ${fmtEur(meta, true)} y ${fmtEur(r.fijos * 6, true)}. Te protege de imprevistos sin tocar tus otras metas.`,
      { tipo: 'crear-meta', nombre: 'Fondo de emergencia', meta, emoji: '🛟' });
  }

  // 8. Sobrante del mes anterior.
  const mkAnt = prevMonthKey(mk);
  if (!d.sobrantesRepartidos?.includes(mkAnt) && d.inicioApp && d.inicioApp <= `${mkAnt}-28` && activas.length) {
    const ant = resumenMes(d, mkAnt);
    if (ant.disponible >= 10) {
      const reparto = repartoPorPrioridad(Math.floor(ant.disponible), activas);
      if (reparto.length) {
        add(88, '🎁', `Te sobraron ${fmtEur(ant.disponible, true)} el mes pasado`,
          `Propuesta de reparto según la prioridad de tus metas: ${reparto.map(x => `${x.nombre} ${fmtEur(x.importe, true)}`).join(', ')}.`,
          { tipo: 'repartir-sobrante', mk: mkAnt, reparto });
      }
    }
  }

  // 9. Reto semanal.
  const reto = evaluarReto(d.reto, d.expenses, d.hoy);
  if (!reto || reto.terminado) {
    const top = Object.entries(recientes.reduce((o, e) => (CATEGORIAS[e.categoria]?.tipo === 'deseo' && (o[e.categoria] = (o[e.categoria] || 0) + e.importe), o), {}))
      .sort((a, b) => b[1] - a[1])[0];
    if (top && !recs.some(x => x.accion?.tipo === 'iniciar-reto')) {
      add(30, '🏆', `Reto: una semana sin ${catNombre(top[0]).toLowerCase()}`,
        `En los últimos 30 días gastaste ${fmtEur(top[1], true)} en esto. Una semana sin ello son unos ${fmtEur(top[1] / 30 * 7, true)} que puedes meter en tu cerdito.`,
        { tipo: 'iniciar-reto', categoria: top[0], ahorroEstimado: Math.round(top[1] / 30 * 7) });
    }
  }

  return recs.sort((a, b) => b.prio - a.prio);
}

// Resumen agregado (sin notas personales) para que la IA analice tus finanzas.

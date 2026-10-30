import { uid } from './util.js';

// Catálogo de hábitos saludables. Cada familia es un mismo propósito con alternativas para probar,
// de más fácil a más retadora y de gratis a con gasto. Las cifras vienen de recomendaciones oficiales
// (OMS: actividad física y dieta; AASM: sueño; EFSA: agua).

export const DIFICULTAD = [[1, 'Fácil'], [2, 'Media'], [3, 'Retadora']];
export const COSTE = [[0, 'Gratis'], [1, 'Barato'], [2, 'Con gasto']];
export const CATEGORIAS_HABITO = [
  ['mover', '🏃 Moverte'], ['comer', '🥗 Comer mejor'], ['agua', '💧 Beber agua'], ['dormir', '😴 Dormir mejor'],
  ['mente', '🧘 Mente y ánimo'], ['pantallas', '📵 Pantallas'], ['social', '❤️ Relaciones'], ['aprender', '📚 Aprender'],
  ['orden', '🧹 Orden y dinero'], ['cuidarte', '🩺 Cuidarte'],
];

const OMS_ACTIVIDAD = 'OMS: 150–300 min de actividad moderada a la semana y fuerza 2 días';
const OMS_DIETA = 'OMS: al menos 400 g (5 raciones) de fruta y verdura al día';

export const FAMILIAS = [
  { id: 'caminar', cat: 'mover', nombre: 'Caminar más', fuente: OMS_ACTIVIDAD, alternativas: [
    { id: 'caminar-10', emoji: '🚶', titulo: 'Caminar 10 minutos después de comer', dificultad: 1, coste: 0, porque: 'Corta el tiempo sentado y ayuda a la digestión.', empezar: 'Da una vuelta a la manzana justo al terminar de comer.' },
    { id: 'caminar-30', emoji: '🚶', titulo: 'Caminar 30 minutos al día', dificultad: 2, coste: 0, porque: 'Cinco días así suman los 150 minutos a la semana que recomienda la OMS.', empezar: 'Bájate una parada antes o haz los recados andando.' },
    { id: 'pasos-10000', emoji: '👟', titulo: 'Dar 10.000 pasos al día', dificultad: 3, coste: 0, porque: 'Un reto claro y fácil de medir.', empezar: 'Mira tus pasos en la app Salud del iPhone y súbelos poco a poco.' },
  ] },
  { id: 'fuerza', cat: 'mover', nombre: 'Ganar fuerza', fuente: OMS_ACTIVIDAD, alternativas: [
    { id: 'fuerza-5', emoji: '💪', titulo: '5 minutos de ejercicios en casa', dificultad: 1, coste: 0, porque: 'Sentadillas, flexiones apoyado en la pared y plancha: sin material.', empezar: 'Hazlos mientras se calienta el café o la cena.' },
    { id: 'fuerza-casa', emoji: '🏋️', titulo: 'Rutina de fuerza en casa 2–3 días por semana', dificultad: 2, coste: 0, porque: 'La OMS recomienda trabajar los músculos al menos 2 días a la semana.', empezar: 'Busca en YouTube una rutina de 20 minutos «sin material».' },
    { id: 'gimnasio', emoji: '🏋️', titulo: 'Gimnasio 3 días por semana', dificultad: 3, coste: 2, porque: 'Más variedad y progresión, con material y monitores.', empezar: 'Apúntate a un gimnasio cerca de casa o del trabajo: si pilla de camino, irás más.' },
  ] },
  { id: 'cardio', cat: 'mover', nombre: 'Hacer deporte', fuente: OMS_ACTIVIDAD, alternativas: [
    { id: 'bailar', emoji: '💃', titulo: 'Bailar 2 canciones', dificultad: 1, coste: 0, porque: 'Mueve el cuerpo y sube el ánimo en 7 minutos.', empezar: 'Pon tus dos canciones favoritas al llegar a casa.' },
    { id: 'bici', emoji: '🚲', titulo: 'Ir en bici o patinete en vez de en coche', dificultad: 2, coste: 1, porque: 'Haces ejercicio sin buscar tiempo extra y ahorras transporte.', empezar: 'Prueba con un trayecto corto a la semana (o la bici pública de tu ciudad).' },
    { id: 'correr', emoji: '🏃', titulo: 'Correr 20 minutos 3 días por semana', dificultad: 3, coste: 0, porque: 'Mejora el corazón y la resistencia en poco tiempo.', empezar: 'Empieza alternando 1 minuto corriendo y 2 andando.' },
    { id: 'clases', emoji: '🏊', titulo: 'Clases de natación, baile o pádel', dificultad: 2, coste: 2, porque: 'Tener hora fija y compañeros ayuda a no faltar.', empezar: 'Mira las actividades del polideportivo municipal: suelen ser más baratas.' },
  ] },
  { id: 'sentado', cat: 'mover', nombre: 'Estar menos tiempo sentado', fuente: 'OMS: reducir el tiempo sentado, con cualquier actividad', alternativas: [
    { id: 'levantarse', emoji: '🧍', titulo: 'Levantarte 2 minutos cada hora', dificultad: 1, coste: 0, porque: 'Romper el tiempo sentado tiene beneficios por sí mismo.', empezar: 'Pon una alarma cada hora en el trabajo o mientras estudias.' },
    { id: 'escaleras', emoji: '🪜', titulo: 'Subir siempre por las escaleras', dificultad: 1, coste: 0, porque: 'Ejercicio gratis que ya está en tu camino.', empezar: 'Empieza por un piso y añade otro cada semana.' },
    { id: 'estirar', emoji: '🤸', titulo: 'Estirar 5 minutos al levantarte', dificultad: 1, coste: 0, porque: 'Despierta el cuerpo y alivia la espalda.', empezar: 'Estira cuello, espalda y piernas antes de mirar el móvil.' },
    { id: 'yoga', emoji: '🧘', titulo: 'Yoga 15 minutos', dificultad: 2, coste: 0, porque: 'Flexibilidad, fuerza y calma a la vez.', empezar: 'Hay sesiones gratuitas para principiantes en YouTube.' },
  ] },
  { id: 'fruta', cat: 'comer', nombre: 'Más fruta y verdura', fuente: OMS_DIETA, alternativas: [
    { id: 'fruta-1', emoji: '🍎', titulo: 'Una pieza de fruta al día', dificultad: 1, coste: 1, porque: 'Un primer paso fácil hacia las 5 raciones diarias.', empezar: 'Deja la fruta a la vista, en la mesa o en la mochila.' },
    { id: 'verdura', emoji: '🥦', titulo: 'Verdura en la comida y en la cena', dificultad: 2, coste: 1, porque: 'Con fruta, te acerca a los 400 g al día que recomienda la OMS.', empezar: 'Compra verdura congelada: es barata, dura y está lista en minutos.' },
    { id: 'cinco', emoji: '🥗', titulo: '5 raciones de fruta y verdura al día', dificultad: 3, coste: 1, porque: 'Es la recomendación de la OMS (al menos 400 g al día).', empezar: 'Cuenta las raciones del día y suma una cada semana.' },
  ] },
  { id: 'azucar', cat: 'comer', nombre: 'Menos azúcar y ultraprocesados', fuente: 'OMS: azúcar libre por debajo del 10 % de lo que comes y menos de 5 g de sal al día', alternativas: [
    { id: 'refresco', emoji: '🥤', titulo: 'Cambiar el refresco por agua o infusión', dificultad: 1, coste: 0, porque: 'Una lata de refresco ya trae buena parte del azúcar de todo el día.', empezar: 'Empieza por la comida: agua con limón o gas en vez de refresco.' },
    { id: 'sin-picar', emoji: '🍪', titulo: 'No picar bollería ni snacks entre horas', dificultad: 2, coste: 0, porque: 'Menos azúcar y sal, y además ahorras.', empezar: 'Si tienes hambre, fruta o un puñado de frutos secos.' },
    { id: 'cocinar', emoji: '🍳', titulo: 'Cocinar en casa 4 días por semana', dificultad: 2, coste: 1, porque: 'Sabes lo que comes y gastas mucho menos que pidiendo comida.', empezar: 'Elige 3 recetas fáciles y repítelas hasta que te salgan solas.' },
    { id: 'batch', emoji: '🍱', titulo: 'Cocinar el domingo para toda la semana', dificultad: 3, coste: 1, porque: 'Entre semana comes sano sin tiempo ni ganas.', empezar: 'Prepara una legumbre, un cereal y verdura asada en 2 horas.' },
  ] },
  { id: 'comer-consciente', cat: 'comer', nombre: 'Comer con calma', alternativas: [
    { id: 'sin-pantalla', emoji: '🍽️', titulo: 'Comer sin pantallas', dificultad: 1, coste: 0, porque: 'Notas antes cuándo estás lleno y disfrutas más.', empezar: 'Deja el móvil en otra habitación durante una comida al día.' },
    { id: 'desayuno', emoji: '🥣', titulo: 'Desayunar algo sano', dificultad: 1, coste: 1, porque: 'Empiezas el día con energía y picas menos después.', empezar: 'Fruta, yogur, tostada integral o avena: prepáralo la noche antes.' },
  ] },
  { id: 'agua', cat: 'agua', nombre: 'Beber agua', fuente: 'EFSA: unos 2 L al día en mujeres y 2,5 L en hombres, contando el agua de la comida', alternativas: [
    { id: 'vaso-manana', emoji: '💧', titulo: 'Un vaso de agua al levantarte', dificultad: 1, coste: 0, porque: 'El primer paso más fácil para hidratarte.', empezar: 'Deja un vaso lleno en la mesilla por la noche.' },
    { id: 'botella', emoji: '🧴', titulo: 'Llevar siempre una botella de agua', dificultad: 1, coste: 1, porque: 'Si la tienes a mano, bebes sin pensarlo.', empezar: 'Una botella reutilizable de 500 ml: rellénala 3 veces al día.' },
    { id: 'agua-2l', emoji: '💧', titulo: 'Beber 1,5–2 litros de agua al día', dificultad: 2, coste: 0, porque: 'Junto al agua de la comida, cubre lo que recomienda la EFSA.', empezar: 'Un vaso con cada comida y otro entre horas.' },
  ] },
  { id: 'sueno', cat: 'dormir', nombre: 'Dormir mejor', fuente: 'AASM: los adultos necesitan 7 horas o más de sueño cada noche', alternativas: [
    { id: 'misma-hora', emoji: '🛏️', titulo: 'Acostarte siempre a la misma hora', dificultad: 1, coste: 0, porque: 'Un horario regular hace que te duermas antes y descanses mejor.', empezar: 'Pon una alarma de «hora de ir a la cama».' },
    { id: 'sin-pantalla-noche', emoji: '📵', titulo: 'Sin pantallas 30 minutos antes de dormir', dificultad: 2, coste: 0, porque: 'Te ayuda a desconectar y a coger el sueño.', empezar: 'Carga el móvil fuera del dormitorio y lee un rato.' },
    { id: 'dormir-7', emoji: '😴', titulo: 'Dormir 7 horas o más', dificultad: 2, coste: 0, porque: 'Es lo que recomiendan los especialistas del sueño para adultos.', empezar: 'Cuenta 7 h y media hacia atrás desde que suena el despertador.' },
    { id: 'cafe-tarde', emoji: '☕', titulo: 'Nada de café después de las 15:00', dificultad: 2, coste: 0, porque: 'La cafeína dura horas en el cuerpo y retrasa el sueño.', empezar: 'Por la tarde, descafeinado o infusión.' },
    { id: 'dormitorio', emoji: '🌙', titulo: 'Dormitorio oscuro y silencioso', dificultad: 1, coste: 1, porque: 'Menos luz y ruido, sueño más profundo.', empezar: 'Un antifaz y unos tapones cuestan pocos euros.' },
  ] },
  { id: 'meditar', cat: 'mente', nombre: 'Calmar la mente', alternativas: [
    { id: 'respirar', emoji: '🌬️', titulo: 'Respirar despacio 1 minuto', dificultad: 1, coste: 0, porque: 'Baja el estrés en el momento, en cualquier sitio.', empezar: 'Respiración en caja: inspira 4 s, aguanta 4, suelta 4, aguanta 4.' },
    { id: 'meditar-10', emoji: '🧘', titulo: 'Meditar 10 minutos', dificultad: 2, coste: 0, porque: 'Con práctica, ayuda a gestionar el estrés y la atención.', empezar: 'Hay meditaciones guiadas gratis en YouTube y en podcasts.' },
    { id: 'meditar-app', emoji: '📱', titulo: 'Curso de meditación con app', dificultad: 2, coste: 2, porque: 'Un programa guiado paso a paso, si te cuesta empezar solo.', empezar: 'Prueba el periodo gratuito antes de pagar.' },
  ] },
  { id: 'gratitud', cat: 'mente', nombre: 'Ánimo y gratitud', alternativas: [
    { id: 'tres-cosas', emoji: '✨', titulo: 'Apuntar 3 cosas buenas del día', dificultad: 1, coste: 0, porque: 'Entrena la mente para fijarse en lo que sí va bien.', empezar: 'Hazlo antes de dormir, en una nota del móvil o en papel.' },
    { id: 'diario', emoji: '📓', titulo: 'Escribir un diario 10 minutos', dificultad: 2, coste: 0, porque: 'Ordena lo que piensas y ayuda a soltar preocupaciones.', empezar: 'Escribe sin pensar: qué ha pasado y cómo te has sentido.' },
    { id: 'luz-natural', emoji: '☀️', titulo: '10 minutos de luz natural por la mañana', dificultad: 1, coste: 0, porque: 'Ayuda a despertarte y a ordenar el reloj del sueño.', empezar: 'Desayuna junto a la ventana o sal a la calle un momento.' },
    { id: 'naturaleza', emoji: '🌳', titulo: 'Paseo por la naturaleza el fin de semana', dificultad: 2, coste: 0, porque: 'Estar en un parque o en el campo baja el estrés.', empezar: 'Busca el parque o la ruta más cercana y queda con alguien.' },
  ] },
  { id: 'movil', cat: 'pantallas', nombre: 'Usar menos el móvil', alternativas: [
    { id: '20-20-20', emoji: '👀', titulo: 'Regla 20-20-20 para la vista', dificultad: 1, coste: 0, porque: 'Cada 20 minutos de pantalla, mira 20 segundos algo a unos 6 metros: descansa los ojos.', empezar: 'Asócialo a cada vez que terminas una tarea o un vídeo.' },
    { id: 'movil-fuera', emoji: '📵', titulo: 'Móvil fuera del dormitorio por la noche', dificultad: 2, coste: 1, porque: 'Duermes mejor y no empiezas el día con el móvil.', empezar: 'Un despertador barato sustituye al del móvil.' },
    { id: 'limite-redes', emoji: '⏳', titulo: 'Límite de 1 hora al día en redes sociales', dificultad: 2, coste: 0, porque: 'Recuperas tiempo para lo que de verdad te importa.', empezar: 'Ajustes → Tiempo de uso → Límites de apps.' },
    { id: 'dia-sin-redes', emoji: '🏝️', titulo: 'Un día a la semana sin redes', dificultad: 3, coste: 0, porque: 'Un descanso completo para la cabeza.', empezar: 'Elige el día más tranquilo y avisa a tus amigos.' },
  ] },
  { id: 'social', cat: 'social', nombre: 'Cuidar tus relaciones', alternativas: [
    { id: 'mensaje', emoji: '💬', titulo: 'Escribir a alguien que aprecias', dificultad: 1, coste: 0, porque: 'Las relaciones son de lo que más pesa en el bienestar.', empezar: 'Un mensaje corto: «Me he acordado de ti».' },
    { id: 'llamar', emoji: '📞', titulo: 'Llamar a un familiar o amigo cada semana', dificultad: 1, coste: 0, porque: 'Una conversación de voz acerca mucho más que un chat.', empezar: 'Aprovecha un trayecto o un paseo para llamar.' },
    { id: 'plan', emoji: '🍻', titulo: 'Un plan con amigos cada semana', dificultad: 2, coste: 1, porque: 'Ver a la gente en persona sube el ánimo.', empezar: 'Planes baratos: paseo, café, cena en casa o deporte juntos.' },
    { id: 'voluntariado', emoji: '🤝', titulo: 'Hacer voluntariado', dificultad: 3, coste: 0, porque: 'Ayudar a otros da sentido y te conecta con gente nueva.', empezar: 'Busca asociaciones de tu barrio: muchas piden solo unas horas al mes.' },
  ] },
  { id: 'aprender', cat: 'aprender', nombre: 'Aprender algo cada día', alternativas: [
    { id: 'leer-10', emoji: '📖', titulo: 'Leer 10 páginas', dificultad: 1, coste: 0, porque: 'Diez páginas al día son más de 10 libros al año.', empezar: 'Saca libros gratis de la biblioteca o de la app eBiblio.' },
    { id: 'leer-30', emoji: '📚', titulo: 'Leer 30 minutos al día', dificultad: 2, coste: 1, porque: 'Aprendes, desconectas y duermes mejor que con el móvil.', empezar: 'Lee en la cama en vez de mirar el móvil.' },
    { id: 'idioma-app', emoji: '🗣️', titulo: '10 minutos de un idioma con una app', dificultad: 1, coste: 0, porque: 'Poco cada día funciona mejor que mucho de golpe.', empezar: 'Duolingo y similares tienen versión gratuita.' },
    { id: 'curso', emoji: '🎓', titulo: 'Hacer un curso online', dificultad: 3, coste: 1, porque: 'Aprender algo nuevo con un plan y un final claro.', empezar: 'Hay cursos gratuitos en Coursera, edX o YouTube.' },
  ] },
  { id: 'orden', cat: 'orden', nombre: 'Orden y dinero', alternativas: [
    { id: 'cama', emoji: '🛏️', titulo: 'Hacer la cama al levantarte', dificultad: 1, coste: 0, porque: 'Una primera tarea cumplida que te pone en marcha.', empezar: 'Hazla nada más levantarte, antes del café.' },
    { id: 'ordenar-10', emoji: '🧹', titulo: 'Ordenar 10 minutos al día', dificultad: 1, coste: 0, porque: 'Una casa ordenada da sensación de calma.', empezar: 'Pon un temporizador y recoge lo que puedas.' },
    { id: 'gastos', emoji: '💸', titulo: 'Apuntar tus gastos del día', dificultad: 1, coste: 0, porque: 'Saber en qué se va el dinero es el primer paso para ahorrar.', empezar: 'Dile al asistente: «he gastado 5 € en café».' },
    { id: 'planificar', emoji: '🗓️', titulo: 'Planificar el día siguiente por la noche', dificultad: 2, coste: 0, porque: 'Empiezas el día sabiendo qué hacer.', empezar: 'Pregunta al asistente «¿y mañana?» y ajusta lo que haga falta.' },
  ] },
  { id: 'cuidarte', cat: 'cuidarte', nombre: 'Cuidarte', alternativas: [
    { id: 'postura', emoji: '🧍', titulo: 'Revisar tu postura 3 veces al día', dificultad: 1, coste: 0, porque: 'Menos dolor de espalda y cuello si pasas muchas horas sentado o de pie.', empezar: 'Hombros atrás, espalda apoyada y la pantalla a la altura de los ojos.' },
    { id: 'dientes', emoji: '🦷', titulo: 'Usar hilo dental cada noche', dificultad: 1, coste: 1, porque: 'Limpia donde el cepillo no llega y cuida las encías.', empezar: 'Déjalo al lado del cepillo de dientes.' },
    { id: 'protector', emoji: '🧴', titulo: 'Protector solar al salir de casa', dificultad: 1, coste: 1, porque: 'Protege la piel del sol todo el año.', empezar: 'Una crema hidratante con protección para la cara.' },
    { id: 'alcohol', emoji: '🚫', titulo: 'Semana sin alcohol', dificultad: 3, coste: 0, porque: 'Duermes mejor, tienes más energía y ahorras.', empezar: 'Cambia la caña por una sin alcohol o un refresco sin azúcar.' },
    { id: 'tabaco', emoji: '🚭', titulo: 'Reducir o dejar el tabaco', dificultad: 3, coste: 0, porque: 'Lo que más mejora la salud en poco tiempo (y el bolsillo).', empezar: 'Pide ayuda en tu centro de salud: tienen programas gratuitos para dejarlo.' },
  ] },
];

/** Todas las alternativas, con su familia, categoría y fuente. */
export const TODOS = FAMILIAS.flatMap(f => f.alternativas.map(a => ({ ...a, familia: f.id, cat: f.cat, fuente: f.fuente || '' })));

export const habitoPorId = id => TODOS.find(h => h.id === id) || null;

/** Alternativas que cumplen los filtros (dificultad, coste y categoría; null = cualquiera). */
export const filtrar = ({ dificultad = null, coste = null, cat = null } = {}) =>
  TODOS.filter(h => (dificultad == null || h.dificultad === dificultad) && (coste == null || h.coste === coste) && (cat == null || h.cat === cat));

/**
 * `n` sugerencias de familias distintas (y de categorías distintas si se puede) que el usuario aún no tiene.
 * `yaTiene`: ids del catálogo o títulos de sus hábitos actuales.
 */
export function sugerir(n, { yaTiene = [], dificultad = null, coste = null, azar = Math.random } = {}) {
  const tiene = new Set(yaTiene.map(x => String(x).toLowerCase()));
  const familiasConHabito = new Set(TODOS.filter(h => tiene.has(h.id) || tiene.has(h.titulo.toLowerCase())).map(h => h.familia));
  const opciones = filtrar({ dificultad, coste }).filter(h => !familiasConHabito.has(h.familia))
    .map(h => ({ h, r: azar() })).sort((a, b) => a.r - b.r).map(x => x.h);
  const out = [];
  for (const h of opciones) {
    if (out.length >= n) break;
    if (out.some(x => x.familia === h.familia)) continue;
    if (out.some(x => x.cat === h.cat) && opciones.some(o => !out.some(x => x.cat === o.cat) && !out.some(x => x.familia === o.familia))) continue;
    out.push(h);
  }
  return out;
}

/** Hábito listo para guardar a partir de una alternativa del catálogo. */
export const habitoNuevo = (h, hoy) => ({ id: uid(), titulo: h.titulo, emoji: h.emoji, registros: [], creado: hoy, catalogo: h.id, dificultad: h.dificultad, coste: h.coste });

/** Alternativa un poco más retadora de la misma familia (para «subir de nivel»), o null. */
export function siguienteNivel(id) {
  const h = habitoPorId(id);
  if (!h) return null;
  return TODOS.filter(x => x.familia === h.familia && x.dificultad > h.dificultad).sort((a, b) => a.dificultad - b.dificultad || a.coste - b.coste)[0] || null;
}

# Mi Mejor Versión

App web personal (PWA) para iPhone: objetivos, horario inteligente, asistente propio, ahorro con cerdito evolutivo y recordatorios con frases motivadoras. Gratis, sin servidor y **sin IA externa**: todo funciona sin internet ni claves y los datos se guardan en el propio dispositivo.

## Qué incluye

- **Hoy**: progreso del día, caja para escribir al asistente, bloque actual y siguiente, hábitos con rachas y resumen de ahorro.
- **Hábitos**: catálogo de más de 40 hábitos saludables (cifras de la OMS, la AASM y la EFSA) con filtros de dificultad (fácil, media, retadora), coste (gratis, barato, con gasto) y tema, alternativas para probar dentro de cada propósito, «🎲 Sugiéreme 3» y «⬆️ subir de nivel» tras 7 días de racha. Al añadir un hábito se pregunta si por la mañana, por la tarde o por la noche y se pone en el horario como un objetivo (cada día o X días por semana); marcarlo en «Hoy» marca su bloque y al revés. Cada hábito trae los pensamientos que suelen frenarlo y cómo darles la vuelta, que salen también como frase en sus bloques y recordatorios.
- **Objetivos**: objetivos con horas semanales, tareas y botón «¿Cómo empiezo?» (primeros pasos según el tipo de objetivo).
- **Horario**: generador automático según tu disponibilidad (con turnos rotativos), que reparte solo lo que cabe en los días que quedan y pone cada objetivo a la misma hora para crear rutina.
- **Enviar al iPhone**: crea Recordatorios (y Alarmas para lo importante) con una frase motivadora mediante un Atajo de iOS.
- **Ahorro**: nómina, gastos fijos y diarios, metas con cerdito que crece y evoluciona, recomendaciones para ahorrar más y retos semanales.
- **Asistente** (sin IA): chat que entiende órdenes con tus palabras y gestiona el día: «¿qué me toca hoy?», «ya he hecho inglés», «hoy no puedo», «pásalo a mañana», «añade 1 hora de inglés el sábado» (si no dices el día, te lo pregunta), «recomiéndame un hábito fácil y gratis», «hoy tengo libre de 5 a 8», «esta semana estoy de tarde», «he gastado 5 € en café», «aparto 20 € para el viaje», «¿cómo voy?», «no tengo ganas»… Cada cambio se puede deshacer. Cada día te saluda con tu plan, te pregunta por lo que quedó sin marcar y por la noche te hace un resumen.
- **Configuración paso a paso** (sin escribir): ¿trabajas o estudias? (horario fijo con jornada partida, turnos rotativos o distinto cada día, y trayecto), a qué hora te levantas y te acuestas, y tus objetivos (nombre, horas a la semana con un contador, días de la semana y momento preferido, avisando de si caben). Termina con la semana de ejemplo y crea el horario. Es la bienvenida y se puede repetir desde Horario («📝 Mi plan») o Perfil.
- **Plan con un texto (en pruebas)**: en Perfil → «🧪 En pruebas», escribes tu situación con tus palabras y el intérprete de la app (reglas, sin internet) entiende trabajo o clases, turnos, objetivos, hábitos y dinero, y te enseña lo que ha entendido antes de guardar.
- **Turnos rotativos**: horas libres distintas para cada turno; la app sabe qué turno te toca cada semana y cambia el horario sola.
- **Progreso**: gráfica del % cumplido cada día (7/30/90 días) con su media, horas por objetivo, calendario de cada hábito y 15 logros con medallas.
- **Revisión semanal**: los domingos (o hasta el miércoles siguiente), resumen de la semana y 3 ideas para la próxima, calculadas con tus números.
- **Modo concentración**: temporizador (hasta el final del bloque o Pomodoro 25/5) que marca el bloque como hecho al terminar.
- **Aviso de copia de seguridad** cada 7 días y **aviso de versión nueva** al publicar cambios.

## Probar en el ordenador

```
python -m http.server 8000
```

Abre http://localhost:8000. Abrir `index.html` con doble clic no funciona, porque los módulos y el service worker necesitan un servidor.

Pruebas de la lógica (horario y finanzas): http://localhost:8000/tests/

## Publicar (GitHub Pages)

```
git add -A
git commit -m "Actualización"
git push
```

Después de cambiar archivos, sube `VERSION` en `sw.js` para que el iPhone descargue la versión nueva.

## Estructura

| Ruta | Qué es |
|---|---|
| `index.html`, `css/app.css` | Página y diseño |
| `js/app.js` | Arranque y navegación |
| `js/db.js`, `js/datos.js` | Base de datos local y valores por defecto |
| `js/scheduler.js` | Generador y validación de horarios |
| `js/finanzas.js` | Presupuesto, metas y recomendaciones de ahorro |
| `js/cerdito.js` | Cerdito hucha en SVG |
| `js/habitos.js` | Catálogo de hábitos saludables, duración, momento recomendado, pensamientos y sugerencias |
| `js/rutinas.js` | Hábitos en el horario: objetivo asociado, bloques y marcar hábito ↔ bloque |
| `js/configuracion.js` | Respuestas del cuestionario → horas libres, turnos y objetivos |
| `js/interprete.js` | Intérprete de texto sin IA (en pruebas), cálculo de horas libres y turnos rotativos |
| `js/plan.js` | Validación del plan antes de guardarlo |
| `js/progreso.js` | Cálculos de progreso diario, rachas y resumen semanal |
| `js/logros.js` | Logros y medallas |
| `js/grafica.js` | Gráficas y calendario (SVG sin librerías) |
| `js/agente.js` | Asistente: entiende órdenes, las ejecuta (con deshacer) y prepara el plan del día |
| `js/iphone.js` | Envío al Atajo de Recordatorios/Alarmas |
| `js/views/*` | Pantallas |
| `docs/*` | Guías que se muestran dentro de la app |
| `tests/` | Pruebas en el navegador |

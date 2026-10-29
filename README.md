# Mi Mejor Versión

App web personal (PWA) para iPhone: objetivos, horario inteligente, coach con IA, ahorro con cerdito evolutivo y recordatorios con frases motivadoras. Gratis y sin servidor: todos los datos se guardan en el propio dispositivo.

## Qué incluye

- **Hoy**: progreso del día, bloque actual y siguiente, consejo diario del coach, hábitos con rachas y resumen de ahorro.
- **Objetivos**: objetivos con horas semanales, tareas y botón «¿Cómo empiezo?» (la IA propone los primeros pasos).
- **Horario**: generador automático según tu disponibilidad y «Pídeme tu horario» en lenguaje natural, con vista previa.
- **Enviar al iPhone**: crea Recordatorios (y Alarmas para lo importante) con una frase motivadora mediante un Atajo de iOS.
- **Ahorro**: nómina, gastos fijos y diarios, metas con cerdito que crece y evoluciona, recomendaciones para ahorrar más, retos semanales y análisis con IA.
- **Coach**: chat con Gemini que conoce tus objetivos, horario y finanzas, y propone cambios que tú confirmas.

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
| `js/coach.js` | Cliente de Gemini y acciones del coach |
| `js/iphone.js` | Envío al Atajo de Recordatorios/Alarmas |
| `js/views/*` | Pantallas |
| `docs/*` | Guías que se muestran dentro de la app |
| `tests/` | Pruebas en el navegador |

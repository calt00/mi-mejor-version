# Recordatorios y alarmas en tu iPhone

Una app web no puede crear recordatorios ni alarmas por sí sola. Para eso usamos la app **Atajos** (viene de serie en el iPhone). Creas el atajo **una sola vez** y, desde entonces, el botón **«📲 Enviar al iPhone»** de la app hace todo por ti:

- Cada bloque de tu horario se crea como **recordatorio** en la lista **«Mi Mejor Versión»**, con su **frase motivadora** en las notas.
- Los bloques **importantes (⏰)** crean además una **alarma** del Reloj, que suena aunque tengas el móvil en silencio.
- Si vuelves a enviar el mismo día, los recordatorios pendientes de esas fechas se **sustituyen**, sin duplicados.

> Tarda unos 10 minutos. Ve despacio y sigue los pasos en orden. Los nombres pueden variar un poco según tu versión de iOS: usa el buscador de acciones con la palabra indicada.

## Paso 0 · Prepara Recordatorios

1. Abre la app **Recordatorios**.
2. Pulsa **Añadir lista** (abajo a la derecha).
3. Llámala exactamente **Mi Mejor Versión** y pulsa **OK**.

## Paso 1 · Crea el atajo

1. Abre la app **Atajos** → pestaña **Atajos** → botón **+** (arriba a la derecha).
2. Arriba, pulsa el nombre del atajo → **Renombrar** → escribe exactamente **MMV Horario**.

## Paso 2 · Leer el horario que envía la app

1. Pulsa **Buscar acciones**, escribe **diccionario** y añade **Obtener diccionario de la entrada**.
2. En esa acción, toca la palabra azul **Entrada** y elige **Entrada del atajo**.
3. Arriba aparecerá **«Recibir ... de ...»**. Tócalo y deja marcado solo **Texto**. En **«Si no hay entrada»** elige **Obtener portapapeles**.

## Paso 3 · Borrar los recordatorios anteriores de esas fechas

1. Busca **fechas** y añade **Obtener fechas de la entrada**. Toca la entrada → **Seleccionar variable** → toca **Diccionario** → elige la clave **desde**. *(Si te pide escribir la clave, escribe* `desde`*.)*
2. Toca el resultado y **renómbralo** a **Desde**: mantén pulsado → *Renombrar*.
3. Repite lo mismo con la clave **hasta** y renombra el resultado a **Hasta**.
4. Busca **recordatorios** y añade **Buscar recordatorios**. Pulsa **Añadir filtro** y configura:
   - **Lista** · es · **Mi Mejor Versión**
   - **Está completado** · no está activado
   - **Fecha de vencimiento** · está entre · **Desde** y **Hasta**
5. Añade **Eliminar recordatorios** (busca *eliminar recordatorios*). Debe usar los **Recordatorios** de la acción anterior.

## Paso 4 · Crear cada recordatorio

1. Busca **diccionario** y añade **Obtener valor del diccionario**. Configúralo como: *Obtener* **Valor** *de* `bloques` *en* **Diccionario**.
2. Busca **repetir** y añade **Repetir con cada elemento**. Debe usar el **Valor del diccionario**.
3. **Dentro del bloque Repetir**, añade estas acciones en este orden:
   1. **Obtener valor del diccionario** → clave `titulo` en **Elemento de repetición**. Renombra el resultado a **Título**.
   2. **Obtener valor del diccionario** → clave `frase` en **Elemento de repetición**. Renombra a **Frase**.
   3. **Obtener valor del diccionario** → clave `inicio` en **Elemento de repetición**.
   4. **Obtener fechas de la entrada** con el valor anterior. Renombra a **Hora**.
   5. **Añadir nuevo recordatorio**:
      - Texto: **Título**
      - Lista: **Mi Mejor Versión**
      - Activa **Avisarme** → **A una hora** → elige la variable **Hora**
      - Pulsa **Mostrar más** → en **Notas** pon **Frase**
   6. **Obtener valor del diccionario** → clave `alarma` en **Elemento de repetición**.
   7. **Si** (busca *si*) → *Valor del diccionario* · **es** · escribe `si`
   8. **Dentro del Si**: añade **Obtener valor del diccionario** → clave `etiquetaAlarma` en **Elemento de repetición**.
   9. Justo debajo, busca **alarma** y añade **Crear alarma**:
      - Hora: **Hora**
      - Pulsa **Mostrar más** → Etiqueta: el **Valor del diccionario** anterior (ya incluye el título y la frase)
   10. Puedes borrar la parte **De lo contrario** del Si.

## Paso 5 · Avisarte de que ha terminado

1. **Fuera del Repetir**, al final del todo, añade **Mostrar notificación**.
2. Escribe: `✅ Horario enviado. ¡A por ello!`
3. Pulsa **OK** para guardar el atajo.

## Paso 6 · Pruébalo

1. Abre **Mi Mejor Versión** → **Hoy** → **📲 Enviar al iPhone**.
2. Elige **Hoy**, **Mañana** o **7 días** y pulsa **Crear en Recordatorios y Alarmas**.
3. La primera vez, iOS te pedirá permisos: elige **Permitir siempre** (Recordatorios y Reloj).
4. Abre **Recordatorios → Mi Mejor Versión** y comprueba tus bloques con sus frases.

> Truco: crea un bloque para dentro de 2 minutos, envíalo y bloquea el móvil para ver el aviso.

## Problemas frecuentes

- **«No se encuentra el atajo»**: el nombre debe ser exactamente **MMV Horario** (o el que pongas en *Perfil → Ajustes → Nombre de tu Atajo*).
- **No crea nada**: revisa en el Paso 2 que **Recibir** tenga marcado **Texto**. Como plan B, la app también copia el horario al portapapeles, y el atajo lo lee de ahí.
- **Pide confirmación cada vez que borra**: es normal en algunas versiones de iOS. Pulsa *Eliminar*.
- **Las horas salen mal**: comprueba que usas **Obtener fechas de la entrada** antes de *Añadir nuevo recordatorio* y *Crear alarma*.

## Extra · Limpiar alarmas antiguas (opcional)

Las alarmas creadas no se borran solas. Crea un segundo atajo, **MMV Limpiar alarmas**, y ejecútalo cuando quieras:

1. **Obtener todas las alarmas**.
2. **Repetir con cada elemento** (las alarmas).
3. Dentro: **Si** · *Elemento de repetición* → toca y elige **Etiqueta** · **empieza por** · `MMV`
4. Dentro del Si: **Eliminar alarma** → **Elemento de repetición**.

> Las alarmas de la app siempre llevan una etiqueta que empieza por **MMV**, así que este atajo solo borra esas y deja intactas tus alarmas de siempre.

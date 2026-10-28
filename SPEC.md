# Proyecto: App de liquidación de repartidores a partir de chats de WhatsApp

## 0. Cómo quiero que trabajes

1. Este documento es la fuente de verdad del proyecto en todas las sesiones. Léelo antes de cualquier tarea.
2. `CLAUDE.md` tiene el resumen, el stack y los comandos útiles.
3. Trabaja fase a fase (sección 11). Al terminar cada una: tests pasando, commit con mensaje claro y un resumen corto de qué está hecho y qué falta.
4. Si algo no está definido aquí, elige la opción más razonable, apúntala en una sección "Decisiones" al final de `SPEC.md` y avísame. Pregunta solo si te bloquea.
5. Antes de usar la API de Anthropic o cualquier librería, consulta su documentación actual; no te fíes de memoria.
6. Interfaz y comunicación conmigo: en español.
7. Repositorio: `github.com/yoanlypa/app_repartidores`. Despliegue en el VPS de Hostinger con Coolify.

## 0.1 Arquitectura (actualizada 28/10/2026)

```
repartos.yoapro.site  →  api.yoapro.site            →  PostgreSQL (VPS, Coolify)
(frontend estático)      (backend Fastify, VPS)        + API de Claude (fase 2)
```

- **Monorepo:** `/backend` (Node + TypeScript + Fastify + Drizzle ORM + PostgreSQL) y `/frontend` (React + Vite + TypeScript + Tailwind + React Router).
- Ambos se despliegan en el VPS con Coolify, cada uno con su Dockerfile y su subdominio.
- **Login:** sesión con cookie httpOnly + Secure + SameSite=Lax. `repartos.` y `api.` son el mismo "site" (yoapro.site), así que la cookie viaja con `credentials: 'include'`. CORS solo para el origen del frontend. Límite de intentos en el login. Sin registro público.
- **Roles:**
  - `superadmin` (Yoa): crea empresas y usuarios (script de consola `npm run crear-usuario`).
  - `empresa` (el dueño): solo ve los datos de su empresa.
  - Los repartidores no tienen acceso por ahora.
  - Todas las consultas filtran por `empresa_id`.

## 0.2 Alta automática de repartidores

- Al subir chats, el nombre se detecta desde el archivo (Android: `Chat de WhatsApp con X.txt`; iPhone: `.zip` con `_chat.txt`; el nombre varía con el idioma) y se contrasta con el remitente del chat que no es el dueño.
- Chats de grupo: cada remitente distinto del dueño es un repartidor.
- Pantalla "Repartidores nuevos detectados": crear / unir con uno existente (alias) / descartar.
- Si el nombre ya existe como nombre o alias, el chat se asigna directamente.
- Subidas repetidas: cada exportación trae todo el historial. Los mensajes se deduplican y se procesa solo el mes elegido; no se sobrescriben días editados a mano ni meses cerrados. Se guarda un historial de importaciones.

---

## 1. Contexto del negocio

Estoy desarrollando esta app para vendérsela a un cliente que tiene una empresa de reparto de paquetes.

- Cada día, al terminar, cada repartidor le envía al dueño un WhatsApp con **cuántos paquetes llevó al salir** y **con cuántos volvió**.
- A fin de mes, el dueño tiene que recorrer el chat de cada repartidor día por día, apuntar los números y calcular lo que le paga a cada uno. Le lleva horas y se cometen errores.
- **Objetivo:** el dueño exporta los chats de WhatsApp, los sube a la app y la app, con ayuda de IA, le genera los totales y la liquidación de cada repartidor.
- **Importante:** los repartidores no cambian nada de lo que hacen hoy.

Fórmula base: **entregados = salida − vuelta**.

---

## 2. Flujo del usuario (dueño)

1. En WhatsApp (normalmente desde el **móvil**): abre el chat de un repartidor → Más → Exportar chat → **Sin archivos**. Obtiene un `.txt` o un `.zip` con `_chat.txt` dentro. Repite con cada repartidor.
2. En la app: sube todos los archivos a la vez y elige el mes.
3. La app procesa: lector de chats → extracción con IA → validaciones.
4. Pantalla de revisión: ve la tabla de cada repartidor, corrige lo marcado como dudoso y lo marca como revisado.
5. Cierra el mes y descarga un Excel con todos los totales y un PDF de liquidación por repartidor.

La app debe ser **mobile-first**: lo más probable es que el dueño haga todo desde el móvil.

---

## 3. Reglas de arquitectura (no negociables)

- **El código lee, la IA interpreta, el código suma.** La IA solo extrae salida/vuelta por día. Los totales, entregados e importes siempre los calcula el código.
- A la IA solo se le envían los mensajes **del repartidor** y **del mes elegido**, nunca el chat completo.
- No se guarda el archivo de chat original: después de procesarlo se guardan solo los registros diarios y el mensaje original de cada día (para la revisión).
- La clave de la API de Anthropic solo vive en el servidor (variable de entorno). Nunca en el cliente.
- Deja un `empresa_id` en las tablas principales para poder vender la app a más empresas en el futuro, aunque de momento solo haya una.

---

## 4. Lector de chats (sin IA)

Debe soportar:

- **Android:** `07/10/26, 21:15 - Juan: Salí con 120, volví con 8`
- **iPhone:** `[07/10/26, 21:15:03] Juan: Salí con 120, volví con 8`
- Años de 2 y 4 dígitos, formato 24 h y 12 h (`9:15 p. m.`).
- Caracteres invisibles al inicio de línea (por ejemplo U+200E en iPhone).
- Mensajes multilínea (las líneas que no empiezan por fecha pertenecen al mensaje anterior).
- Mensajes de sistema a ignorar: aviso de cifrado de extremo a extremo, `<Multimedia omitido>`, "Se eliminó este mensaje", marcas de mensaje editado, etc.
- Archivos `.zip` (extraer `_chat.txt`).
- Fechas en formato español DD/MM por defecto.

Identificación de personas:

- En cada chat individual hay dos remitentes: el dueño y el repartidor.
- El remitente que aparece en **todos** los archivos subidos es el dueño. Detéctalo automáticamente y pídele confirmación la primera vez (guardarlo en ajustes).
- El repartidor se identifica por el nombre del archivo (`Chat de WhatsApp con Juan.txt`) y por el remitente. Cada repartidor tiene una lista de alias para que coincida aunque el contacto cambie de nombre.

Salida del lector: lista de mensajes `{ fecha_hora, remitente, texto }` filtrada por repartidor y mes.

Este módulo tiene que tener **tests unitarios** con fixtures de ambos formatos.

---

## 5. Extracción con IA

- SDK oficial de Anthropic. Modelo: `claude-haiku-4-5-20251001` (barato y suficiente).
- **Una llamada por repartidor y mes.**
- Usa **salida estructurada** (tool use con JSON schema) en lugar de pedir "devuelve JSON" en texto libre. Valida la respuesta con `zod` y reintenta una vez si no es válida.
- Envía cada mensaje con su fecha y hora.

Instrucciones para el modelo (adáptalas al formato de tool use):

```
Eres un asistente que extrae datos de reparto de mensajes de WhatsApp.
Recibirás los mensajes de UN repartidor durante un mes, con fecha y hora.
Cada día el repartidor indica con cuántos paquetes salió y con cuántos volvió.

Para cada día con datos devuelve:
fecha (AAAA-MM-DD), salida, vuelta, confianza ("alta" | "baja"), nota, mensaje_original.

Reglas:
- Si hay una corrección el mismo día ("perdona, eran 118"), usa el último dato y explícalo en "nota".
- Si un mensaje enviado de madrugada (00:00–05:59) se refiere claramente al día anterior, asígnalo a ese día.
- Si falta salida o vuelta, pon null y confianza "baja".
- Si el repartidor indica entregados en vez de vuelta ("entregué 112 de 120"), deduce vuelta y explícalo en "nota".
- Ignora mensajes que no hablen de paquetes.
- NO calcules totales.
```

---

## 6. Validaciones (código)

Cada registro diario tiene un estado: `ok`, `dudoso` o `error`.

- vuelta > salida → **error**
- salida o vuelta en null, o confianza baja → **dudoso**
- dos datos distintos el mismo día que la IA no resolvió → **dudoso**
- cifra muy fuera de lo normal respecto a la media de ese repartidor → **dudoso**
- día laborable sin ningún mensaje → **aviso** (días laborables configurables, por defecto lunes a sábado)

---

## 7. Pantalla de revisión

- **Resumen del mes:** una tarjeta por repartidor con días trabajados, entregados, importe a pagar y número de días dudosos.
- **Detalle por repartidor:** tabla diaria con fecha | salida | vuelta | entregados | mensaje original | estado.
  - Amarillo = dudoso, rojo = error, gris = día sin datos.
  - Salida y vuelta editables en línea; los cambios manuales quedan marcados.
  - Botón "Marcar como revisado".
  - Los totales se recalculan en tiempo real.
- Tiene que funcionar bien en móvil (en pantallas estrechas, tarjetas en vez de tabla).

---

## 8. Cálculo del pago

Tarifa configurable **por repartidor**, con estos tipos:

- Por paquete entregado (€/paquete)
- Por día trabajado (€/día)
- Fijo mensual + variable por paquete entregado

Además, ajustes manuales por mes (concepto + importe positivo o negativo: adelantos, gasolina, descuentos…).

⚠️ Pendiente de confirmar con el cliente cómo paga en realidad. Deja el sistema flexible.

---

## 9. Exportación y cierre de mes

- **Excel** (`exceljs`): una hoja de resumen con todos los repartidores y una hoja por repartidor con el detalle diario.
- **PDF de liquidación** por repartidor: datos del mes, tabla diaria, tarifa aplicada, ajustes y total a pagar.
- **Cerrar mes:** bloquea la edición. Solo se puede reabrir de forma explícita.

---

## 10. Stack y modelo de datos

**Stack:** ver sección 0.1. Además: SDK de Anthropic, `zod`, `exceljs`, `jszip`, generación de PDF (la librería más simple que funcione en el servidor) y Vitest para tests.

**Autenticación:** ver sección 0.1 (contraseñas con bcrypt).

**Tablas (orientativas):**

- `empresas`
- `usuarios` (dueño)
- `repartidores` (nombre, alias_whatsapp[], tipo_tarifa, importes, activo)
- `meses` (empresa, año-mes, estado: abierto/cerrado)
- `registros_dia` (repartidor, fecha, salida, vuelta, estado, nota_ia, mensaje_original, editado_manual, revisado)
- `ajustes` (repartidor, mes, concepto, importe)
- `importaciones` (nombre de archivo, fecha, repartidor detectado, estado, error)

---

## 11. Fases

1. **Base + lector de chats + login + subida:** proyecto, base de datos, lector con tests, login, subida de chats y alta automática de repartidores. Sin IA todavía. ✅ (28/10/2026)
2. **IA + validaciones:** extracción con IA, validaciones y un script de consola para probar con un `.txt` real (`npm run probar -- chat.txt`).
3. **Interfaz:** subida de archivos, gestión de repartidores y tarifas, pantalla de revisión.
4. **Pago, exportación y cierre:** cálculo del pago, Excel, PDF y cierre de mes.
5. **Producción:** despliegue en el VPS con Coolify (ver `DEPLOY.md`) y datos de demostración para enseñarle la app al cliente.

**Futuro (no hacer ahora):**

- Compartir el chat directamente desde WhatsApp a la app (PWA con Web Share Target en Android).
- Leer fotos de hojas de ruta (exportar "con archivos" + visión).
- Formulario diario para que los repartidores registren directamente.
- Bot con la API oficial de WhatsApp Business.

**Prohibido:** librerías no oficiales que se conecten al WhatsApp personal (whatsapp-web.js, Baileys, etc.). Riesgo de baneo del número.

---

## 12. Datos de prueba

- Crea fixtures inventados en ambos formatos con las variaciones reales que suelen aparecer:
  - "Salí con 120, volví con 8"
  - "120/8"
  - "hoy 95 y vuelvo con 3"
  - "perdona, eran 118 no 120"
  - "entregué 112 de 120"
  - mensajes de madrugada, días sin reporte, mensajes que no tienen nada que ver con paquetes, multimedia omitido.
- Yo te pasaré un chat real exportado (con los nombres cambiados) para afinar el lector y la IA con el formato real.

---

## 13. Criterios de terminado

- Subo 3 chats de ejemplo y en menos de 1 minuto tengo la tabla de cada repartidor.
- Los totales coinciden con una suma manual (cubierto por un test).
- Todo el flujo funciona cómodamente desde el móvil.
- Ningún total ni importe lo calcula la IA.
- Los días dudosos se ven a simple vista.

---

## 14. Pendiente de confirmar con el cliente

- Cómo paga a los repartidores (por paquete, por día, fijo + variable) y si la tarifa es igual para todos.
- Cuántos repartidores tiene y si usan Android o iPhone.
- Si alguno reporta con fotos en lugar de texto.
- Si hacen a veces dos rondas en un mismo día.
- Si trabaja como subcontrata (Amazon, GLS, SEUR…). En ese caso, en el futuro se podrían cruzar los datos con las liquidaciones de esa empresa.

---

## Decisiones

(Apunta aquí cada decisión tomada por tu cuenta, con fecha.)

- **28/10/2026:** frontend y backend separados en subdominios (`repartos.yoapro.site` y `api.yoapro.site`) en lugar de Next.js en Railway. Decisión de Yoa.
- **28/10/2026:** Drizzle ORM en lugar de Prisma: es JavaScript puro (sin binarios que descargar) y permite usar PGlite (Postgres en memoria) en los tests.
- **28/10/2026:** Fastify para la API (rápido, con validación y plugins de cookies, CORS, rate limit y multipart oficiales).
- **28/10/2026:** sesiones guardadas en la tabla `sesiones` (token aleatorio en cookie httpOnly, 30 días). Más simple que JWT y se pueden revocar.
- **28/10/2026:** el archivo original no se guarda. Solo se guardan los mensajes **del repartidor** (no los del dueño), deduplicados, en la tabla `mensajes`, para poder procesar cualquier mes en la fase 2. Se pueden borrar al cerrar el mes si se quiere.
- **28/10/2026:** el dueño se detecta como el remitente común a todos los archivos subidos (si hay 2+ archivos) o se elige en pantalla; se guarda en `empresas.nombre_dueno_whatsapp`.

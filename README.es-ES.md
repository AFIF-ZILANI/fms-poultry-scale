

# PoultryScale

Una aplicación de pesaje y registro de ventas para avicultores y mayoristas.

Un productor vende un lote pesando cajas de aves en una balanza, una tras otra, y luego descuenta un peso acordado por caja antes de calcular el total. PoultryScale es el instrumento para ello: registra cada pesaje en el momento, aplica la deducción por caja propia del sector, calcula el precio y entrega un recibo al comprador. Funciona totalmente sin conexión, porque en los galpones no hay cobertura.

---

## Propiedad

Desarrollada y mantenida por **ZeroD Software** y el **ZeroD Agency — Departamento Móvil**.
Un producto de **ZeroD Farms**, bajo el **ZeroD Umbrella**.

---

## Funcionalidades de la aplicación

**Sesión de pesaje.** El ciclo principal. Las cajas se colocan en la balanza, cada peso se introduce y se añade a un registro en curso. Opcionalmente, también se registra el conteo de aves por entrada, lo que permite calcular el peso promedio por ave de manera significativa. Una sesión puede pausarse en cualquier momento y reanudarse más tarde como borrador.

**Fase de descarte (cull).** Las aves descartadas (de subestándar) se pesan por separado en una segunda fase, se tarifican por sus propias condiciones —por kilo o por ave— y pueden marcarse como no vendidas. Nunca alteran el promedio del lote principal.

**Deducción por caja.** La convención del sector: se descuenta un peso fijo por caja. `fullCratesOnly` determina si una caja parcialmente llena tiene derecho a deducción. La regla reside en `lib/utils.ts` como `calcDeduction` para que pueda probarse de forma independiente a cualquier pantalla.

**Resumen de venta.** Cierra la sesión: parámetros de deducción, el cálculo, el importe final y lo que el comprador entregó realmente. Dejar el campo de recibido vacío registra el importe total: la venta se liquida en el momento del registro. Un monto menor es un **descuento**, no una deuda. (Ver *Modelo monetario* más abajo.)

**Lotes (Batches).** Un grupo de aves criadas juntas y vendidas a lo largo de varias sesiones. Un lote no almacena totales propios; cada cifra que muestra se consolida desde las ventas que contiene, por lo que nunca puede desincronizarse.

**Recibo.** Se renderiza de dos maneras: en pantalla (`components/ReceiptView.tsx`) y como HTML imprimible para compartir o exportar a PDF (`lib/receiptHtml.ts`). Ambos deben mantenerse sincronizados; son el documento que conserva el comprador.

**Historial y auditoría.** Cada venta finalizada es navegable, hasta el nivel de las filas individuales de pesaje. Las ediciones de una fila se registran en `row_edit_history` con los valores anteriores y posteriores, por lo que un número corregido nunca es simplemente un número diferente sin rastro.

---

## Modelo monetario: léelo antes de modificar montos

**Nada en la aplicación registra un pago después de una venta.** No existe un libro mayor, ni historial de pagos, ni un paso de "marcar como pagado" en ninguna parte. `receivedAmount` se escribe una sola vez al guardar la venta y nunca se actualiza.

La consecuencia, que es fácil de malinterpretar:

- Una diferencia entre `finalAmount` y `receivedAmount` **nunca podrá pagarse**. Tratarla como un saldo pendiente la convertiría en una deuda permanente por construcción.
- Por lo tanto, esa diferencia es un **descuento**: dinero que el agricultor descontó. Se denomina así en todas las pantallas, incluidos ambos renderizadores de recibo.
- Dejar el campo de recibido en blanco registra el **importe total**. En blanco siempre significó "el comprador pagó todo".

La migración `0010_settled_at_sale_time.sql` completó los datos de las filas preexistentes que almacenaban `0` por un campo en blanco; sin ella, esas ventas aparecerían con un 100 % de descuento. `__tests__/storage.test.ts` verifica ese comportamiento en ambas direcciones.

Si alguna vez se añade un seguimiento real de pagos, esta es la decisión que debe revisarse primero.

---

## Stack tecnológico

| Área | Elección |
|---|---|
| Tiempo de ejecución | Expo SDK 54, React Native 0.81, React 19, Nueva Arquitectura |
| Enrutamiento | Expo Router (basado en archivos, rutas tipadas) |
| Almacenamiento | SQLite (`expo-sqlite`) mediante Drizzle ORM: local, offline-first |
| Autenticación | Clerk (`@clerk/expo`), tokens en `expo-secure-store` |
| Tipografías | Outfit para texto, IBM Plex Mono para cifras |
| Animación | Reanimated 4 |
| Pruebas | Jest, contra un SQLite en memoria real con migraciones reales |

**Supabase** (`lib/supabase.ts`, `hooks/useSupabase.ts`) está creado y configurado, pero **aún no es consumido por ninguna pantalla**. La aplicación es totalmente local hoy.

---

## Estructura del proyecto

```
app/                      Routes — file-based, every file here is a screen
  _layout.tsx             Providers, font loading, migrations gate, AuthGuard
  index.tsx               Home — readout band, revenue chart, insights, sale list
  measurement.tsx         The weighing session: setup, rows, cull phase, Sale Summary
  batches.tsx             Batch list — readout band, filter, batch cards
  batch/[id].tsx          One batch: rolled-up totals and its sessions
  sale/[id]/index.tsx     A finished sale in full
  sale/[id]/logs/[type].tsx   Raw weighing rows for main or cull
  row-history.tsx         Edit history for a single row
  drafts.tsx              Paused sessions
  sales.tsx               Full sale history
  onboarding.tsx          Role, details, plan
  profile.tsx settings.tsx
  (auth)/sign-in.tsx      Google sign-in via Clerk

components/               Shared UI — receipt, row editor, error boundaries
db/
  schema.ts               Drizzle tables: users, batches, sales, saleMetaData,
                          measurementRows, rowEditHistory, userPrefs
  client.ts               DB handle + useDbMigrations()
  migrations/             Generated SQL + journal — applied on app start
lib/
  storage.ts              Every read and write. Screens never touch the DB directly
  utils.ts                Pure domain logic: calcDeduction, formatters
  types.ts                SaleRecord, SaleMetaData, BatchSummary, MeasurementRow
  i18n.ts                 English + Bangla, one object each, typed against `en`
  useTheme.ts             Resolved theme colours
  SettingsContext.tsx     Language, theme preference, translations
  receiptHtml.ts          Printable receipt
constants/colors.ts       Light/dark palettes + the shared instrument `Band` tokens
__tests__/                Jest suites; helpers/db.ts applies the real migrations
```

---

## Lenguaje de diseño

La aplicación es una balanza, por lo que sus pantallas se leen como la esfera de un instrumento en lugar de un panel de marketing.

- **Las cifras nunca se abrevian.** Una balanza no redondea lo que pesa. `৳1,24,500`, no `৳1.2L`.
- **Las cifras son monoespaciadas, el texto no.** IBM Plex Mono mantiene los dígitos alineados en columnas mientras cambian los valores; Outfit lleva el texto. Esa combinación es la identidad.
- **La banda de lectura** — la sección oscura en Inicio y Lotes — conserva su propia superficie en los temas claro y oscuro; la esfera de un instrumento no cambia de color con la habitación. Sus tokens viven en `constants/colors.ts` como `Band`, compartidos para que las dos pantallas no se desvíen.
- **Un solo matiz para los datos.** El énfasis proviene de una etiqueta directa o de la opacidad, no de un segundo tono.
- **Las marcas se apoyan en la línea base.** Las barras solo están redondeadas en la parte superior y ancladas a la línea de referencia de la que dependen los datos.

Ambos idiomas deben verificarse cuando se cambie el texto: las cadenas en bengalí suelen ser más largas que sus equivalentes en inglés y romperán un diseño que nunca ha contemplado otro idioma.

---

## Flujo de trabajo de desarrollo

**Basado en ramas, siempre.** Sin commits directamente en `main`, sin importar su tamaño.

```
branch  →  change  →  verify  →  merge to main  →  delete branch
```

```bash
git checkout -b feat/thing     # feat/ fix/ refactor/ docs/ chore/
# ... make the change ...
npx tsc --noEmit && npx jest && npx expo lint
git checkout main
git merge --no-ff feat/thing
git branch -d feat/thing
```

Los commits siguen el estándar Conventional Commits (`feat(scope): …`). En el cuerpo es donde va el *porqué*: el historial de este repositorio explica la razón, no solo los diffs.

### Verificación

| Comprobación | Comando |
|---|---|
| Tipos | `npx tsc --noEmit` |
| Pruebas | `npm test` |
| Lint | `npm run lint` |
| En dispositivo | `npm run android` / `npm run ios` |

`components/DBErrorScreen.tsx` lleva un error de lint preexistente. Ese es el punto base: déjelo en uno, no añada un segundo.

**Los cambios de UI deben verse, no solo pasar el chequeo de tipos.** El diseño, el espaciado y el modo oscuro no se reflejan en una suite de pruebas exitosa.

### Ejecución

```bash
npm install
cp .env.local.example .env.local     # then fill in the keys below
npx expo start
```

Variables de entorno requeridas:

| Variable | Propósito |
|---|---|
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Autenticación Clerk: la aplicación no pasará la pantalla de inicio de sesión sin él |
| `EXPO_PUBLIC_SUPABASE_URL` | Configurado pero sin usar hoy |
| `EXPO_PUBLIC_SUPABASE_KEY` | Configurado pero sin usar hoy |

Las compilaciones nativas (`npm run android`) compilan el NDK en la primera ejecución: reserve varios GB de disco y espere una primera compilación larga.

> **La web no es un objetivo soportado.** `expo-sqlite` requiere `SharedArrayBuffer` y un worker que no se carga con los encabezados del servidor de desarrollo. Use un simulador, emulador o dispositivo físico.

### Cambios en la base de datos

El esquema es primero para Drizzle. Edite `db/schema.ts` y luego:

```bash
npx drizzle-kit generate
```

Registre el nuevo archivo en `db/migrations/migrations.js` **y** en `db/migrations/meta/_journal.json`: Expo necesita la importación estática y ambos deben estar en el repositorio. Las migraciones se ejecutan al iniciar la aplicación mediante `useDbMigrations()`; un error renderiza `DbErrorScreen` en lugar de la aplicación, porque todas las pantallas asumen una base de datos operativa.

Las pruebas aplican los archivos de migración reales en orden de registro (`__tests__/helpers/db.ts`), por lo que una migración rota falla la suite en lugar de aparecer en el teléfono de un usuario.

### El archivo de bloqueo es sensible a la versión de npm: regenérelo con npm 10

EAS Build ejecuta `npm ci`, que falla drásticamente si el lockfile no coincide con lo que su npm resolvería.

`@clerk/shared` declara una dependencia peer opcional en `react-dom` que el `react-dom@19.1.0` fijado por Expo no satisface. **npm 10 registra una copia anidada** de `react`/`react-dom`/`scheduler` bajo `@clerk/clerk-js`; **npm 11 los omite silenciosamente.** Un lockfile generado por npm 11, por lo tanto, compila bien localmente y falla en EAS con:

```
npm error `npm ci` can only install packages when your package.json and
npm error package-lock.json are in sync.
npm error Missing: react@19.2.8 from lock file
```

Por lo tanto, regenere el lockfile con npm 10, sin importar qué npm use a diario:

```bash
npx npm@10 install --package-lock-only
npx npm@10 ci --include=dev --dry-run   # this is what EAS runs — must pass
```

Ejecutar un `npm install` directo en npm 11 volverá a eliminar silenciosamente esas tres entradas. Si una compilación falla en *Install dependencies*, verifique esto primero.

### Añadir texto

Añada la clave a **ambos** `en` y `bn` en `lib/i18n.ts`. `bn` está tipado como `typeof en`, por lo que una traducción faltante generará un error de compilación en lugar de filtrar una cadena en inglés en una pantalla en bengalí. Compruebe si ya existe una clave adecuada antes de añadir una.

---

## Glosario de dominio

| Término | Significado |
|---|---|
| **Sesión** | Una ejecución de pesaje, desde la primera caja hasta la venta guardada |
| **Lote (Batch)** | Un grupo de aves vendido a lo largo de varias sesiones; un contenedor, no almacena totales propios |
| **Descarte (Cull)** | Aves de subestándar, pesadas y tarificadas por separado, a veces no vendidas |
| **Deducción por caja** | Peso fijo descontado por caja, por convención del sector |
| **Bruto / Neto** | Antes y después de la deducción por caja |
| **Descuento** | Importe final menos lo que entregó el comprador: *no* es una deuda |
| **Borrador** | Una sesión pausada e inacabada |
| **Agricultor / Mayorista** | Los dos roles; determina qué análisis muestra la pantalla de inicio |

---

## Licencia

Propietaria. © ZeroD Farms, bajo ZeroD Umbrella. Todos los derechos reservados.

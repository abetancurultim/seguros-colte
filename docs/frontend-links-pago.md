# Links de pago para asesores — Guía de integración frontend

Interfaz para que un asesor humano genere links de pago de **Seguro de Mascotas** y **Bienestar Plus**, cuando la IA no cerró la venta o el cliente dejó vencer el link.

- **Base URL:** `https://ultim.online`
- **Autenticación:** ninguna por ahora (ver [Notas importantes](#notas-importantes))
- **CORS:** abierto (`origin: *`), se puede llamar directo desde el navegador
- **Content-Type:** `application/json`

---

## Flujo de la interfaz

```
1. Asesor busca al cliente          → GET  /seguros-colte/clients?q=...
2. ¿Apareció?
   ├─ SÍ  → toma el `id` del cliente
   └─ NO  → muestra formulario manual (nombre, cédula, email, celular)
3. Asesor elige producto y cantidad → GET  /seguros-colte/products
4. Confirma el resumen y genera     → POST /seguros-colte/advisor/create-link
5. Muestra el link + botón copiar + enviar por WhatsApp
```

---

## 1. `GET /seguros-colte/products`

Pobla el selector de productos. Sin parámetros. Los montos viven en el backend: **la interfaz nunca envía precios**.

**Respuesta `200`**

```json
{
  "success": true,
  "products": [
    {
      "key": "mascotas",
      "label": "Seguro de Mascotas",
      "serviceType": "mascotas",
      "monthlyAmount": 27000,
      "defaultInstallments": 12,
      "perUnit": true,
      "unitLabel": "mascota",
      "maxUnits": 5
    },
    {
      "key": "bienestar",
      "label": "Seguro Bienestar Plus",
      "serviceType": "bienestar_plus",
      "monthlyAmount": 10000,
      "defaultInstallments": 12,
      "perUnit": false,
      "unitLabel": null,
      "maxUnits": null
    }
  ]
}
```

| Campo | Uso en la UI |
|---|---|
| `key` | Lo que se manda como `product` en el POST |
| `label` | Texto a mostrar |
| `monthlyAmount` | Para calcular y mostrar el resumen (el backend recalcula igual) |
| `perUnit` | Si es `true`, mostrar el selector de cantidad |
| `unitLabel` | Etiqueta del selector: "mascota" / "mascotas" |
| `maxUnits` | Máximo del selector |

---

## 2. `GET /seguros-colte/clients?q=<término>`

Busca en el listado de clientes. Mínimo **3 caracteres**.

- Si el término son **solo dígitos** → busca por cédula y por celular.
- Si tiene **letras** → busca por nombre parcial, sin distinguir mayúsculas.

**Respuesta `200` — cliente encontrado**

```json
{
  "success": true,
  "count": 1,
  "clients": [
    {
      "id": 45,
      "name": "María Fernanda González",
      "email": "maria.gonzalez@gmail.com",
      "document_id": "1020304050",
      "phone_number": "+573001234567",
      "service": "mascotas",
      "product": null,
      "pendingSubscriptions": [
        {
          "id": "8f3c1b2a-...",
          "serviceType": "mascotas",
          "amount": "27000.00",
          "description": "Seguro de Mascotas - 1 mascota - $27.000 COP mensual",
          "totalInstallments": 12,
          "paymentLink": "https://backend.paymentsway.co/Link/ZjY4NmUz...",
          "shortLink": "https://links.paymentsway.co/pRULzt",
          "expiresAt": "2026/07/20",
          "updatedAt": null,
          "createdAt": "2026-07-12T14:22:31.000Z"
        }
      ]
    }
  ],
  "unregisteredPendingSubscriptions": [],
  "allowManualEntry": false
}
```

**Respuesta `200` — no encontrado**

```json
{
  "success": true,
  "count": 0,
  "clients": [],
  "unregisteredPendingSubscriptions": [],
  "allowManualEntry": true
}
```

### Cómo interpretarla

- **`allowManualEntry: true`** → mostrar el formulario manual. Es la señal de que hay que usar el caso B del POST.
- **`pendingSubscriptions`** → links que el cliente **ya tiene sin pagar**. Es un array porque puede tener uno de Mascotas y otro de Bienestar Plus a la vez. Mostrar un aviso por cada uno:

  > *"Ya tiene un link de Seguro de Mascotas por $27.000 que vencía el 2026/07/20. Generar uno nuevo del mismo producto lo reemplazará."*

- **`unregisteredPendingSubscriptions`** → solo se llena cuando `count` es 0 y el término era una cédula. Significa que el cliente no está en el listado pero **ya se le generó un link antes** por esa cédula. Sirve para que el asesor no genere duplicados a ciegas.

**Respuesta `400`** — término muy corto

```json
{
  "error": "El término de búsqueda debe tener al menos 3 caracteres",
  "hint": "Busca por cédula, celular o nombre del cliente"
}
```

---

## 3. `GET /seguros-colte/advisor/subscriptions?identification=<cédula>`

Consulta los links pendientes de una cédula, sin depender del listado de clientes. Útil para refrescar el estado después de generar, o para consultar por cédula directamente.

**Respuesta `200`**

```json
{
  "success": true,
  "identification": "1020304050",
  "pendingSubscriptions": [ /* mismo formato que arriba */ ]
}
```

---

## 4. `POST /seguros-colte/advisor/create-link`

Genera el link. Hay **dos formas** de identificar al cliente; se envía una de las dos.

### Caso A — cliente del listado

```json
{
  "clientId": 45,
  "product": "mascotas",
  "units": 2,
  "totalInstallments": 12,
  "advisorEmail": "asesor@ultimmarketing.com"
}
```

La interfaz **no envía datos del cliente**: nombre, cédula, email y celular salen del backend.

### Caso B — cliente que no está en el listado

```json
{
  "client": {
    "name": "Andrés Felipe Ruiz",
    "identification": "1020304050",
    "email": "andres.ruiz@gmail.com",
    "phone": "3001234567"
  },
  "product": "bienestar",
  "advisorEmail": "asesor@ultimmarketing.com"
}
```

### Campos

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `clientId` | `number` | ⚠️ | `id` del buscador. Obligatorio si no se envía `client` |
| `client` | `object` | ⚠️ | Datos manuales. Obligatorio si no se envía `clientId` |
| `client.name` | `string` | ✅ | Nombre completo, mínimo 3 caracteres |
| `client.identification` | `string` | ✅ | Cédula, 6 a 12 dígitos (se limpian puntos y espacios) |
| `client.email` | `string` | ✅ | **Donde el cliente recibe el link.** Se valida el formato |
| `client.phone` | `string` | ✅ | 10 dígitos, se normaliza a `+57XXXXXXXXXX` |
| `product` | `string` | ✅ | `"mascotas"` o `"bienestar"` |
| `units` | `number` | ❌ | Cantidad de mascotas. Default `1`, máx `5`. Se ignora en Bienestar |
| `totalInstallments` | `number` | ❌ | Default `12` |
| `advisorEmail` | `string` | ✅ | Email del asesor, para trazabilidad |

**La interfaz nunca envía el monto.** Se calcula en el backend con `product` + `units`.

### Respuesta `200`

```json
{
  "success": true,
  "paymentLink": "https://backend.paymentsway.co/Link/MzVkMTM0...",
  "product": {
    "key": "mascotas",
    "label": "Seguro de Mascotas",
    "serviceType": "mascotas",
    "units": 2
  },
  "charge": {
    "monthlyAmount": 54000,
    "totalInstallments": 12,
    "totalAmount": 648000
  },
  "client": {
    "id": 45,
    "name": "María Fernanda González",
    "email": "maria.gonzalez@gmail.com",
    "document_id": "1020304050",
    "phone_number": "+573001234567",
    "source": "dentix_clients"
  },
  "reusedSubscription": true,
  "reusedSubscriptionId": "8f3c1b2a-...",
  "warning": null
}
```

| Campo | Qué hacer con él |
|---|---|
| `paymentLink` | Mostrarlo con botón de copiar y enviar por WhatsApp |
| `charge` | Confirmación del cobro: mensual, cuotas y total |
| `client.source` | `dentix_clients` o `manual` — de dónde salieron los datos |
| `reusedSubscription` | Si es `true`, mostrar *"Se reemplazó el link anterior"* |
| `warning` | Si no es `null`, mostrarlo como aviso (cliente fuera del listado) |

> El link **vence en 8 días**. Conviene decírselo al asesor en pantalla.

### Errores

**`400` — validación**

```json
{ "error": "El correo no tiene un formato válido. Verifícalo con el cliente: es donde recibe el link.", "field": "email" }
```

El campo `field` indica qué input resaltar: `name`, `identification`, `email`, `phone`, `units` o `client`.

Otras variantes de `400`:

```json
{ "error": "Faltan campos obligatorios", "required": ["product", "advisorEmail", "clientId o client"] }
{ "error": "Debes enviar clientId (cliente del listado) o client (datos manuales)", "hint": "..." }
{ "error": "Producto no válido: \"vida\"", "allowed": ["mascotas", "bienestar"] }
```

**`404` — el `clientId` no existe**

```json
{ "error": "No existe un cliente con id 999" }
```

**`422` — cliente del listado incompleto**

```json
{
  "error": "El cliente del listado tiene datos incompletos",
  "missing": ["email"],
  "hint": "Reenvía la solicitud con el objeto \"client\" completando estos campos",
  "client": {
    "id": 45,
    "name": "María Fernanda González",
    "email": null,
    "document_id": "1020304050",
    "phone_number": "+573001234567"
  }
}
```

**Este no es un muro.** El cliente existe pero le falta el email o la cédula. La UI debe:

1. Prellenar el formulario manual con lo que sí vino en `client`.
2. Pedirle al asesor solo los campos de `missing`.
3. Reenviar el POST con el objeto `client` completo.

**`500` — fallo de Payments Way o de la base**

```json
{ "error": "No se pudo generar el link de pago", "detail": "..." }
```

Mostrar `detail` al asesor: ahí viene el motivo real.

---

## Tipos TypeScript

```ts
const BASE = 'https://ultim.online';

export type ProductKey = 'mascotas' | 'bienestar';

export interface Product {
  key: ProductKey;
  label: string;
  serviceType: string;
  monthlyAmount: number;
  defaultInstallments: number;
  perUnit: boolean;
  unitLabel: string | null;
  maxUnits: number | null;
}

export interface PendingSubscription {
  id: string;
  serviceType: string;
  /** OJO: viene como string desde Postgres, ej. "27000.00" */
  amount: string;
  description: string | null;
  totalInstallments: number;
  paymentLink: string | null;
  shortLink: string | null;
  /** Formato YYYY/MM/DD */
  expiresAt: string | null;
  updatedAt: string | null;
  createdAt: string;
}

export interface Client {
  id?: number;
  name: string;
  email: string;
  document_id: string;
  phone_number: string;
  service?: string;
  product?: string;
  pendingSubscriptions: PendingSubscription[];
}

export interface ManualClient {
  name: string;
  identification: string;
  email: string;
  phone: string;
}

export interface CreateLinkResponse {
  success: true;
  paymentLink: string;
  product: { key: ProductKey; label: string; serviceType: string; units: number };
  charge: { monthlyAmount: number; totalInstallments: number; totalAmount: number };
  client: {
    id: number | null;
    name: string;
    email: string;
    document_id: string;
    phone_number: string;
    source: 'dentix_clients' | 'manual';
  };
  reusedSubscription: boolean;
  reusedSubscriptionId: string | null;
  warning: string | null;
}

/** Error 422: el cliente existe pero está incompleto */
export class IncompleteClientError extends Error {
  constructor(
    public missing: string[],
    public client: { id: number; name: string; email: string | null; document_id: string | null; phone_number: string | null }
  ) {
    super(`Al cliente le faltan datos: ${missing.join(', ')}`);
  }
}

/** Error 400 de validación, con el campo a resaltar */
export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
  }
}

async function handle(res: Response) {
  const data = await res.json();

  if (res.ok) return data;

  if (res.status === 422 && data.missing) {
    throw new IncompleteClientError(data.missing, data.client);
  }
  if (res.status === 400) {
    throw new ValidationError(data.error, data.field);
  }
  throw new Error(data.detail ?? data.error ?? 'Error inesperado');
}

export async function getProducts(): Promise<Product[]> {
  const res = await fetch(`${BASE}/seguros-colte/products`);
  return (await handle(res)).products;
}

export async function searchClients(q: string) {
  const res = await fetch(`${BASE}/seguros-colte/clients?q=${encodeURIComponent(q)}`);
  const data = await handle(res);
  return {
    clients: data.clients as Client[],
    unregisteredPendingSubscriptions: data.unregisteredPendingSubscriptions as PendingSubscription[],
    allowManualEntry: data.allowManualEntry as boolean,
  };
}

export async function getPendingByDocument(identification: string): Promise<PendingSubscription[]> {
  const res = await fetch(
    `${BASE}/seguros-colte/advisor/subscriptions?identification=${encodeURIComponent(identification)}`
  );
  return (await handle(res)).pendingSubscriptions;
}

type CreateLinkInput = {
  product: ProductKey;
  advisorEmail: string;
  units?: number;
  totalInstallments?: number;
} & ({ clientId: number } | { client: ManualClient });

export async function createPaymentLink(input: CreateLinkInput): Promise<CreateLinkResponse> {
  const res = await fetch(`${BASE}/seguros-colte/advisor/create-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handle(res);
}
```

---

## Formulario sugerido

1. **Buscar cliente** — un input que dispare `searchClients` (con debounce, mínimo 3 caracteres).
2. **Resultados** — lista con nombre, cédula, email y celular. Si `allowManualEntry` es `true`, botón *"El cliente no está en la lista"* que abre el formulario manual.
3. **Avisos de links pendientes** — por cada `pendingSubscriptions`, mostrar producto, monto, fecha de vencimiento y el link anterior.
4. **Producto** — selector desde `getProducts()`. Si `perUnit`, mostrar cantidad (1 a `maxUnits`).
5. **Resumen antes de generar**:
   - Valor mensual: `monthlyAmount × units`
   - Cuotas y total
   - *"El link vence en 8 días"*
   - Si ya tiene un link pendiente del mismo producto: *"Se reemplazará el link anterior"*
6. **Botón generar** — **deshabilitarlo mientras carga** (ver Notas importantes).
7. **Resultado** — el link con botón de copiar y un enlace `wa.me` prearmado:

```ts
const mensaje = `Hola ${nombre}, aquí está tu link de pago para el ${producto}: ${paymentLink}`;
const waUrl = `https://wa.me/${telefono.replace('+', '')}?text=${encodeURIComponent(mensaje)}`;
```

---

## Notas importantes

**`amount` viene como string.** En `pendingSubscriptions`, `amount` es `"27000.00"` — Postgres devuelve los `numeric` como string. Usar `Number(amount)` antes de operar. En cambio `charge.monthlyAmount` sí es un número real.

**No hay idempotencia.** Un doble click genera dos links. El segundo reemplaza al primero en la base, así que no corrompe datos, pero deja un link inútil circulando. **Deshabilitar el botón mientras la petición está en vuelo.**

**Cada generación envía un correo** a `legal@ultimmarketing.com` con copia a `daniela@ultimmarketing.com`. Si se hacen pruebas contra producción, van a llegar correos reales.

**Un link generado sigue vivo hasta vencerse.** Si el asesor genera uno nuevo antes de que el anterior venza, el cliente podría pagar el viejo. La base guarda el historial, pero conviene que la UI advierta al asesor cuando el link anterior **aún no ha vencido** (comparar `expiresAt` con hoy).

**No hay autenticación.** `GET /clients` devuelve nombre, cédula, email y celular sin credenciales. La interfaz debería quedar detrás del login del dashboard, y vale la pena agregar un header `Authorization` en el backend antes de exponerla a más gente.

**Sólo cédula.** El tipo de documento está fijo en Cédula de Ciudadanía. No se pueden generar links con CE, pasaporte o NIT sin un cambio en el backend.

**El cliente manual no se registra en el listado.** Si el cliente no está en `dentix_clients`, la suscripción queda referenciada por cédula pero el cliente **no se agrega** a esa tabla. Consecuencia: los agentes de WhatsApp no lo reconocerán en conversaciones futuras.

---

## Pruebas rápidas

```bash
curl https://ultim.online/seguros-colte/products

curl "https://ultim.online/seguros-colte/clients?q=1020304050"

curl -X POST https://ultim.online/seguros-colte/advisor/create-link \
  -H "Content-Type: application/json" \
  -d '{"clientId":45,"product":"mascotas","units":1,"advisorEmail":"tu@ultimmarketing.com"}'
```

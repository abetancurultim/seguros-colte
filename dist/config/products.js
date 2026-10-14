/**
 * Catálogo de productos que el asesor humano puede cobrar.
 *
 * Los montos viven acá y NO se reciben por request, para que el asesor no pueda
 * equivocarse ni enviar un valor arbitrario desde la interfaz.
 *
 * Mantener sincronizado con los prompts de los agentes:
 * - Mascotas       -> src/agents/mascotasAdvisor.ts
 * - Bienestar Plus -> src/agents/bienestarPlusAdvisor.ts
 */
export const PRODUCTS = {
    mascotas: {
        label: 'Seguro de Mascotas',
        serviceType: 'mascotas',
        monthlyAmount: 27000,
        defaultInstallments: 12,
        perUnit: true,
        unitLabel: 'mascota',
        maxUnits: 5
    },
    bienestar: {
        label: 'Bienestar Plus Protegido',
        serviceType: 'bienestar_plus',
        monthlyAmount: 15589,
        defaultInstallments: 12,
        perUnit: false
    }
};
/** Alias aceptados en el request, para tolerar variantes de la interfaz */
const PRODUCT_ALIASES = {
    mascotas: 'mascotas',
    mascota: 'mascotas',
    bienestar: 'bienestar',
    'bienestar plus': 'bienestar',
    'bienestar plus protegido': 'bienestar',
    bienestarplus: 'bienestar',
    'bienestar-plus': 'bienestar',
    bienestar_plus: 'bienestar'
};
export const resolveProductKey = (input) => {
    if (!input)
        return null;
    return PRODUCT_ALIASES[input.trim().toLowerCase()] ?? null;
};
export const getProductKeys = () => Object.keys(PRODUCTS);
/** service_types que administra el flujo del asesor */
export const getServiceTypes = () => getProductKeys().map(key => PRODUCTS[key].serviceType);
/**
 * Calcula el monto mensual y la descripción del link.
 * `units` solo aplica a productos con `perUnit: true` (cantidad de mascotas).
 */
export const buildProductCharge = (productKey, units = 1) => {
    const product = PRODUCTS[productKey];
    if (!product.perUnit) {
        return {
            amount: product.monthlyAmount,
            description: `${product.label} - $${product.monthlyAmount.toLocaleString('es-CO')} COP mensual`,
            units: 1
        };
    }
    const safeUnits = Math.floor(Number(units));
    if (!Number.isFinite(safeUnits) || safeUnits < 1) {
        throw new Error(`La cantidad de ${product.unitLabel}s debe ser un número entero mayor o igual a 1`);
    }
    if (product.maxUnits && safeUnits > product.maxUnits) {
        throw new Error(`La cantidad máxima de ${product.unitLabel}s por link es ${product.maxUnits}. Genera links separados si se requieren más.`);
    }
    const amount = product.monthlyAmount * safeUnits;
    const unitText = safeUnits === 1 ? product.unitLabel : `${product.unitLabel}s`;
    return {
        amount,
        description: `${product.label} - ${safeUnits} ${unitText} - $${amount.toLocaleString('es-CO')} COP mensual`,
        units: safeUnits
    };
};

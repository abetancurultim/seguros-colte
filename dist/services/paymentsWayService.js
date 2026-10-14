import axios from 'axios';
import { supabase } from '../config/supabase.js';
import { notifySupervisorPaymentLink } from '../functions/sharedFunctions.js';
import { PRODUCTS, resolveProductKey } from '../config/products.js';
const PAYMENTS_WAY_CONFIG = {
    API_URL: process.env.PAYMENTS_WAY_API_URL || 'https://serviceregister.paymentsway.co/ClientAPI',
    TOKEN: process.env.PAYMENTS_WAY_TOKEN || '',
    TERMINAL_ID: 5248,
    FORM_ID: 6403,
    CURRENCY: 'COP',
    DEFAULT_SERVICE: 1, // CARD, PSE, CASH
    ID_TYPE_CC: "4" // Cédula de Ciudadanía
};
const apiClient = axios.create({
    baseURL: PAYMENTS_WAY_CONFIG.API_URL,
    headers: {
        'Content-Type': 'application/json',
        'Authorization': PAYMENTS_WAY_CONFIG.TOKEN
    }
});
/**
 * Crea una persona en Payments Way
 */
export const createPerson = async (data) => {
    try {
        const response = await apiClient.post('/CrearPersona', data);
        return response.data;
    }
    catch (error) {
        console.error('Error creating person in Payments Way:');
        throw error;
    }
};
/**
 * Crea un link de pago en Payments Way
 */
export const createPaymentLink = async (data) => {
    try {
        const response = await apiClient.post('/CrearLinkDePago', data);
        return response.data;
    }
    catch (error) {
        console.error('Error creating payment link in Payments Way:');
        throw error;
    }
};
/**
 * Lee la columna link_data. Es jsonb, así que supabase-js devuelve un objeto; el caso
 * string se tolera por si alguna fila quedó guardada como texto.
 */
export const leerLinkData = (raw) => {
    if (!raw)
        return null;
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    return raw;
};
/**
 * Busca la suscripción pendiente del primer pago de una cédula para un producto.
 * Se usa para reutilizar la fila cuando el asesor regenera un link vencido.
 */
export const buscarSuscripcionPendiente = async (identificationDoc, serviceType) => {
    const { data, error } = await supabase
        .from('suscripciones')
        .select('id, client_id, payment_person_id, identification_doc, amount, description, total_installments, service_type, link_data, created_at')
        .eq('identification_doc', identificationDoc)
        .eq('service_type', serviceType)
        .eq('status', 'pending_first_payment')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) {
        console.error('Error consultando suscripción pendiente:', error.message);
        return null; // Ante la duda se crea una nueva: nunca bloquear la generación del link
    }
    return data;
};
/**
 * Lista las suscripciones pendientes de una cédula, para mostrárselas al asesor
 * antes de que genere un link nuevo.
 */
export const listarSuscripcionesPendientes = async (identificationDoc, serviceTypes) => {
    const { data, error } = await supabase
        .from('suscripciones')
        .select('id, client_id, payment_person_id, identification_doc, amount, description, total_installments, service_type, link_data, created_at')
        .eq('identification_doc', identificationDoc)
        .in('service_type', serviceTypes)
        .eq('status', 'pending_first_payment')
        .order('created_at', { ascending: false });
    if (error) {
        console.error('Error listando suscripciones pendientes:', error.message);
        return [];
    }
    return data || [];
};
/**
 * Flujo completo: Crea persona y luego genera el link de pago
 */
export const generatePaymentLinkFlow = async (data) => {
    try {
        // También corrige llamadas antiguas de la IA/API que omiten serviceType.
        const productName = data.description.split(' - ')[0].trim().replace(/^seguro\s+/i, '');
        if (data.serviceType === 'bienestar' || data.serviceType === PRODUCTS.bienestar.serviceType
            || resolveProductKey(productName) === 'bienestar') {
            data = {
                ...data,
                amount: PRODUCTS.bienestar.monthlyAmount,
                description: PRODUCTS.bienestar.label,
                serviceType: PRODUCTS.bienestar.serviceType
            };
        }
        // 1. Crear Persona
        const personData = {
            firstname: data.firstname,
            lastname: data.lastname,
            ididentificationtype: PAYMENTS_WAY_CONFIG.ID_TYPE_CC,
            identification: data.identification,
            email: data.email,
            phone: data.phone
        };
        const personResponse = await createPerson(personData);
        if (!personResponse || !personResponse.id) {
            throw new Error('Failed to create person: No ID returned');
        }
        // Calcular fecha de vencimiento (8 días posteriores) tomando en cuenta la zona horaria de Bogotá
        // 1. Obtenemos la fecha actual
        const now = new Date();
        // 2. Sumamos 8 días
        now.setDate(now.getDate() + 8);
        // 3. Formateamos la fecha futura especificamente para la zona horaria de Bogotá en formato YYYY/MM/DD
        // Usamos 'swe' (Sweden) porque su formato estándar es YYYY-MM-DD o similar ISO, lo cual facilita, 
        // pero para estar 100% seguros y manuales, usamos Intl.
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Bogota',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        // El formato de en-CA es YYYY-MM-DD. Reemplazamos guiones por barras segun requerimiento.
        const fechaVencimiento = formatter.format(now).replace(/-/g, '/');
        // 2. Crear Link de Pago
        const linkData = {
            amount: data.amount,
            descripcion: data.description,
            currency: PAYMENTS_WAY_CONFIG.CURRENCY,
            terminal_id: PAYMENTS_WAY_CONFIG.TERMINAL_ID,
            id_form: PAYMENTS_WAY_CONFIG.FORM_ID,
            fecha_vencimiento: fechaVencimiento,
            status: true,
            services: [PAYMENTS_WAY_CONFIG.DEFAULT_SERVICE],
            idperson: Number(personResponse.id)
        };
        const linkResponse = await createPaymentLink(linkData);
        // 3. Registrar en la tabla suscripciones
        //
        //    link_data y service_type ya existen en la tabla y los usan exequias y
        //    hdi_seguro; hasta ahora este flujo las dejaba en null, así que el link
        //    generado no quedaba asociado a la suscripción.
        const nuevoLinkData = {
            link_generado: linkResponse.linkgenerado,
            link_corto: linkResponse.linkcorto || null,
            fecha_vencimiento: fechaVencimiento
        };
        // Pre-consulta: ¿ya existe una suscripción pendiente de este producto para esta
        // cédula? Si el asesor está regenerando un link vencido, se actualiza esa fila en
        // lugar de crear otra, y así el pago siempre apunta a una sola suscripción.
        //
        // Solo aplica cuando se envía serviceType (flujo del asesor). Sin él el
        // comportamiento es el original: insertar y listo.
        const suscripcionExistente = data.serviceType
            ? await buscarSuscripcionPendiente(data.identification, data.serviceType)
            : null;
        if (suscripcionExistente) {
            // El link nuevo tiene su propia persona en Payments Way, así que hay que
            // actualizar payment_person_id junto con el link: si no, la fila seguiría
            // apuntando a la persona vieja y el pago del link nuevo no haría match.
            const linkDataPrevio = leerLinkData(suscripcionExistente.link_data);
            const historial = [
                ...(linkDataPrevio?.links_anteriores || []),
                ...(linkDataPrevio?.link_generado
                    ? [{
                            link_generado: linkDataPrevio.link_generado,
                            payment_person_id: suscripcionExistente.payment_person_id,
                            reemplazado_en: new Date().toISOString()
                        }]
                    : [])
            ];
            const { error: updateError } = await supabase
                .from('suscripciones')
                .update({
                payment_person_id: String(personResponse.id),
                amount: data.amount,
                description: data.description,
                total_installments: data.totalInstallments || 12,
                client_id: data.clientId,
                link_data: {
                    ...nuevoLinkData,
                    actualizado_en: new Date().toISOString(),
                    links_anteriores: historial
                },
                updated_at: new Date().toISOString()
            })
                .eq('id', suscripcionExistente.id);
            if (updateError) {
                console.error(`Error actualizando la suscripción ${suscripcionExistente.id}:`, updateError.message);
            }
            else {
                console.log(`🔁 Suscripción ${suscripcionExistente.id} actualizada con el link nuevo (persona ${personResponse.id})`);
            }
        }
        else {
            const { error: subscriptionError } = await supabase
                .from('suscripciones')
                .insert({
                client_id: data.clientId,
                payment_person_id: String(personResponse.id),
                identification_doc: data.identification,
                amount: data.amount,
                description: data.description,
                total_installments: data.totalInstallments || 12,
                status: 'pending_first_payment',
                service_type: data.serviceType || null,
                link_data: nuevoLinkData
            });
            if (subscriptionError) {
                console.error('Error creating subscription record:', subscriptionError.message);
                // No lanzamos error para no bloquear el retorno del link, pero lo logueamos
            }
        }
        // Notificar al supervisor sobre el nuevo enlace de pago
        await notifySupervisorPaymentLink(data, linkResponse.linkgenerado);
        return linkResponse.linkgenerado; // O linkcorto si prefieres
    }
    catch (error) {
        console.error('Error in payment link generation flow:');
        throw error;
    }
};

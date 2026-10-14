import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { sendPaymentLinkEmail} from "../functions/sharedFunctions.js";
import { generatePaymentLinkFlow } from "../services/paymentsWayService.js";
import { PaymentFlowRequest } from "../types/paymentsWay.js";
import { PRODUCTS, resolveProductKey } from "../config/products.js";

/**
 * Herramienta para enviar enlaces de pago por correo electrónico
 * Usa automáticamente los datos del cliente identificado si están disponibles
 */
export const sendPaymentLinkEmailTool = tool(
  async ({ clientName, clientEmail, insuranceName, clientNumber, id, document_id, amount }: { clientName: string; clientEmail: string; insuranceName: string; clientNumber: string; id: number; document_id: string; amount: number }) => {
    const bienestar = resolveProductKey(insuranceName.trim().replace(/^seguro\s+/i, '')) === 'bienestar'
      ? PRODUCTS.bienestar
      : null;
    const productName = bienestar?.label ?? insuranceName;
    const monthlyAmount = bienestar?.monthlyAmount ?? amount;

    console.log(`📧 ENVIANDO EMAIL DE PAGO:`);
    console.log(`   Cliente: ${clientName}`);
    console.log(`   Email: ${clientEmail}`);
    console.log(`   Seguro: ${productName}`);
    console.log(`   Teléfono: ${clientNumber}`);
    console.log(`   ID: ${id}`);
    console.log(`   Documento de identificación: ${document_id}`);
    console.log(`   Monto mensual: $${monthlyAmount} COP`);
    
    // const result = await sendPaymentLinkEmail(clientName, clientEmail, insuranceName, clientNumber);
    
    // Usando generatePaymentLinkFlow en lugar de sendPaymentLinkEmail - PRUEBA
    const paymentData: PaymentFlowRequest = {
      firstname: clientName.split(' ')[0] || clientName,
      lastname: clientName.split(' ').slice(1).join(' ') || '',
      identification: document_id,
      email: clientEmail,
      phone: clientNumber.replace('+57', '').replace('+', ''),
      amount: monthlyAmount,
      description: bienestar?.label ?? `Seguro ${insuranceName}`,
      clientId: id,
      totalInstallments: 12,
      serviceType: bienestar?.serviceType
    };
    console.log('💳 Generando enlace de pago con los siguientes datos:', paymentData);
    
    const paymentLink = await generatePaymentLinkFlow(paymentData);
    const result = `✅ Enlace de pago generado y enviado exitosamente a ${clientEmail}. El cliente ${clientName} recibirá instrucciones para completar la compra de ${productName}. Link: ${paymentLink}`;
    
    return result;
  },
  {
    name: "sendPaymentLinkEmail",
    description: "Envía un correo electrónico al cliente con un enlace de pago para finalizar la compra de un seguro. USAR DATOS DEL CLIENTE IDENTIFICADO cuando estén disponibles en el sistema.",
    schema: z.object({
      clientName: z.string().describe("El nombre completo del cliente (usar datos del cliente identificado si están disponibles)"),
      clientEmail: z.string().describe("El correo electrónico del cliente (usar datos del cliente identificado si están disponibles)"),
      insuranceName: z.string().describe("El nombre del seguro que el cliente está adquiriendo (ej: 'Bienestar Plus Protegido')"),
      clientNumber: z.string().describe("El número de teléfono del cliente (formato internacional, ej: +573001234567). Necesario para registrar el envío en el historial."),
      id: z.number().describe("id que identifica la fila en la cual se encuntra el cliente en la tabla dentix_clients."),
      document_id: z.string().describe("El documento de identificación del cliente. cedula din numero de identificacion ciudadana"),
      amount: z.number().describe("El monto mensual del seguro en pesos colombianos (15589 para Bienestar Plus Protegido, $15.589 COP)"),
    }),
  }
);


/**
 * Herramienta para registrar cliente usando información ya identificada
 */
export const quickRegisterClientTool = tool(
  async ({ insuranceName }: { insuranceName: string }) => {
    return `✅ Cliente registrado para ${insuranceName}. Los datos del cliente ya están disponibles en el sistema. Procede a enviar el enlace de pago usando sendPaymentLinkEmailTool con los datos del cliente identificado.`;
  },
  {
    name: "quickRegisterClient", 
    description: "Registra rápidamente un cliente ya identificado en el sistema para un seguro específico. Usar cuando el cliente ya está identificado y solo necesita confirmación de registro.",
    schema: z.object({
      insuranceName: z.string().describe("El nombre del seguro para el que se registra el cliente (ej: 'Bienestar Plus')"),
    }),
  }
);

/**
 * Herramienta para enviar enlace de pago a cliente ya identificado
 * Esta herramienta funciona solo cuando hay un cliente identificado en el contexto
 */

export const sendPaymentToIdentifiedClientTool = tool(
  async ({ insuranceName }: { insuranceName: string }) => {
    // Esta herramienta será interceptada por el agente para usar los datos del cliente identificado
    return `🚀 INSTRUCCIÓN: Usar sendPaymentLinkEmailTool con los datos del cliente identificado:
- clientName: [Usar nombre del cliente identificado]
- clientEmail: [Usar email del cliente identificado] 
- insuranceName: ${insuranceName}
- clientNumber: [Usar teléfono del cliente identificado]

IMPORTANTE: Los datos del cliente deben estar disponibles del sistema de identificación.`;
  },
  {
    name: "sendPaymentToIdentifiedClient",
    description: "Envía enlace de pago al cliente ya identificado en el sistema. Solo usar cuando el cliente ha sido identificado previamente. Esta herramienta usa automáticamente los datos del cliente (nombre y email) que fueron identificados al inicio de la conversación.",
    schema: z.object({
      insuranceName: z.string().describe("El nombre del seguro para el envío del enlace de pago (ej: 'Bienestar Plus')"),
    }),
  }
);

/**
 * Array con todas las herramientas compartidas
 */
export const sharedTools = [
  sendPaymentLinkEmailTool,
  quickRegisterClientTool,
  sendPaymentToIdentifiedClientTool,
];

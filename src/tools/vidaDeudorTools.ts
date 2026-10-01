import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { supabase } from "../config/supabase.js";
import { searchVidaDeudorDocuments } from "../functions/vidaDeudorFunctions.js";
import { smartSearchVidaDeudor } from "../functions/vidaDeudorRetrievers.js";
import sgMail from "@sendgrid/mail";


/**
 * Muestra los datos del cliente para confirmación.
 */
export const showVidaDeudorClientDataTool = tool(
  async ({ phoneNumber }: { phoneNumber: string }) => {
    console.log(`🔍 Buscando datos para confirmación: ${phoneNumber}`);
   
    // Asegurar formato +57
    const formattedNumber = phoneNumber.startsWith('+57') ? phoneNumber : `+57${phoneNumber.replace(/^\+/, '')}`;
   
    const { data: client, error } = await supabase
      .from('dentix_clients')
      .select('name, email, document_id, phone_number')
      .eq('phone_number', formattedNumber)
      .single();
     
    if (error || !client) {
      return "No se encontraron datos para este número. Por favor solicita los datos manualmente.";
    }


    return `DATOS ENCONTRADOS PARA CONFIRMACIÓN:
- Cédula: ${client.document_id}
- Nombre: ${client.name}
- Celular: ${client.phone_number}
- Correo: ${client.email}


Por favor confirma con el cliente si estos datos son correctos.`;
  },
  {
    name: "showVidaDeudorClientDataTool",
    description: "Muestra los datos del cliente (cédula, nombre, celular, correo) para confirmación antes de la activación.",
    schema: z.object({
      phoneNumber: z.string().describe("Número de teléfono del cliente para buscar sus datos")
    })
  }
);


/**
 * Actualiza los datos del cliente si es necesario.
 */
export const updateVidaDeudorClientDataTool = tool(
  async ({ phoneNumber, updates }: { phoneNumber: string, updates: { email?: string, name?: string, document_id?: string } }) => {
    console.log(`📝 Actualizando datos para: ${phoneNumber}`, updates);
   
    const formattedNumber = phoneNumber.startsWith('+57') ? phoneNumber : `+57${phoneNumber.replace(/^\+/, '')}`;
   
    const { error } = await supabase
      .from('dentix_clients')
      .update(updates)
      .eq('phone_number', formattedNumber);
     
    if (error) {
      return `Error actualizando datos: ${error.message}`;
    }


    return "Datos actualizados correctamente. Puedes proceder con la activación.";
  },
  {
    name: "updateVidaDeudorClientDataTool",
    description: "Actualiza los datos del cliente (email, nombre, documento) si el cliente indica que son incorrectos.",
    schema: z.object({
      phoneNumber: z.string().describe("Número de teléfono del cliente"),
      updates: z.object({
        email: z.string().optional(),
        name: z.string().optional(),
        document_id: z.string().optional()
      }).describe("Objeto con los campos a actualizar")
    })
  }
);


/**
 * Envía el correo de activación.
 * Nota: Esta es una simulación ya que no tengo acceso al servicio de correo real en este contexto,
 * pero simularé la acción exitosa.
 */
export const sendVidaDeudorActivationEmail = tool(
  async ({ clientName, clientEmail, clientPhone, clientDocument }: { clientName: string, clientEmail: string, clientPhone: string, clientDocument: string }) => {
    console.log(`🚀 [VIDA DEUDOR EMAIL] Iniciando envío para ${clientName} (${clientEmail})`);
    console.log(`📋 Datos recibidos: nombre=${clientName}, email=${clientEmail}, phone=${clientPhone}, doc=${clientDocument}`);


    if (!process.env.SENDGRID_API_KEY) {
        const errorMsg = 'SendGrid API Key no configurado';
        console.error(`❌ ${errorMsg}`);
        return JSON.stringify({
            success: false,
            message: errorMsg
        });
    }

    // Guardar en base de datos el registro de activación
    try {
        console.log('💾 Guardando registro de activación en DB...');
        const { error: dbError } = await supabase
            .from('interesados_vida_deudor')
            .insert({
                name: clientName,
                phone_number: clientPhone,
                email: clientEmail,
                document_id: clientDocument
            });

        if (dbError) {
            console.error('❌ Error al guardar en base de datos:', dbError.message);
        } else {
            console.log('✅ Registro de activación guardado correctamente en DB');
        }
    } catch (dbErr) {
        console.error('❌ Error inesperado al guardar en DB:', dbErr);
    }

    sgMail.setApiKey(process.env.SENDGRID_API_KEY);


    // 📧 USAR MÉTODO OFICIAL SENDGRID: ARRAY DE EMAILS
    const multipleMessages = [
        {
            to: clientEmail,
            from: {
                email: "notificaciones@asistenciacoltefinanciera.com",
                name: "Coltefinanciera Seguros"
            },
            replyTo: "atencion@asistenciacoltefinanciera.com",
            subject: "✅ Tu Asistencia Vida Deudor ha sido activada",
            text: `Hola ${clientName},


¡Excelentes noticias! Tu asistencia Vida Deudor ha sido activada exitosamente.


Como cliente especial de Coltefinanciera, disfrutarás de 3 meses completamente gratis de cobertura.


Tu asistencia incluye:
• Teleconsulta medicina general (2 eventos por año)
• Telepsicología (2 eventos por año)
• Telenutrición y asesoría nutricional (2 eventos por año)
• Descuentos ilimitados en farmacias


Tu cobertura está activa desde este momento y no requiere ningún pago adicional durante los primeros 3 meses.


Gracias por confiar en Coltefinanciera en alianza con Link Agencia de Seguros.


Saludos,
Lucia
Asesora de Seguros
Coltefinanciera en alianza con Link Agencia de Seguros`,
            html: `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Activación Vida Deudor</title>
</head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px;">
        <h2 style="color: #2c3e50;">¡Tu Asistencia Vida Deudor está Activada!</h2>


        <p>Hola <strong>${clientName}</strong>,</p>


        <p>¡Excelentes noticias! Tu asistencia Vida Deudor ha sido activada exitosamente.</p>


        <p>Como cliente especial de Coltefinanciera, disfrutarás de <strong>3 meses completamente gratis</strong> de cobertura.</p>


        <h3 style="color: #27ae60;">Tu asistencia incluye:</h3>        <ul>
            <li>Teleconsulta medicina general (2 eventos por año)</li>
            <li>Telepsicología (2 eventos por año)</li>
            <li>Telenutrición y asesoría nutricional (2 eventos por año)</li>
            <li>Descuentos ilimitados en farmacias</li>
        </ul>


        <p style="background-color: #e8f5e8; padding: 15px; border-radius: 5px;">
            <strong>Tu cobertura está activa desde este momento</strong> y no requiere ningún pago adicional durante los primeros 3 meses.
        </p>


        <p>Gracias por confiar en Coltefinanciera en alianza con Link Agencia de Seguros.</p>


        <p>Saludos,<br>
        <strong>Lucia</strong><br>
        Asesora de Seguros<br>
        Coltefinanciera en alianza con Link Agencia de Seguros</p>


        <hr style="margin: 20px 0;">
        <p style="font-size: 12px; color: #666;">
            Este correo fue enviado desde nuestro sistema automatizado de activación de seguros.
        </p>
    </div>
</body>
</html>`,
            categories: ["vida-deudor", "activacion", "cliente"],
            customArgs: {
                "client_email": clientEmail,
                "client_name": clientName,
                "service": "vida_deudor",
                "type": "activation"
            }
        },
        {
            to: "legal@ultimmarketing.com",
            cc: ["daniela@ultimmarketing.com"],
            from: {
                email: "notificaciones@asistenciacoltefinanciera.com",
                name: "Sistema Coltefinanciera"
            },
            subject: "🔔 Nueva activación de Vida Deudor - " + clientName,
            text: `Estimado Daniel,


Te informamos que un nuevo cliente ha activado el servicio de Vida Deudor.


DATOS DEL CLIENTE:
📋 Nombre: ${clientName}
📧 Correo: ${clientEmail}
📱 Teléfono: ${clientPhone || 'No proporcionado'}
🆔 Documento: ${clientDocument || 'No proporcionado'}
📅 Fecha de activación: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}


El cliente ha recibido su correo de confirmación y ya tiene acceso a los beneficios de la asistencia Vida Deudor por 3 meses gratis.


Saludos,
Sistema Coltefinanciera`,
            html: `<h3>Nueva activación de Vida Deudor</h3>
<p>Estimado Daniel,</p>
<p>Te informamos que un nuevo cliente ha activado el servicio de Vida Deudor.</p>
<h4>DATOS DEL CLIENTE:</h4>
<ul>
<li><strong>Nombre:</strong> ${clientName}</li>
<li><strong>Correo:</strong> ${clientEmail}</li>
<li><strong>Teléfono:</strong> ${clientPhone || 'No proporcionado'}</li>
<li><strong>Documento:</strong> ${clientDocument || 'No proporcionado'}</li>
<li><strong>Fecha:</strong> ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</li>
</ul>
<p>El cliente ha recibido su correo de confirmación y ya tiene acceso a los beneficios de la asistencia Vida Deudor por 3 meses gratis.</p>
<p>Saludos,<br>Sistema Coltefinanciera</p>`,
            categories: ["vida-deudor", "activacion", "admin"]
        }
    ];


    try {
        console.log('📧 USANDO MÉTODO OFICIAL SENDGRID: Array de emails');
        console.log(`   📧 Email 1: Cliente (${clientEmail})`);
        console.log(`   📧 Email 2: Admin (legal@ultimmarketing.com)`);


        const results = await sgMail.send(multipleMessages);


        console.log(`✅ ENVÍO COMPLETADO: ${results.length} emails procesados`);


        let clientSent = false;
        let adminSent = false;
        let clientMessageId = null;
        let adminMessageId = null;
          results.forEach((result: any, index) => {
            const email = multipleMessages[index].to;
            const status = result.statusCode || 'unknown';
            const messageId = result.headers?.['x-message-id'] || null;


            console.log(`   ✅ Email ${index + 1} (${email}): Status ${status}, MessageID: ${messageId}`);


            if (email === clientEmail) {
                clientSent = true;
                clientMessageId = messageId;
            } else if (email === "legal@ultimmarketing.com" || email === "daniela@ultimmarketing.com") {
                adminSent = true;
                adminMessageId = messageId;
            }
        });


        const success = clientSent && adminSent;


        console.log(`📊 RESULTADO FINAL:`);
        console.log(`   Cliente (${clientEmail}): ${clientSent ? '✅ ENVIADO' : '❌ ERROR'}`);
        console.log(`   Admin: ${adminSent ? '✅ ENVIADO' : '❌ ERROR'}`);
        console.log(`   Éxito general: ${success ? '✅ SÍ' : '❌ NO'}`);


        return JSON.stringify({
            success: success,
            message: success
                ? `✅ CORREOS ENVIADOS EXITOSAMENTE a ${clientEmail} y al administrador`
                : `❌ Error en el envío de emails`,
            details: {
                clientSent,
                adminSent,
                clientEmail,
                clientMessageId,
                adminMessageId,
                totalEmailsSent: results.length,
                method: "sendgrid_array_official",
                timestamp: new Date().toISOString()
            }
        });


    } catch (error: any) {
        console.error('❌ ERROR EN ENVÍO DE EMAILS:', error.message);


        if (error.response && error.response.body) {
            console.error('📋 Detalles del error:', JSON.stringify(error.response.body, null, 2));
        }


        return JSON.stringify({
            success: false,
            message: `Error al enviar correos: ${error.message}`,
            details: {
                errorType: error.code || 'unknown',
                errorMessage: error.message,
                clientEmail,
                method: "sendgrid_array_official"
            }
        });
    }
  },
  {
    name: "sendVidaDeudorActivationEmail",
    description: "Envía el correo de activación del seguro Vida Deudor y confirma la activación en el sistema.",
    schema: z.object({
      clientName: z.string(),
      clientEmail: z.string(),
      clientPhone: z.string(),
      clientDocument: z.string()
    })
  }
);


/**
 * Herramienta para consultar información oficial de Bienestar Plus
 * Esta herramienta busca en la base de datos de documentos oficiales
 * para responder preguntas sobre coberturas, precios, servicios y beneficios
 */
export const consultVidaDeudorSpecialistTool = tool(
  async ({ consulta }: { consulta: string }) => {
    try {
      console.log(
        `Consultando documentos de Vida Deudor para: "${consulta}"`
      );


      const resultado = await searchVidaDeudorDocuments(consulta);


      if (!resultado || resultado.trim() === "") {
        return "No se encontró información específica sobre tu consulta en la base de datos oficial de Bienestar Plus.";
      }


      return resultado;
    } catch (error: any) {
      console.error("Error consultando documentos de Vida Deudor:", error);


      // Información de respaldo básica para Vida Deudor
      return `No se encontró información específica sobre tu consulta en la base de datos oficial de Vida Deudor.`;
    }
  },
  {
    name: "consultVidaDeudorSpecialistTool",
    description:
      "Consulta información oficial y verificada sobre el seguro Vida Deudor. Usa esta herramienta OBLIGATORIAMENTE antes de responder cualquier pregunta sobre coberturas, precios, beneficios o servicios de Vida Deudor.",
    schema: z.object({
      consulta: z
        .string()
        .describe(
          "La pregunta completa del cliente o una frase de búsqueda detallada para encontrar la información en los documentos (ej: 'cubre a mis familiares', 'precio del plan familiar', 'servicios de odontología incluidos'). NO uses palabras sueltas como 'cobertura' o 'precio', sé específico."
        ),
    }),
  }
);


/**
 * Herramienta alternativa para búsquedas más específicas
 */
export const searchVidaDeudorDocumentsTool = tool(
  async ({ searchQuery }: { searchQuery: string }) => {
    try {
      console.log(
        `Búsqueda específica en documentos Vida Deudor: "${searchQuery}"`
      );


      const resultado = await searchVidaDeudorDocuments(searchQuery);


      if (!resultado || resultado.trim() === "") {
        return "No se encontraron documentos que coincidan con tu búsqueda.";
      }


      return resultado;
    } catch (error: any) {
      console.error("Error en búsqueda de documentos:", error);
     


     
      return "Error técnico temporal. Te puedo ayudar con información sobre Vida Deudor. ¿Qué necesitas saber?";
    }
  },
  {
    name: "search_vida_deudor_documents",
    description:
      "Busca información específica en los documentos oficiales de Vida Deudor usando términos de búsqueda precisos.",
    schema: z.object({
      searchQuery: z
        .string()
        .describe(
          "Términos específicos de búsqueda para encontrar información en los documentos oficiales"
        ),
    }),
  }
);




/**
 * NUEVA HERRAMIENTA: Búsqueda Inteligente con Re-ranking
 * Esta herramienta usa la nueva lógica de filtrado semántico para evitar alucinaciones.
 * Se puede usar en paralelo o como reemplazo de la anterior.
 */
//! Esta no está en uso pero es tentativa para usar en el futuro
export const consultVidaDeudorSmartTool = tool(
  async ({ consulta }: { consulta: string }) => {
    try {
      console.log(
        `🧠 Consultando Vida Deudor (Smart Search) para: "${consulta}"`
      );


      const resultado = await smartSearchVidaDeudor(consulta);


      if (!resultado || resultado.trim() === "") {
        return "No se encontró información relevante en los documentos oficiales que responda específicamente a tu pregunta.";
      }


      // Inyectamos instrucción de estilo para el agente para forzar concisión
      return `[SISTEMA: INSTRUCCIONES DE RESPUESTA]
Usa la siguiente información recuperada para responder al usuario.
IMPORTANTE: Tu respuesta debe ser BREVE, CONCISA y DIRECTA.
- Resume los puntos clave en viñetas cortas.
- Evita explicaciones largas o redundantes.
- Ve al grano.


--- INFORMACIÓN RECUPERADA ---
${resultado}`;
    } catch (error: any) {
      console.error("Error en Smart Search:", error);
      return "Ocurrió un error técnico al consultar la información detallada.";
    }
  },
  {
    name: "consult_vida_deudor_specialist",
    description:
      "Consulta información oficial de Vida Deudor usando un sistema de búsqueda inteligente que filtra resultados irrelevantes. Úsala para preguntas complejas sobre coberturas, exclusiones o detalles específicos.",
    schema: z.object({
      consulta: z
        .string()
        .describe(
          "La pregunta completa del cliente o el tema específico a buscar."
        ),
    }),
  }
);


export const vidaDeudorTools = [
    showVidaDeudorClientDataTool,
    updateVidaDeudorClientDataTool,
    sendVidaDeudorActivationEmail,
    // consultVidaDeudorSmartTool
    consultVidaDeudorSpecialistTool,
    searchVidaDeudorDocumentsTool
];
import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';
import dotenv from 'dotenv';
import sgMail from '@sendgrid/mail';
import type { PaymentFlowRequest } from '../types/paymentsWay.js';

// Solo usa servicios simulados; nunca carga las credenciales de .env.
await test('Pagos de Bienestar Plus Protegido (sin servicios externos)', async (t) => {
  t.mock.method(dotenv, 'config', () => ({ parsed: {} }));
  process.env.SUPABASE_URL = 'https://audit.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'audit-placeholder';
  process.env.SENDGRID_API_KEY = 'SG.audit.placeholder';
  process.env.SENDGRID_FROM_EMAIL = 'audit@example.invalid';
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('La prueba no permite solicitudes de red');
  });
  t.mock.method(console, 'log', () => {});

  const requests: Array<{ path: string; data: any }> = [];
  const writes: Array<{ kind: string; data: any; id?: string }> = [];
  const emails: any[] = [];
  const serviceLookups: string[] = [];
  let pending: any = null;

  t.mock.method(axios, 'create', () => ({
    post: async (path: string, data: any) => {
      requests.push({ path, data });
      if (path === '/CrearPersona') return { data: { id: '999999' } };
      assert.equal(path, '/CrearLinkDePago');
      return { data: { linkgenerado: 'https://audit.invalid/link', linkcorto: null } };
    }
  }) as never);
  t.mock.method(sgMail, 'send', async (message: any) => {
    emails.push(message);
    return [{ statusCode: 202 }] as never;
  });

  const { supabase } = await import('../config/supabase.js');
  t.mock.method(supabase, 'from', (table: string) => {
    assert.equal(table, 'suscripciones');
    const query = {
      select: () => query,
      eq: (_field: string, value: string) => {
        if (_field === 'service_type') serviceLookups.push(value);
        return query;
      },
      order: () => query,
      limit: () => query,
      maybeSingle: async () => ({ data: pending, error: null }),
      insert: async (data: any) => {
        assert.notEqual(data.service_type, null, 'service_type no puede ser null');
        assert.notEqual(data.service_type, undefined, 'service_type es obligatorio');
        writes.push({ kind: 'insert', data });
        return { error: null };
      },
      update: (data: any) => ({
        eq: async (_field: string, id: string) => {
          writes.push({ kind: 'update', data, id });
          return { error: null };
        }
      })
    };
    return query as never;
  });

  const { sendPaymentLinkEmailTool } = await import('../tools/sharedTools.js');
  const { generatePaymentLinkFlow } = await import('../services/paymentsWayService.js');
  const { buildProductCharge, PRODUCTS } = await import('../config/products.js');
  const reset = () => {
    requests.length = writes.length = emails.length = 0;
    serviceLookups.length = 0;
    pending = null;
  };
  const base: PaymentFlowRequest = {
    firstname: 'Cliente', lastname: 'Auditoria', identification: 'audit-document',
    email: 'client@example.invalid', phone: '3000000000', clientId: 123,
    amount: 10000, description: 'Seguro bienestar', totalInstallments: 12
  };

  await t.test('el catálogo del asesor usa la tarifa y el nombre vigentes', () => {
    assert.equal(PRODUCTS.bienestar.label, 'Bienestar Plus Protegido');
    assert.equal(PRODUCTS.bienestar.serviceType, 'bienestar_plus');
    assert.equal(buildProductCharge('bienestar').amount, 15589);
  });

  for (const insuranceName of ['bienestar', 'bienestar_plus', 'Bienestar Plus', 'Seguro bienestar', 'Bienestar Plus Protegido']) {
    await t.test(`la herramienta corrige nombre, precio y suscripción para ${insuranceName}`, async () => {
      reset();
      const result = await sendPaymentLinkEmailTool.invoke({
        clientName: 'Cliente Auditoria', clientEmail: base.email, insuranceName,
        clientNumber: '+573000000000', id: 123, document_id: base.identification,
        amount: 10000 // Simula un valor anterior conservado por el agente.
      });
      assert.match(String(result), /Bienestar Plus Protegido/);
      assert.equal(requests[1].data.amount, 15589);
      assert.equal(requests[1].data.descripcion, 'Bienestar Plus Protegido');
      assert.equal(writes.length, 1);
      assert.equal(writes[0].kind, 'insert');
      assert.equal(writes[0].data.service_type, 'bienestar_plus');
      assert.deepEqual(serviceLookups, ['bienestar_plus']);
      assert.equal(writes[0].data.amount, 15589);
      assert.equal(writes[0].data.description, 'Bienestar Plus Protegido');
      assert.equal(writes[0].data.status, 'pending_first_payment');
      assert.equal(writes[0].data.link_data.link_generado, 'https://audit.invalid/link');
      assert.equal(emails.length, 1);
      assert.match(emails[0].subject, /Bienestar Plus Protegido/);
      assert.match(emails[0].html, /15[.,]589/);
      assert.match(emails[0].html, /187[.,]068/);
      assert.doesNotMatch(emails[0].html, /Seguro bienestar|10[.,]000/);
    });
  }

  await t.test('una llamada antigua sin serviceType también crea la suscripción correcta', async () => {
    reset();
    await generatePaymentLinkFlow(base);
    assert.equal(writes[0].data.service_type, 'bienestar_plus');
    assert.equal(writes[0].data.amount, 15589);
    assert.equal(requests[1].data.descripcion, 'Bienestar Plus Protegido');
  });

  await t.test('normaliza el serviceType antiguo bienestar a bienestar_plus', async () => {
    reset();
    await generatePaymentLinkFlow({ ...base, serviceType: 'bienestar' });
    assert.equal(writes[0].data.service_type, 'bienestar_plus');
    assert.deepEqual(serviceLookups, ['bienestar_plus']);
  });

  await t.test('actualiza la suscripción pendiente y conserva el enlace anterior', async () => {
    reset();
    pending = {
      id: 'existing-subscription', payment_person_id: 'old-person',
      link_data: { link_generado: 'https://audit.invalid/previous', link_corto: null }
    };
    await generatePaymentLinkFlow({ ...base, serviceType: 'bienestar_plus' });
    assert.equal(writes.length, 1);
    assert.equal(writes[0].kind, 'update');
    assert.equal(writes[0].id, 'existing-subscription');
    assert.equal(writes[0].data.amount, 15589);
    assert.equal(writes[0].data.description, 'Bienestar Plus Protegido');
    assert.equal(writes[0].data.payment_person_id, '999999');
    assert.equal(writes[0].data.link_data.links_anteriores[0].payment_person_id, 'old-person');
  });

  await t.test('el ajuste no cambia el precio ni el producto de Mascotas', async () => {
    reset();
    await generatePaymentLinkFlow({
      ...base, amount: 54000, description: 'Seguro de Mascotas - 2 mascotas', serviceType: 'mascotas'
    });
    assert.equal(requests[1].data.amount, 54000);
    assert.equal(writes[0].data.service_type, 'mascotas');
    assert.deepEqual(serviceLookups, ['mascotas']);
    assert.equal(writes[0].data.description, 'Seguro de Mascotas - 2 mascotas');
  });
});

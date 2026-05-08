/**
 * Tienda de prueba MODO SDK v2
 *
 * Para levantar:
 *   1. npm install
 *   2. node server.js
 *   3. Abrir http://localhost:3000
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// CONFIGURACIÓN
// Credenciales genéricas de test publicadas en la docu de MODO
// https://merchants.modo.com.ar/docs
// ============================================================

const CONFIG = {
  BASE_URL: 'https://merchants.preprod.playdigital.com.ar',
  USERNAME: 'PLAYDIGITAL SA-318979-preprod',
  PASSWORD: '318979-P75V/QLKfVKX',
  PROCESSOR_CODE: 'P1019',        // Decidir Plus
  CC_CODE: '1CSI',                 // 1 cuota sin interés
  MERCHANT_NAME: 'TiendaTest',
};

// Cache del token (dura 1 semana)
let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    console.log('→ Reutilizando token cacheado');
    return cachedToken;
  }

  console.log('→ Solicitando nuevo token...');
  const res = await fetch(`${CONFIG.BASE_URL}/v2/stores/companies/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': CONFIG.MERCHANT_NAME,
    },
    body: JSON.stringify({
      username: CONFIG.USERNAME,
      password: CONFIG.PASSWORD,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Error obteniendo token (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000;
  console.log('✓ Token obtenido');
  return cachedToken;
}

function generateExternalId() {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================
// ENDPOINTS
// ============================================================

app.post('/api/modo-checkout', async (req, res) => {
  try {
    const { amount = 50.00, description = 'Compra de prueba' } = req.body;

    if (amount < 30) {
      return res.status(400).json({ error: 'El monto mínimo para Decidir Plus es $30.00' });
    }

    const token = await getAccessToken();
    const externalId = generateExternalId();
    console.log(`→ Creando payment request: $${amount} | ID: ${externalId}`);

    const modoRes = await fetch(`${CONFIG.BASE_URL}/v2/payment-requests/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': CONFIG.MERCHANT_NAME,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        description: description,
        amount: amount,
        currency: 'ARS',
        cc_code: CONFIG.CC_CODE,
        processor_code: CONFIG.PROCESSOR_CODE,
        external_intention_id: externalId,
        customer: {
          full_name: 'Usuario Test',
          email: 'test@example.com',
          identification: '12345678',
        },
        items: [
          {
            description: description,
            quantity: 1,
            unit_price: amount,
          },
        ],
      }),
    });

    if (!modoRes.ok) {
      const errorText = await modoRes.text();
      console.error(`✗ Error de MODO (${modoRes.status}):`, errorText);
      return res.status(modoRes.status).json({ error: errorText });
    }

    const paymentData = await modoRes.json();
    console.log('✓ Payment request creado:', paymentData.id);

    res.json({
      id: paymentData.id,
      qr: paymentData.qr,
      deeplink: paymentData.deeplink,
    });

  } catch (error) {
    console.error('✗ Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// INICIAR
// ============================================================

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`\n  Tienda de prueba MODO corriendo en http://localhost:${PORT}\n`);
});

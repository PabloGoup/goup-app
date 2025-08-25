// index.js
require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

// Función para generar la firma exactamente como Flow
function generateSignature(params, secretKey) {
  const orderedKeys = Object.keys(params).sort();
  const concatenated = orderedKeys.reduce((acc, key) => {
    return acc + key + params[key];
  }, '');
  // Crear HMAC SHA256 hex
  return crypto.createHmac('sha256', secretKey)
               .update(concatenated, 'utf8')
               .digest('hex');
}

async function crearPago() {
  const apiKey = process.env.FLOW_API_KEY;       // Tu clave pública (reemplaza en .env)
  const secretKey = process.env.FLOW_SECRET_KEY; // Tu clave secreta (reemplaza en .env)

  // Datos del pago (ajusta con tus valores)
  const params = {
    apiKey: apiKey,
    commerceOrder: 'Order-' + Date.now(),   // ID único
    subject: 'Pago prueba API',
    currency: 'CLP',
    amount: '1000', // en string
    email: 'nicolas@goupevents.cl',
    urlConfirmation: 'https://e18d0675a7b5.ngrok-free.app/webhook',
    urlReturn: 'https://httpbin.org/get'
  };

  // Generar la firma exactamente como lo requiere Flow
  const s = generateSignature(params, secretKey);
  console.log('Parámetros antes de firmar:', params);
  console.log('Firma generada:', s);

  // Preparar los datos en formato URL encoded
  const paramsUrlEncoded = new URLSearchParams();
  for (const key in params) {
    paramsUrlEncoded.append(key, params[key]);
  }
  paramsUrlEncoded.append('s', s);

  console.log('Datos a enviar (URL encoded):', paramsUrlEncoded.toString());

  try {
    const response = await axios.post(
      'https://sandbox.flow.cl/api/payment/create', // URL correcto en sandbox
      paramsUrlEncoded.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    console.log('Respuesta:', response.data);
  } catch (err) {
    console.error('Error en API:', err.response?.data || err.message);
  }
}

// Ejecutar
crearPago();

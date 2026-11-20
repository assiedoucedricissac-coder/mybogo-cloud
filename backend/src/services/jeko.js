const https = require('https');
const crypto = require('crypto');

function jekoRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'api.jeko.africa',
      path: '/partner_api' + path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': process.env.JEKO_API_KEY,
        'X-API-KEY-ID': process.env.JEKO_API_KEY_ID,
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function creerPaiement({ montant, reference, successUrl, errorUrl, methode = 'wave' }) {
  const r = await jekoRequest('POST', '/payment_requests', {
    storeId: process.env.JEKO_STORE_ID,
    amountCents: montant * 100,
    currency: 'XOF',
    reference,
    paymentDetails: {
      type: 'redirect',
      data: { paymentMethod: methode, successUrl, errorUrl },
    },
  });
  if (r.status !== 200) throw new Error(r.data?.message || `Jèko erreur ${r.status}`);
  return r.data;
}

function verifierSignature(bodyBrut, signature) {
  const secret = process.env.JEKO_WEBHOOK_SECRET;
  if (!secret) return true;
  const expected = crypto.createHmac('sha256', secret).update(bodyBrut).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature || ''));
  } catch {
    return false;
  }
}

module.exports = { creerPaiement, verifierSignature };

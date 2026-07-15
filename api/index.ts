import express from 'express';
import axios, { AxiosError } from 'axios';
import crypto from 'crypto';

const app = express();
app.use(express.json());

// ============================================================
// CONFIG
// ============================================================
const BASE_URL = (process.env.DNSE_BASE_URL || 'https://openapi.dnse.com.vn').replace(/\/$/, '');
const ALGORITHM = 'hmac-sha256';
const HMAC_NONCE_ENABLED = true;

// ============================================================
// UTILS — mapping 1:1 với PHP CommonUtils
// ============================================================
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(v: number): string { return String(v).padStart(2, '0'); }

function formatDateHeader(date: Date): string {
  return `${DAY_NAMES[date.getUTCDay()]}, ${pad2(date.getUTCDate())} ${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()} ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())} +0000`;
}

function resolveDigest(algo: string): string {
  switch (algo) {
    case 'hmac-sha256': return 'sha256';
    case 'hmac-sha384': return 'sha384';
    case 'hmac-sha512': return 'sha512';
    default: return 'sha1';
  }
}

function buildSignature(secret: string, method: string, path: string, dateValue: string, algorithm: string, nonce: string | null) {
  const headers = '(request-target) date';
  let sigStr = `(request-target): ${method.toLowerCase()} ${path}\ndate: ${dateValue}`;
  if (nonce) sigStr += `\nnonce: ${nonce}`;
  const digest = resolveDigest(algorithm);
  const hmac = crypto.createHmac(digest, Buffer.from(secret, 'utf8'));
  hmac.update(sigStr, 'utf8');
  return { headers, signature: encodeURIComponent(hmac.digest('base64')) };
}

// ============================================================
// ENUMS validation — mapping 1:1 với PHP Enums
// ============================================================
const VALID_MARKET_TYPES = ['STOCK', 'DERIVATIVE'];
const VALID_ORDER_CATEGORIES = ['NORMAL'];
const VALID_OTP_TYPES = ['smart_otp', 'email_otp'];

// ============================================================
// BASIC AUTH MIDDLEWARE — mapping 1:1 với PHP index.php
// ============================================================
const expectedUser = process.env.BASIC_AUTH_USER || '';
const expectedPass = process.env.BASIC_AUTH_PASSWORD || '';

if (expectedUser && expectedPass) {
  app.use((req, res, next) => {
    const authHeader = req.headers['authorization'] || '';
    let ok = false;
    const m = authHeader.match(/Basic\s+(.*)$/i);
    if (m) {
      const decoded = Buffer.from(m[1], 'base64').toString('utf-8');
      const i = decoded.indexOf(':');
      if (i !== -1 && decoded.substring(0, i) === expectedUser && decoded.substring(i + 1) === expectedPass) {
        ok = true;
      }
    }
    if (!ok) {
      res.setHeader('WWW-Authenticate', 'Basic realm="DNSE API Wrapper"');
      return res.status(401).json({ error: true, message: 'Unauthorized Access' });
    }
    next();
  });
}

// ============================================================
// REQUEST HELPER — mapping 1:1 với PHP DnseService::request()
// ============================================================
interface RequestOptions {
  query?: Record<string, any>;
  body?: any;
  headers?: Record<string, string>;
}

async function dnseRequest(req: express.Request, method: string, path: string, options: RequestOptions = {}) {
  const apiKey = (req.headers['x-api-key'] as string) || null;
  const apiSecret = (req.headers['x-api-secret'] as string) || null;
  const proxyUrl = (req.headers['x-proxy-url'] as string) || null;

  const url = new URL(`${BASE_URL}${path}`);
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }

  const reqHeaders: Record<string, string> = { version: '2026-05-07', Accept: 'application/json' };

  if (apiKey && apiSecret) {
    const dateValue = formatDateHeader(new Date());
    const nonce = HMAC_NONCE_ENABLED ? crypto.randomUUID().replace(/-/g, '') : null;
    const { headers, signature } = buildSignature(apiSecret, method, path, dateValue, ALGORITHM, nonce);
    let sigHeader = `Signature keyId="${apiKey}",algorithm="${ALGORITHM}",headers="${headers}",signature="${signature}"`;
    if (nonce) sigHeader += `,nonce="${nonce}"`;
    reqHeaders['Date'] = dateValue;
    reqHeaders['X-Signature'] = sigHeader;
    reqHeaders['x-api-key'] = apiKey;
  }

  if (options.body !== undefined) reqHeaders['Content-Type'] = 'application/json';
  if (options.headers) Object.assign(reqHeaders, options.headers);

  const axiosConfig: any = { method, url: url.toString(), headers: reqHeaders, data: options.body, validateStatus: () => true };

  if (proxyUrl) {
    try {
      const { HttpsProxyAgent } = await import('https-proxy-agent');
      axiosConfig.httpsAgent = new HttpsProxyAgent(proxyUrl);
      axiosConfig.proxy = false;
    } catch {}
  }

  try {
    const resp = await axios(axiosConfig);
    return { status: resp.status, data: resp.data };
  } catch (err: any) {
    const isProxy = !!axiosConfig.httpsAgent;
    if (!err.response) {
      if (isProxy) return { status: 502, data: { error: 'PROXY_NETWORK_ERROR', message: 'Kết nối qua Proxy bị lỗi hoặc Proxy đã chết.', details: err.message } };
      return { status: 500, data: { error: true, message: err.message } };
    }
    const s = err.response.status;
    const d = err.response.data;
    if (isProxy) {
      if (s === 407) return { status: 407, data: { error: 'PROXY_AUTH_ERROR', message: 'Xác thực Proxy thất bại.' } };
      if (s === 403 || s === 429) return { status: s, data: { ...(typeof d === 'object' ? d : { raw_data: d }), error: 'PROXY_BANNED', message: `Proxy có thể đã bị chặn bởi DNSE (Mã lỗi: ${s}).` } };
    }
    return { status: s, data: d };
  }
}

function sendResult(res: express.Response, result: { status: number; data: any }) {
  return res.status(result.status).json(result.data);
}

function errorResponse(res: express.Response, message: string, status = 400) {
  return res.status(status).json({ error: true, message });
}

// ============================================================
// ROUTES — mapping 1:1 với PHP DnseController (18 routes)
// ============================================================
const r = express.Router();

// 1. GET /dnse/accounts
r.get('/accounts', async (req, res) => sendResult(res, await dnseRequest(req, 'GET', '/accounts')));

// 2. GET /dnse/accounts/:accountNo/balances
r.get('/accounts/:accountNo/balances', async (req, res) => sendResult(res, await dnseRequest(req, 'GET', `/accounts/${req.params.accountNo}/balances`)));

// 3. GET /dnse/accounts/:accountNo/loan-packages
r.get('/accounts/:accountNo/loan-packages', async (req, res) => {
  const { marketType, symbol } = req.query as any;
  if (!marketType || !symbol) return errorResponse(res, 'Missing marketType or symbol query');
  if (!VALID_MARKET_TYPES.includes(marketType)) return errorResponse(res, 'Invalid marketType');
  sendResult(res, await dnseRequest(req, 'GET', `/accounts/${req.params.accountNo}/loan-packages`, { query: { marketType, symbol } }));
});

// 4. GET /dnse/accounts/:accountNo/positions
r.get('/accounts/:accountNo/positions', async (req, res) => {
  const { marketType, pageSize } = req.query as any;
  if (!VALID_MARKET_TYPES.includes(marketType) || !pageSize) return errorResponse(res, 'Invalid marketType or pageSize');
  sendResult(res, await dnseRequest(req, 'GET', `/accounts/${req.params.accountNo}/positions`, { query: { marketType, pageSize } }));
});

// 5. GET /dnse/positions/:positionId
r.get('/positions/:positionId', async (req, res) => {
  const { marketType } = req.query as any;
  if (!VALID_MARKET_TYPES.includes(marketType)) return errorResponse(res, 'Missing marketType');
  sendResult(res, await dnseRequest(req, 'GET', `/accounts/positions/${req.params.positionId}`, { query: { marketType } }));
});

// 6. GET /dnse/accounts/:accountNo/orders
r.get('/accounts/:accountNo/orders', async (req, res) => {
  const { marketType, orderCategory } = req.query as any;
  if (!VALID_MARKET_TYPES.includes(marketType) || !VALID_ORDER_CATEGORIES.includes(orderCategory)) return errorResponse(res, 'Invalid marketType or orderCategory');
  sendResult(res, await dnseRequest(req, 'GET', `/accounts/${req.params.accountNo}/orders`, { query: { marketType, orderCategory } }));
});

// 7. GET /dnse/accounts/:accountNo/orders/:orderId
r.get('/accounts/:accountNo/orders/:orderId', async (req, res) => {
  const { marketType, orderCategory } = req.query as any;
  if (!VALID_MARKET_TYPES.includes(marketType) || !VALID_ORDER_CATEGORIES.includes(orderCategory)) return errorResponse(res, 'Invalid marketType or orderCategory');
  sendResult(res, await dnseRequest(req, 'GET', `/accounts/${req.params.accountNo}/orders/${req.params.orderId}`, { query: { marketType, orderCategory } }));
});

// 8. GET /dnse/accounts/:accountNo/executions/:orderId
r.get('/accounts/:accountNo/executions/:orderId', async (req, res) => {
  const { marketType, orderCategory } = req.query as any;
  if (marketType !== 'DERIVATIVE') return errorResponse(res, 'Endpoint này chỉ hỗ trợ marketType là DERIVATIVE');
  sendResult(res, await dnseRequest(req, 'GET', `/accounts/${req.params.accountNo}/executions/${req.params.orderId}`, { query: { marketType, orderCategory } }));
});

// 9. GET /dnse/accounts/:accountNo/orders-history
r.get('/accounts/:accountNo/orders-history', async (req, res) => {
  const { marketType, fromDate, toDate } = req.query as any;
  if (!VALID_MARKET_TYPES.includes(marketType) || !fromDate || !toDate) return errorResponse(res, 'Invalid params');
  sendResult(res, await dnseRequest(req, 'GET', `/accounts/${req.params.accountNo}/orders/history`, { query: { marketType, from: fromDate, to: toDate } }));
});

// 10. GET /dnse/accounts/:accountNo/corporate-action-history
r.get('/accounts/:accountNo/corporate-action-history', async (req, res) => sendResult(res, await dnseRequest(req, 'GET', `/accounts/${req.params.accountNo}/corporate-action-history`)));

// 11. GET /dnse/accounts/:accountNo/ppse
r.get('/accounts/:accountNo/ppse', async (req, res) => {
  const { marketType, symbol, price, loanPackageId } = req.query as any;
  if (!VALID_MARKET_TYPES.includes(marketType) || !symbol || !price || !loanPackageId) return errorResponse(res, 'Invalid params');
  sendResult(res, await dnseRequest(req, 'GET', `/accounts/${req.params.accountNo}/ppse`, { query: { marketType, symbol, loanPackageId: String(loanPackageId), price: String(price) } }));
});

// 12. POST /dnse/accounts/orders
r.post('/accounts/orders', async (req, res) => {
  const { marketType, orderCategory } = req.query as any;
  const tradingToken = req.headers['trading-token'] as string;
  if (!VALID_MARKET_TYPES.includes(marketType) || !VALID_ORDER_CATEGORIES.includes(orderCategory) || !tradingToken || !req.body) return errorResponse(res, 'Invalid params or body');
  sendResult(res, await dnseRequest(req, 'POST', '/accounts/orders', { query: { marketType, orderCategory }, body: req.body, headers: { 'trading-token': tradingToken } }));
});

// 13. PUT /dnse/accounts/:accountNo/orders/:orderId
r.put('/accounts/:accountNo/orders/:orderId', async (req, res) => {
  const { marketType, orderCategory } = req.query as any;
  const tradingToken = req.headers['trading-token'] as string;
  if (!VALID_MARKET_TYPES.includes(marketType) || !VALID_ORDER_CATEGORIES.includes(orderCategory) || !tradingToken || !req.body) return errorResponse(res, 'Invalid params or body');
  sendResult(res, await dnseRequest(req, 'PUT', `/accounts/${req.params.accountNo}/orders/${req.params.orderId}`, { query: { marketType, orderCategory }, body: req.body, headers: { 'trading-token': tradingToken } }));
});

// 14. DELETE /dnse/accounts/:accountNo/orders/:orderId
r.delete('/accounts/:accountNo/orders/:orderId', async (req, res) => {
  const { marketType, orderCategory } = req.query as any;
  const tradingToken = req.headers['trading-token'] as string;
  if (!VALID_MARKET_TYPES.includes(marketType) || !VALID_ORDER_CATEGORIES.includes(orderCategory) || !tradingToken) return errorResponse(res, 'Invalid params');
  sendResult(res, await dnseRequest(req, 'DELETE', `/accounts/${req.params.accountNo}/orders/${req.params.orderId}`, { query: { marketType, orderCategory }, headers: { 'trading-token': tradingToken } }));
});

// 15. POST /dnse/accounts/positions/:positionId/close
r.post('/accounts/positions/:positionId/close', async (req, res) => {
  const { marketType } = req.query as any;
  const tradingToken = req.headers['trading-token'] as string;
  if (!VALID_MARKET_TYPES.includes(marketType) || !tradingToken) return errorResponse(res, 'Invalid params');
  sendResult(res, await dnseRequest(req, 'POST', `/accounts/positions/${req.params.positionId}/close`, { query: { marketType }, headers: { 'trading-token': tradingToken } }));
});

// 16. GET /dnse/market/working-dates
r.get('/market/working-dates', async (req, res) => sendResult(res, await dnseRequest(req, 'GET', '/market/working-dates')));

// 17. POST /dnse/registration/trading-token
r.post('/registration/trading-token', async (req, res) => {
  const { otpType, passcode } = req.body || {};
  if (!VALID_OTP_TYPES.includes(otpType) || !passcode) return errorResponse(res, 'Missing fields in body');
  sendResult(res, await dnseRequest(req, 'POST', '/registration/trading-token', { body: { otpType, passcode } }));
});

// 18. POST /dnse/registration/send-email-otp
r.post('/registration/send-email-otp', async (req, res) => sendResult(res, await dnseRequest(req, 'POST', '/registration/send-email-otp')));

app.use('/dnse', r);

// Fallback
app.all('*', (req, res) => res.status(404).json({ error: true, message: 'API endpoint not found.' }));

export default app;

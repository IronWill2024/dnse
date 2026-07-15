const axios = require('axios');
const crypto = require('crypto');
const url = require('url');

// ============================================================
// CONFIG
// ============================================================
const BASE_URL = (process.env.DNSE_BASE_URL || 'https://openapi.dnse.com.vn').replace(/\/$/, '');
const ALGORITHM = 'hmac-sha256';

// ============================================================
// UTILS — mapping 1:1 với PHP CommonUtils
// ============================================================
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = (v) => String(v).padStart(2, '0');

function formatDateHeader(d) {
  return `${DAYS[d.getUTCDay()]}, ${pad2(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())} +0000`;
}

function resolveDigest(algo) {
  if (algo === 'hmac-sha256') return 'sha256';
  if (algo === 'hmac-sha384') return 'sha384';
  if (algo === 'hmac-sha512') return 'sha512';
  return 'sha1';
}

function buildSignature(secret, method, path, dateValue, algorithm, nonce) {
  const hdrs = '(request-target) date';
  let sigStr = `(request-target): ${method.toLowerCase()} ${path}\ndate: ${dateValue}`;
  if (nonce) sigStr += `\nnonce: ${nonce}`;
  const hmac = crypto.createHmac(resolveDigest(algorithm), Buffer.from(secret, 'utf8'));
  hmac.update(sigStr, 'utf8');
  return { headers: hdrs, signature: encodeURIComponent(hmac.digest('base64')) };
}

// ============================================================
// BASIC AUTH — mapping 1:1 với PHP index.php
// ============================================================
const AUTH_USER = process.env.BASIC_AUTH_USER || '';
const AUTH_PASS = process.env.BASIC_AUTH_PASSWORD || '';

function checkBasicAuth(req) {
  if (!AUTH_USER || !AUTH_PASS) return true;
  const authHeader = req.headers['authorization'] || '';
  const m = authHeader.match(/Basic\s+(.*)$/i);
  if (!m) return false;
  const decoded = Buffer.from(m[1], 'base64').toString('utf-8');
  const i = decoded.indexOf(':');
  if (i === -1) return false;
  return decoded.substring(0, i) === AUTH_USER && decoded.substring(i + 1) === AUTH_PASS;
}

// ============================================================
// DNSE REQUEST — mapping 1:1 với PHP DnseService::request()
// ============================================================
async function dnseRequest(req, method, path, options = {}) {
  const apiKey = req.headers['x-api-key'] || null;
  const apiSecret = req.headers['x-api-secret'] || null;

  const u = new URL(`${BASE_URL}${path}`);
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) {
      if (v != null) u.searchParams.set(k, String(v));
    }
  }

  const hdrs = { version: '2026-05-07', Accept: 'application/json' };

  if (apiKey && apiSecret) {
    const dateValue = formatDateHeader(new Date());
    const nonce = crypto.randomUUID().replace(/-/g, '');
    const sig = buildSignature(apiSecret, method, path, dateValue, ALGORITHM, nonce);
    let sigHeader = `Signature keyId="${apiKey}",algorithm="${ALGORITHM}",headers="${sig.headers}",signature="${sig.signature}",nonce="${nonce}"`;
    hdrs['Date'] = dateValue;
    hdrs['X-Signature'] = sigHeader;
    hdrs['x-api-key'] = apiKey;
  }

  if (options.body != null) hdrs['Content-Type'] = 'application/json';
  if (options.headers) Object.assign(hdrs, options.headers);

  try {
    const resp = await axios({ method, url: u.toString(), headers: hdrs, data: options.body, validateStatus: () => true });
    return { status: resp.status, data: resp.data };
  } catch (err) {
    if (!err.response) return { status: 500, data: { error: true, message: err.message } };
    return { status: err.response.status, data: err.response.data };
  }
}

// ============================================================
// ROUTING — mapping 1:1 với PHP index.php (18 routes)
// ============================================================
function parseBody(req) {
  return new Promise((resolve) => {
    if (req.body) return resolve(req.body);
    let data = '';
    req.on('data', (chunk) => data += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(data)); } catch { resolve(null); }
    });
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function errJson(res, msg, status = 400) {
  json(res, status, { error: true, message: msg });
}

// Simple path matcher: /dnse/accounts/:accountNo/balances
function matchRoute(method, pathname, routeMethod, pattern) {
  if (method !== routeMethod) return null;
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;
  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

const VALID_MARKETS = ['STOCK', 'DERIVATIVE'];
const VALID_CATEGORIES = ['NORMAL'];
const VALID_OTPS = ['smart_otp', 'email_otp'];

module.exports = async (req, res) => {
  // Basic Auth
  if (!checkBasicAuth(req)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="DNSE API Wrapper"');
    return json(res, 401, { error: true, message: 'Unauthorized Access' });
  }

  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname.replace(/\/$/, '') || '/';
  const query = parsed.query;
  const method = req.method;
  let params;

  // 1. GET /dnse/accounts
  if ((params = matchRoute(method, pathname, 'GET', '/dnse/accounts'))) {
    return json(res, 200, (await dnseRequest(req, 'GET', '/accounts')).data);
  }

  // 2. GET /dnse/accounts/:accountNo/balances
  if ((params = matchRoute(method, pathname, 'GET', '/dnse/accounts/:accountNo/balances'))) {
    const r = await dnseRequest(req, 'GET', `/accounts/${params.accountNo}/balances`);
    return json(res, r.status, r.data);
  }

  // 3. GET /dnse/accounts/:accountNo/loan-packages
  if ((params = matchRoute(method, pathname, 'GET', '/dnse/accounts/:accountNo/loan-packages'))) {
    if (!query.marketType || !query.symbol) return errJson(res, 'Missing marketType or symbol query');
    if (!VALID_MARKETS.includes(query.marketType)) return errJson(res, 'Invalid marketType');
    const r = await dnseRequest(req, 'GET', `/accounts/${params.accountNo}/loan-packages`, { query: { marketType: query.marketType, symbol: query.symbol } });
    return json(res, r.status, r.data);
  }

  // 4. GET /dnse/accounts/:accountNo/positions
  if ((params = matchRoute(method, pathname, 'GET', '/dnse/accounts/:accountNo/positions'))) {
    if (!VALID_MARKETS.includes(query.marketType) || !query.pageSize) return errJson(res, 'Invalid marketType or pageSize');
    const r = await dnseRequest(req, 'GET', `/accounts/${params.accountNo}/positions`, { query: { marketType: query.marketType, pageSize: query.pageSize } });
    return json(res, r.status, r.data);
  }

  // 5. GET /dnse/positions/:positionId
  if ((params = matchRoute(method, pathname, 'GET', '/dnse/positions/:positionId'))) {
    if (!VALID_MARKETS.includes(query.marketType)) return errJson(res, 'Missing marketType');
    const r = await dnseRequest(req, 'GET', `/accounts/positions/${params.positionId}`, { query: { marketType: query.marketType } });
    return json(res, r.status, r.data);
  }

  // 6. GET /dnse/accounts/:accountNo/orders
  if ((params = matchRoute(method, pathname, 'GET', '/dnse/accounts/:accountNo/orders'))) {
    if (!VALID_MARKETS.includes(query.marketType) || !VALID_CATEGORIES.includes(query.orderCategory)) return errJson(res, 'Invalid marketType or orderCategory');
    const r = await dnseRequest(req, 'GET', `/accounts/${params.accountNo}/orders`, { query: { marketType: query.marketType, orderCategory: query.orderCategory } });
    return json(res, r.status, r.data);
  }

  // 7. GET /dnse/accounts/:accountNo/orders/:orderId
  if ((params = matchRoute(method, pathname, 'GET', '/dnse/accounts/:accountNo/orders/:orderId'))) {
    if (!VALID_MARKETS.includes(query.marketType) || !VALID_CATEGORIES.includes(query.orderCategory)) return errJson(res, 'Invalid marketType or orderCategory');
    const r = await dnseRequest(req, 'GET', `/accounts/${params.accountNo}/orders/${params.orderId}`, { query: { marketType: query.marketType, orderCategory: query.orderCategory } });
    return json(res, r.status, r.data);
  }

  // 8. GET /dnse/accounts/:accountNo/executions/:orderId
  if ((params = matchRoute(method, pathname, 'GET', '/dnse/accounts/:accountNo/executions/:orderId'))) {
    if (query.marketType !== 'DERIVATIVE') return errJson(res, 'Endpoint này chỉ hỗ trợ marketType là DERIVATIVE');
    const r = await dnseRequest(req, 'GET', `/accounts/${params.accountNo}/executions/${params.orderId}`, { query: { marketType: query.marketType, orderCategory: query.orderCategory } });
    return json(res, r.status, r.data);
  }

  // 9. GET /dnse/accounts/:accountNo/orders-history
  if ((params = matchRoute(method, pathname, 'GET', '/dnse/accounts/:accountNo/orders-history'))) {
    if (!VALID_MARKETS.includes(query.marketType) || !query.fromDate || !query.toDate) return errJson(res, 'Invalid params');
    const r = await dnseRequest(req, 'GET', `/accounts/${params.accountNo}/orders/history`, { query: { marketType: query.marketType, from: query.fromDate, to: query.toDate } });
    return json(res, r.status, r.data);
  }

  // 10. GET /dnse/accounts/:accountNo/corporate-action-history
  if ((params = matchRoute(method, pathname, 'GET', '/dnse/accounts/:accountNo/corporate-action-history'))) {
    const r = await dnseRequest(req, 'GET', `/accounts/${params.accountNo}/corporate-action-history`);
    return json(res, r.status, r.data);
  }

  // 11. GET /dnse/accounts/:accountNo/ppse
  if ((params = matchRoute(method, pathname, 'GET', '/dnse/accounts/:accountNo/ppse'))) {
    if (!VALID_MARKETS.includes(query.marketType) || !query.symbol || !query.price || !query.loanPackageId) return errJson(res, 'Invalid params');
    const r = await dnseRequest(req, 'GET', `/accounts/${params.accountNo}/ppse`, { query: { marketType: query.marketType, symbol: query.symbol, loanPackageId: String(query.loanPackageId), price: String(query.price) } });
    return json(res, r.status, r.data);
  }

  // 12. POST /dnse/accounts/orders
  if ((params = matchRoute(method, pathname, 'POST', '/dnse/accounts/orders'))) {
    const tradingToken = req.headers['trading-token'];
    if (!VALID_MARKETS.includes(query.marketType) || !VALID_CATEGORIES.includes(query.orderCategory) || !tradingToken) return errJson(res, 'Invalid params or body');
    const body = await parseBody(req);
    const r = await dnseRequest(req, 'POST', '/accounts/orders', { query: { marketType: query.marketType, orderCategory: query.orderCategory }, body, headers: { 'trading-token': tradingToken } });
    return json(res, r.status, r.data);
  }

  // 13. PUT /dnse/accounts/:accountNo/orders/:orderId
  if ((params = matchRoute(method, pathname, 'PUT', '/dnse/accounts/:accountNo/orders/:orderId'))) {
    const tradingToken = req.headers['trading-token'];
    if (!VALID_MARKETS.includes(query.marketType) || !VALID_CATEGORIES.includes(query.orderCategory) || !tradingToken) return errJson(res, 'Invalid params or body');
    const body = await parseBody(req);
    const r = await dnseRequest(req, 'PUT', `/accounts/${params.accountNo}/orders/${params.orderId}`, { query: { marketType: query.marketType, orderCategory: query.orderCategory }, body, headers: { 'trading-token': tradingToken } });
    return json(res, r.status, r.data);
  }

  // 14. DELETE /dnse/accounts/:accountNo/orders/:orderId
  if ((params = matchRoute(method, pathname, 'DELETE', '/dnse/accounts/:accountNo/orders/:orderId'))) {
    const tradingToken = req.headers['trading-token'];
    if (!VALID_MARKETS.includes(query.marketType) || !VALID_CATEGORIES.includes(query.orderCategory) || !tradingToken) return errJson(res, 'Invalid params');
    const r = await dnseRequest(req, 'DELETE', `/accounts/${params.accountNo}/orders/${params.orderId}`, { query: { marketType: query.marketType, orderCategory: query.orderCategory }, headers: { 'trading-token': tradingToken } });
    return json(res, r.status, r.data);
  }

  // 15. POST /dnse/accounts/positions/:positionId/close
  if ((params = matchRoute(method, pathname, 'POST', '/dnse/accounts/positions/:positionId/close'))) {
    const tradingToken = req.headers['trading-token'];
    if (!VALID_MARKETS.includes(query.marketType) || !tradingToken) return errJson(res, 'Invalid params');
    const r = await dnseRequest(req, 'POST', `/accounts/positions/${params.positionId}/close`, { query: { marketType: query.marketType }, headers: { 'trading-token': tradingToken } });
    return json(res, r.status, r.data);
  }

  // 16. GET /dnse/market/working-dates
  if ((params = matchRoute(method, pathname, 'GET', '/dnse/market/working-dates'))) {
    const r = await dnseRequest(req, 'GET', '/market/working-dates');
    return json(res, r.status, r.data);
  }

  // 17. POST /dnse/registration/trading-token
  if ((params = matchRoute(method, pathname, 'POST', '/dnse/registration/trading-token'))) {
    const body = await parseBody(req);
    if (!body || !VALID_OTPS.includes(body.otpType) || !body.passcode) return errJson(res, 'Missing fields in body');
    const r = await dnseRequest(req, 'POST', '/registration/trading-token', { body: { otpType: body.otpType, passcode: body.passcode } });
    return json(res, r.status, r.data);
  }

  // 18. POST /dnse/registration/send-email-otp
  if ((params = matchRoute(method, pathname, 'POST', '/dnse/registration/send-email-otp'))) {
    const r = await dnseRequest(req, 'POST', '/registration/send-email-otp');
    return json(res, r.status, r.data);
  }

  // Fallback
  json(res, 404, { error: true, message: 'API endpoint not found.' });
};

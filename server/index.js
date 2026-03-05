import express from 'express';
import cors from 'cors';
import http from 'http';
import https from 'https';
import crypto from 'crypto';
import 'dotenv/config';
import { connectMongo, getDb, getMongoState, disconnectMongo } from './mongo.js';

const app = express();
const PORT = process.env.PORT || 4573;

app.use(cors({ origin: true, credentials: true }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const healthHandler = (req, res) => {
  const mongoState = getMongoState();
  res.json({
    status: 'ok',
    message: 'HTTP Request Builder API is running!',
    mongo: mongoState,
  });
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

const REQUEST_STATE_COLLECTION = 'request_states';
const REQUEST_STATE_DOC_ID = 'request_management_state';
const WORKFLOW_STATE_COLLECTION = 'workflow_states';
const USERS_COLLECTION = 'users';
const USER_SESSIONS_COLLECTION = 'user_sessions';
const AUTH_CAPTCHAS_COLLECTION = 'auth_captchas';
const SESSION_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;
const CAPTCHA_EXPIRE_MS = 5 * 60 * 1000;
const SESSION_COOKIE_NAME = 'http_client_session';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const buildSessionCookie = (token) => {
  const maxAgeSeconds = Math.floor(SESSION_EXPIRE_MS / 1000);
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Strict${IS_PRODUCTION ? '; Secure' : ''}`;
};

const buildClearSessionCookie = () =>
  `${SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict${IS_PRODUCTION ? '; Secure' : ''}`;

const safeDecodeURIComponent = (value) => {
  try {
    return decodeURIComponent(value || '');
  } catch {
    return '';
  }
};

const parseCookies = (cookieHeader = '') =>
  cookieHeader.split(';').reduce((acc, item) => {
    const [rawKey, ...rawValue] = item.trim().split('=');
    if (!rawKey) {
      return acc;
    }
    const value = rawValue.join('=');
    acc[rawKey] = safeDecodeURIComponent(value);
    return acc;
  }, {});

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derivedKey}`;
};

const verifyPassword = (password, storedHash) => {
  if (typeof storedHash !== 'string') {
    return false;
  }
  const [algo, salt, hash] = storedHash.split('$');
  if (algo !== 'scrypt' || !salt || !hash) {
    return false;
  }
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(candidate, expected);
};

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const compareHashHex = (candidateHex, expectedHex) => {
  if (typeof candidateHex !== 'string' || typeof expectedHex !== 'string') {
    return false;
  }
  const candidate = Buffer.from(candidateHex, 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  if (candidate.length === 0 || expected.length === 0 || candidate.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(candidate, expected);
};

const generateCaptchaCode = (length = 6) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i += 1) {
    const idx = crypto.randomInt(0, chars.length);
    code += chars[idx];
  }
  return code;
};

const generateCaptchaSvg = (code) => {
  const chars = code.split('');
  const texts = chars.map((char, idx) => {
    const x = 17 + idx * 17;
    const y = 25 + (idx % 2 === 0 ? 1 : -1);
    const rotate = idx % 2 === 0 ? -10 : 10;
    return `<text x="${x}" y="${y}" transform="rotate(${rotate} ${x} ${y})">${char}</text>`;
  }).join('');
  const lines = Array.from({ length: 4 }).map((_, idx) => {
    const x1 = 6 + idx * 24;
    const y1 = 7 + (idx % 2 === 0 ? 0 : 10);
    const x2 = 110 - idx * 15;
    const y2 = 29 - (idx % 2 === 0 ? 0 : 10);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#9ca3af" stroke-width="1"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="118" height="36" viewBox="0 0 118 36"><rect width="118" height="36" fill="#f3f4f6" rx="6" ry="6"/>${lines}<g fill="#111827" font-family="monospace" font-size="19" font-weight="700">${texts}</g></svg>`;
};

const createSession = async (db, userId) => {
  const token = crypto.randomBytes(48).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_EXPIRE_MS);
  await db.collection(USER_SESSIONS_COLLECTION).insertOne({
    tokenHash: hashToken(token),
    userId,
    createdAt: now,
    updatedAt: now,
    expiresAt,
  });
  return token;
};

const getAuthTokenFromRequest = (req) => {
  const cookies = parseCookies(req.headers.cookie);
  if (typeof cookies[SESSION_COOKIE_NAME] === 'string' && cookies[SESSION_COOKIE_NAME].trim()) {
    return cookies[SESSION_COOKIE_NAME].trim();
  }
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const xAuthToken = req.headers['x-auth-token'];
  if (typeof xAuthToken === 'string' && xAuthToken.trim()) {
    return xAuthToken.trim();
  }
  return null;
};

const normalizeRequest = (req = {}, index = 0) => ({
  id: typeof req.id === 'string' && req.id.trim() ? req.id : `${Date.now()}-${index}`,
  name: typeof req.name === 'string' && req.name.trim() ? req.name : `请求 ${index + 1}`,
  description: typeof req.description === 'string' ? req.description : '',
  method: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) ? req.method : 'GET',
  url: typeof req.url === 'string' ? req.url : '',
  headers: Array.isArray(req.headers) ? req.headers : [],
  params: Array.isArray(req.params) ? req.params : [],
  body: typeof req.body === 'string' ? req.body : JSON.stringify({}, null, 2),
  inputFields: Array.isArray(req.inputFields) ? req.inputFields : [],
  outputFields: Array.isArray(req.outputFields) ? req.outputFields : [],
  apiMappings: Array.isArray(req.apiMappings) ? req.apiMappings : [],
});

const normalizeRequestState = (payload = {}) => {
  const requests = Array.isArray(payload.requests) ? payload.requests.map((req, index) => normalizeRequest(req, index)) : [];
  const selectedRequestId = typeof payload.selectedRequestId === 'string' ? payload.selectedRequestId : null;
  const safeSelectedRequestId = selectedRequestId && requests.some((req) => req.id === selectedRequestId)
    ? selectedRequestId
    : (requests[0]?.id || null);
  return {
    requests,
    selectedRequestId: safeSelectedRequestId,
  };
};

const normalizeWorkflowRequest = (request = {}, index = 0) => ({
  id: typeof request.id === 'string' && request.id.trim() ? request.id : `${Date.now()}-${index}`,
  name: typeof request.name === 'string' ? request.name : `请求 ${index + 1}`,
  method: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method) ? request.method : 'GET',
  url: typeof request.url === 'string' ? request.url : '',
  headers: Array.isArray(request.headers) ? request.headers : [],
  params: Array.isArray(request.params) ? request.params : [],
  body: typeof request.body === 'string' ? request.body : '',
  inputFields: Array.isArray(request.inputFields) ? request.inputFields : [],
  outputFields: Array.isArray(request.outputFields) ? request.outputFields : [],
  inputValues: request.inputValues && typeof request.inputValues === 'object' ? request.inputValues : {},
  apiMappings: Array.isArray(request.apiMappings) ? request.apiMappings : [],
});

const normalizeWorkflow = (workflow = {}, index = 0) => ({
  id: typeof workflow.id === 'string' && workflow.id.trim() ? workflow.id : `${Date.now()}-${index}`,
  name: typeof workflow.name === 'string' ? workflow.name : `工作流 ${index + 1}`,
  requests: Array.isArray(workflow.requests) ? workflow.requests.map((request, reqIdx) => normalizeWorkflowRequest(request, reqIdx)) : [],
  createdAt: typeof workflow.createdAt === 'number' ? workflow.createdAt : Date.now(),
  updatedAt: typeof workflow.updatedAt === 'number' ? workflow.updatedAt : Date.now(),
  nodePositions: workflow.nodePositions && typeof workflow.nodePositions === 'object' ? workflow.nodePositions : {},
});

const normalizeWorkflowState = (payload = {}) => {
  const workflows = Array.isArray(payload.workflows) ? payload.workflows.map((workflow, index) => normalizeWorkflow(workflow, index)) : [];
  const selectedWorkflowId = typeof payload.selectedWorkflowId === 'string' ? payload.selectedWorkflowId : null;
  const safeSelectedWorkflowId = selectedWorkflowId && workflows.some((workflow) => workflow.id === selectedWorkflowId)
    ? selectedWorkflowId
    : (workflows[0]?.id || null);
  return {
    workflows,
    selectedWorkflowId: safeSelectedWorkflowId,
  };
};

const getUserStateDocId = (req) => String(req.auth.user.id);

const getDbOrReconnect = async () => {
  const current = getDb();
  if (current) {
    return current;
  }
  return await connectMongo();
};

const mongoUnavailableResponse = () => {
  const mongo = getMongoState();
  return {
    error: mongo.lastError ? `MongoDB is not connected: ${mongo.lastError}` : 'MongoDB is not connected',
    mongo,
  };
};

const requireAuth = async (req, res, next) => {
  const db = await getDbOrReconnect();
  if (!db) {
    return res.status(503).json(mongoUnavailableResponse());
  }

  const token = getAuthTokenFromRequest(req);
  if (!token) {
    res.setHeader('Set-Cookie', buildClearSessionCookie());
    return res.status(401).json({ error: 'Unauthorized', code: 'AUTH_TOKEN_MISSING' });
  }

  try {
    const session = await db.collection(USER_SESSIONS_COLLECTION).findOne({
      tokenHash: hashToken(token),
      expiresAt: { $gt: new Date() },
    });
    if (!session) {
      res.setHeader('Set-Cookie', buildClearSessionCookie());
      return res.status(401).json({ error: 'Unauthorized', code: 'AUTH_TOKEN_INVALID' });
    }

    const user = await db.collection(USERS_COLLECTION).findOne({ _id: session.userId });
    if (!user) {
      await db.collection(USER_SESSIONS_COLLECTION).deleteOne({ _id: session._id });
      res.setHeader('Set-Cookie', buildClearSessionCookie());
      return res.status(401).json({ error: 'Unauthorized', code: 'AUTH_USER_NOT_FOUND' });
    }

    req.auth = {
      tokenHash: session.tokenHash,
      sessionId: session._id,
      user: {
        id: user._id,
        username: user.username,
        lastLoginAt: user.lastLoginAt || null,
      },
    };
    await db.collection(USER_SESSIONS_COLLECTION).updateOne(
      { _id: session._id },
      {
        $set: {
          updatedAt: new Date(),
        },
      }
    );
    return next();
  } catch (error) {
    return res.status(500).json({
      error: 'Authentication failed',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

app.get('/api/auth/captcha', async (req, res) => {
  const db = await getDbOrReconnect();
  if (!db) {
    return res.status(503).json(mongoUnavailableResponse());
  }
  try {
    const code = generateCaptchaCode();
    const salt = crypto.randomBytes(8).toString('hex');
    const captchaId = crypto.randomBytes(16).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CAPTCHA_EXPIRE_MS);
    await db.collection(AUTH_CAPTCHAS_COLLECTION).insertOne({
      _id: captchaId,
      codeHash: hashToken(`${salt}:${code}`),
      salt,
      createdAt: now,
      expiresAt,
    });
    return res.json({
      captchaId,
      captchaSvg: generateCaptchaSvg(code),
      expiresAt,
    });
  } catch (error) {
    return res.status(500).json({
      error: '获取校验码失败',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const db = await getDbOrReconnect();
  if (!db) {
    return res.status(503).json(mongoUnavailableResponse());
  }
  const { username, password, captchaId, captchaCode } = req.body || {};
  const normalizedUsername = typeof username === 'string' ? username.trim() : '';
  const normalizedPassword = typeof password === 'string' ? password : '';
  const normalizedCaptchaId = typeof captchaId === 'string' ? captchaId.trim() : '';
  const normalizedCaptchaCode = typeof captchaCode === 'string' ? captchaCode.trim().toUpperCase() : '';

  if (!normalizedUsername) {
    return res.status(400).json({ error: '用户名不能为空', code: 'USERNAME_REQUIRED' });
  }
  if (normalizedUsername.length < 3 || normalizedUsername.length > 32) {
    return res.status(400).json({ error: '用户名长度需在 3-32 个字符之间', code: 'USERNAME_INVALID' });
  }
  if (!normalizedPassword || normalizedPassword.length < 6) {
    return res.status(400).json({ error: '密码至少为 6 位', code: 'PASSWORD_TOO_SHORT' });
  }
  if (!normalizedCaptchaId || !normalizedCaptchaCode) {
    return res.status(400).json({ error: '校验码不能为空', code: 'CAPTCHA_REQUIRED' });
  }

  try {
    const captchaRecord = await db.collection(AUTH_CAPTCHAS_COLLECTION).findOne({ _id: normalizedCaptchaId });
    if (!captchaRecord || new Date(captchaRecord.expiresAt).getTime() <= Date.now()) {
      return res.status(400).json({ error: '校验码无效或已过期', code: 'CAPTCHA_INVALID' });
    }
    const captchaCandidate = hashToken(`${captchaRecord.salt}:${normalizedCaptchaCode}`);
    const captchaPassed = compareHashHex(captchaCandidate, captchaRecord.codeHash);
    await db.collection(AUTH_CAPTCHAS_COLLECTION).deleteOne({ _id: normalizedCaptchaId });
    if (!captchaPassed) {
      return res.status(400).json({ error: '校验码错误', code: 'CAPTCHA_INCORRECT' });
    }

    const existedUser = await db.collection(USERS_COLLECTION).findOne({ username: normalizedUsername });
    if (existedUser) {
      return res.status(409).json({ error: '用户已存在', code: 'USER_ALREADY_EXISTS' });
    }
    const now = new Date();
    const insertResult = await db.collection(USERS_COLLECTION).insertOne({
      username: normalizedUsername,
      passwordHash: hashPassword(normalizedPassword),
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const token = await createSession(db, insertResult.insertedId);
    res.setHeader('Set-Cookie', buildSessionCookie(token));
    return res.json({
      user: {
        id: insertResult.insertedId,
        username: normalizedUsername,
        lastLoginAt: now,
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: '注册失败',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const db = await getDbOrReconnect();
  if (!db) {
    return res.status(503).json(mongoUnavailableResponse());
  }
  const { username, password } = req.body || {};
  const normalizedUsername = typeof username === 'string' ? username.trim() : '';
  const normalizedPassword = typeof password === 'string' ? password : '';

  if (!normalizedUsername || !normalizedPassword) {
    return res.status(400).json({ error: '用户名和密码不能为空', code: 'LOGIN_FIELDS_REQUIRED' });
  }

  try {
    const user = await db.collection(USERS_COLLECTION).findOne({ username: normalizedUsername });
    if (!user) {
      return res.status(404).json({ error: '用户不存在', code: 'USER_NOT_FOUND' });
    }
    const isPasswordCorrect = verifyPassword(normalizedPassword, user.passwordHash);
    if (!isPasswordCorrect) {
      return res.status(401).json({ error: '密码错误', code: 'PASSWORD_INCORRECT' });
    }
    const now = new Date();
    await db.collection(USERS_COLLECTION).updateOne(
      { _id: user._id },
      { $set: { lastLoginAt: now, updatedAt: now } }
    );
    const token = await createSession(db, user._id);
    res.setHeader('Set-Cookie', buildSessionCookie(token));
    return res.json({
      user: {
        id: user._id,
        username: user.username,
        lastLoginAt: now,
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: '登录失败',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  return res.json({ user: req.auth.user });
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  const db = await getDbOrReconnect();
  if (!db) {
    return res.status(503).json(mongoUnavailableResponse());
  }
  try {
    await db.collection(USER_SESSIONS_COLLECTION).deleteOne({ _id: req.auth.sessionId });
    res.setHeader('Set-Cookie', buildClearSessionCookie());
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({
      error: '退出登录失败',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get('/api/requests-state', requireAuth, async (req, res) => {
  const db = await getDbOrReconnect();
  if (!db) {
    return res.status(503).json(mongoUnavailableResponse());
  }
  try {
    const userDocId = getUserStateDocId(req);
    const existing = await db.collection(REQUEST_STATE_COLLECTION).findOne({ _id: userDocId });
    const fallbackExisting = existing || await db.collection(REQUEST_STATE_COLLECTION).findOne({ _id: REQUEST_STATE_DOC_ID });
    if (!fallbackExisting) {
      return res.json({ requests: [], selectedRequestId: null });
    }
    const { requests, selectedRequestId } = normalizeRequestState(fallbackExisting);
    return res.json({ requests, selectedRequestId });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load request state',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.put('/api/requests-state', requireAuth, async (req, res) => {
  const db = await getDbOrReconnect();
  if (!db) {
    return res.status(503).json(mongoUnavailableResponse());
  }
  try {
    const normalized = normalizeRequestState(req.body || {});
    const userDocId = getUserStateDocId(req);
    await db.collection(REQUEST_STATE_COLLECTION).updateOne(
      { _id: userDocId },
      {
        $set: {
          ...normalized,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );
    res.json({ ok: true, count: normalized.requests.length });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to save request state',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get('/api/requests', requireAuth, async (req, res) => {
  const db = await getDbOrReconnect();
  if (!db) {
    return res.status(503).json(mongoUnavailableResponse());
  }
  try {
    const userDocId = getUserStateDocId(req);
    const existing = await db.collection(REQUEST_STATE_COLLECTION).findOne({ _id: userDocId });
    const fallbackExisting = existing || await db.collection(REQUEST_STATE_COLLECTION).findOne({ _id: REQUEST_STATE_DOC_ID });
    const { requests } = normalizeRequestState(fallbackExisting || {});
    res.json({ requests });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to query requests',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get('/api/workflows-state', requireAuth, async (req, res) => {
  const db = await getDbOrReconnect();
  if (!db) {
    return res.status(503).json(mongoUnavailableResponse());
  }
  try {
    const userDocId = getUserStateDocId(req);
    const existing = await db.collection(WORKFLOW_STATE_COLLECTION).findOne({ _id: userDocId });
    if (!existing) {
      return res.json({ workflows: [], selectedWorkflowId: null });
    }
    const { workflows, selectedWorkflowId } = normalizeWorkflowState(existing);
    return res.json({ workflows, selectedWorkflowId });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to load workflow state',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.put('/api/workflows-state', requireAuth, async (req, res) => {
  const db = await getDbOrReconnect();
  if (!db) {
    return res.status(503).json(mongoUnavailableResponse());
  }
  try {
    const normalized = normalizeWorkflowState(req.body || {});
    const userDocId = getUserStateDocId(req);
    await db.collection(WORKFLOW_STATE_COLLECTION).updateOne(
      { _id: userDocId },
      {
        $set: {
          ...normalized,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );
    return res.json({ ok: true, count: normalized.workflows.length });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to save workflow state',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get('/api/admin/stats', requireAuth, async (req, res) => {
  const db = await getDbOrReconnect();
  if (!db) {
    return res.status(503).json(mongoUnavailableResponse());
  }
  try {
    const [requestAgg, workflowAgg] = await Promise.all([
      db.collection(REQUEST_STATE_COLLECTION).aggregate([
        { $match: { _id: { $ne: REQUEST_STATE_DOC_ID } } },
        { $project: { itemCount: { $size: { $ifNull: ['$requests', []] } } } },
        { $group: { _id: null, total: { $sum: '$itemCount' }, docCount: { $sum: 1 } } },
      ]).toArray(),
      db.collection(WORKFLOW_STATE_COLLECTION).aggregate([
        { $project: { itemCount: { $size: { $ifNull: ['$workflows', []] } } } },
        { $group: { _id: null, total: { $sum: '$itemCount' } } },
      ]).toArray(),
    ]);

    let totalRequests = requestAgg[0]?.total || 0;
    // Backward compatibility: if only legacy global request doc exists, use it.
    if ((requestAgg[0]?.docCount || 0) === 0) {
      const legacyAgg = await db.collection(REQUEST_STATE_COLLECTION).aggregate([
        { $project: { itemCount: { $size: { $ifNull: ['$requests', []] } } } },
        { $group: { _id: null, total: { $sum: '$itemCount' } } },
      ]).toArray();
      totalRequests = legacyAgg[0]?.total || 0;
    }

    const totalWorkflows = workflowAgg[0]?.total || 0;
    const totalItems = totalRequests + totalWorkflows;
    return res.json({
      totalRequests,
      totalWorkflows,
      ratio: {
        requests: totalItems > 0 ? totalRequests / totalItems : 0,
        workflows: totalItems > 0 ? totalWorkflows / totalItems : 0,
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to load admin stats',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.all('/api/proxy', requireAuth, async (req, res) => {
  const { url, method = 'GET', headers = {}, body = null, params = {} } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    let targetUrl = url;
    
    if (Object.keys(params).length > 0) {
      const urlObj = new URL(url);
      Object.entries(params).forEach(([key, value]) => {
        if (value) {
          urlObj.searchParams.append(key, String(value));
        }
      });
      targetUrl = urlObj.toString();
    }

    const lib = targetUrl.startsWith('https') ? https : http;
    
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'HTTP-Request-Builder-v1.0',
        ...headers
      }
    };

    if (body && method !== 'GET' && method !== 'HEAD') {
      options.headers['Content-Type'] = 'application/json';
    }

    const proxyReq = lib.request(targetUrl, options, (proxyRes) => {
      const chunks = [];
      proxyRes.on('data', (chunk) => chunks.push(chunk));
      proxyRes.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const rawText = buffer.toString('utf8');
        let data = rawText;
        try {
          data = JSON.parse(rawText);
        } catch (e) {
          // keep raw text
        }
        res.status(proxyRes.statusCode || 200).json({
          status: proxyRes.statusCode || 200,
          headers: proxyRes.headers || {},
          data,
        });
      });
    }).on('error', (err) => {
      console.error('Proxy Error:', err);
      res.status(500).json({ error: 'Proxy request failed', details: err.message });
    });

    if (body) {
      proxyReq.write(JSON.stringify(body));
    }
    proxyReq.end();
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Proxy error', details: error.message });
  }
});

app.all('/api/echo', (req, res) => {
  const { method, body, query, params, originalUrl, headers, hostname } = req;
  res.json({
    method,
    url: originalUrl,
    body,
    query,
    params,
    headers,
    hostname
  });
});

const startServer = async () => {
  const db = await connectMongo();
  if (db) {
    const mongoState = getMongoState();
    try {
      await db.collection(USERS_COLLECTION).createIndex({ username: 1 }, { unique: true });
      await db.collection(USER_SESSIONS_COLLECTION).createIndex({ tokenHash: 1 }, { unique: true });
      await db.collection(USER_SESSIONS_COLLECTION).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      await db.collection(AUTH_CAPTCHAS_COLLECTION).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    } catch (error) {
      console.warn('[mongo] failed to create auth indexes:', error instanceof Error ? error.message : String(error));
    }
    console.log(`[mongo] connected: db=${mongoState.dbName}`);
  } else {
    const mongoState = getMongoState();
    console.warn(`[mongo] not connected: ${mongoState.lastError || 'unknown error'}`);
  }

  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
};

startServer();

const gracefulShutdown = async () => {
  await disconnectMongo();
  process.exit(0);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

export { app, PORT };

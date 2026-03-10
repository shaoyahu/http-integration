import express from 'express';
import cors from 'cors';
import http from 'http';
import https from 'https';
import crypto from 'crypto';
import { ObjectId } from 'mongodb';
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
const USER_IDENTITIES_COLLECTION = 'user_identities';
const PERMISSION_POINTS_COLLECTION = 'permission_points';
const USER_SESSIONS_COLLECTION = 'user_sessions';
const AUTH_CAPTCHAS_COLLECTION = 'auth_captchas';
const SESSION_EXPIRE_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const CAPTCHA_EXPIRE_MS = 5 * 60 * 1000;
const SESSION_COOKIE_NAME = 'http_client_session';
const DEFAULT_INITIAL_PASSWORD = '123456';
const ADMIN_META_CACHE_MS = 15 * 1000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const USER_ROLE = {
  USER: 'user',
  ADMIN: 'admin',
};
const BUILTIN_IDENTITY_ID = {
  USER: 'identity_user',
  ADMIN: 'identity_admin',
};
const USER_PERMISSION = {
  REQUEST_MANAGEMENT: 'request_management',
  WORKFLOW_MANAGEMENT: 'workflow_management',
  ADMIN_PANEL: 'admin_panel',
};
const DEFAULT_USER_PERMISSIONS = [
  USER_PERMISSION.REQUEST_MANAGEMENT,
  USER_PERMISSION.WORKFLOW_MANAGEMENT,
];
const ADMIN_ALL_PERMISSIONS = [
  USER_PERMISSION.REQUEST_MANAGEMENT,
  USER_PERMISSION.WORKFLOW_MANAGEMENT,
  USER_PERMISSION.ADMIN_PANEL,
];
const BUILTIN_IDENTITIES = [
  {
    _id: BUILTIN_IDENTITY_ID.USER,
    name: '普通用户',
    permissions: [...DEFAULT_USER_PERMISSIONS],
  },
  {
    _id: BUILTIN_IDENTITY_ID.ADMIN,
    name: '管理员',
    permissions: [...ADMIN_ALL_PERMISSIONS],
  },
];
const BUILTIN_PERMISSION_POINTS = [
  { _id: USER_PERMISSION.REQUEST_MANAGEMENT, name: '请求管理权限' },
  { _id: USER_PERMISSION.WORKFLOW_MANAGEMENT, name: '工作流管理权限' },
  { _id: USER_PERMISSION.ADMIN_PANEL, name: '管理后台权限' },
];

const ALL_USER_PERMISSIONS = new Set(Object.values(USER_PERMISSION));
const adminMetaCache = {
  identityOverview: { value: null, expiresAt: 0 },
  permissionPoints: { value: null, expiresAt: 0 },
};

const getCachedAdminMeta = (key) => {
  const entry = adminMetaCache[key];
  if (entry && entry.value && entry.expiresAt > Date.now()) {
    return entry.value;
  }
  return null;
};

const setCachedAdminMeta = (key, value) => {
  adminMetaCache[key] = {
    value,
    expiresAt: Date.now() + ADMIN_META_CACHE_MS,
  };
};

const invalidateAdminMetaCache = (...keys) => {
  keys.forEach((key) => {
    if (adminMetaCache[key]) {
      adminMetaCache[key] = { value: null, expiresAt: 0 };
    }
  });
};

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

const normalizePermissions = (permissions, { fallbackToDefault = true } = {}) => {
  if (!Array.isArray(permissions)) {
    return fallbackToDefault ? [...DEFAULT_USER_PERMISSIONS] : [];
  }
  const normalized = permissions
    .filter((permission) => typeof permission === 'string' && ALL_USER_PERMISSIONS.has(permission))
    .filter((permission, index, arr) => arr.indexOf(permission) === index);
  if (normalized.length > 0) {
    return normalized;
  }
  return fallbackToDefault ? [...DEFAULT_USER_PERMISSIONS] : [];
};

const normalizePermissionIds = (permissionIds, { fallbackToDefault = true } = {}) => {
  if (!Array.isArray(permissionIds)) {
    return fallbackToDefault ? [...DEFAULT_USER_PERMISSIONS] : [];
  }
  const normalized = permissionIds
    .filter((permission) => typeof permission === 'string' && permission.trim())
    .map((permission) => permission.trim())
    .filter((permission, index, arr) => arr.indexOf(permission) === index);
  if (normalized.length > 0) {
    return normalized;
  }
  return fallbackToDefault ? [...DEFAULT_USER_PERMISSIONS] : [];
};

const isAdminRoleValue = (role) => role === USER_ROLE.ADMIN || role === 'ADMIN' || role === '管理员';

const deriveRoleFromPermissions = (permissions, explicitRole) => {
  if (isAdminRoleValue(explicitRole)) {
    return USER_ROLE.ADMIN;
  }
  return permissions.includes(USER_PERMISSION.ADMIN_PANEL) ? USER_ROLE.ADMIN : USER_ROLE.USER;
};

const normalizeUserIdentity = (user = {}, options = {}) => {
  if (typeof user.username === 'string' && user.username.trim().toLowerCase() === 'admin') {
    return {
      role: USER_ROLE.ADMIN,
      permissions: [...ADMIN_ALL_PERMISSIONS],
    };
  }
  const basePermissions = normalizePermissions(user.permissions, options);
  const normalizedRole = deriveRoleFromPermissions(basePermissions, user.role);
  if (normalizedRole === USER_ROLE.ADMIN) {
    return {
      role: USER_ROLE.ADMIN,
      permissions: [...ADMIN_ALL_PERMISSIONS],
    };
  }
  return {
    role: USER_ROLE.USER,
    permissions: basePermissions,
  };
};

const normalizeIdentityIds = (identityIds, { fallbackToDefault = true } = {}) => {
  if (!Array.isArray(identityIds)) {
    return fallbackToDefault ? [BUILTIN_IDENTITY_ID.USER] : [];
  }
  const normalized = identityIds
    .filter((id) => typeof id === 'string' && id.trim())
    .map((id) => id.trim())
    .filter((id, index, arr) => arr.indexOf(id) === index);
  if (normalized.length > 0) {
    return normalized;
  }
  return fallbackToDefault ? [BUILTIN_IDENTITY_ID.USER] : [];
};

const resolveIdentityByLegacyUser = (user = {}) => {
  const normalized = normalizeUserIdentity(user);
  if (normalized.role === USER_ROLE.ADMIN) {
    return [BUILTIN_IDENTITY_ID.ADMIN];
  }
  return [BUILTIN_IDENTITY_ID.USER];
};

const resolveUserAccessFromIdentity = async (db, user = {}, options = {}) => {
  const fallbackToDefault = options.fallbackToDefault !== false;
  const legacyIdentityIds = resolveIdentityByLegacyUser(user);
  const requestedIdentityIds = normalizeIdentityIds(user.identityIds, { fallbackToDefault });
  const candidateIdentityIds = requestedIdentityIds.length > 0 ? requestedIdentityIds : legacyIdentityIds;

  const identityDocs = candidateIdentityIds.length > 0
    ? await db.collection(USER_IDENTITIES_COLLECTION).find(
      { _id: { $in: candidateIdentityIds } },
      { projection: { name: 1, permissions: 1 } }
    ).toArray()
    : [];
  const identityMap = new Map(identityDocs.map((item) => [String(item._id), item]));
  let identityIds = candidateIdentityIds.filter((id) => identityMap.has(id));

  if (identityIds.length === 0 && fallbackToDefault) {
    identityIds = [...legacyIdentityIds];
  }

  const fallbackIdentityDocs = await db.collection(USER_IDENTITIES_COLLECTION).find(
    { _id: { $in: identityIds } },
    { projection: { name: 1, permissions: 1 } }
  ).toArray();
  const fallbackIdentityMap = new Map(fallbackIdentityDocs.map((item) => [String(item._id), item]));

  let identities = identityIds
    .map((id) => fallbackIdentityMap.get(id))
    .filter(Boolean)
    .map((identityDoc) => ({
      id: String(identityDoc._id),
      name: typeof identityDoc.name === 'string' ? identityDoc.name : String(identityDoc._id),
      permissions: normalizePermissionIds(identityDoc.permissions, { fallbackToDefault: false }),
    }));

  if (identities.length === 0 && fallbackToDefault) {
    const defaultDoc = await db.collection(USER_IDENTITIES_COLLECTION).findOne(
      { _id: BUILTIN_IDENTITY_ID.USER },
      { projection: { name: 1, permissions: 1 } }
    );
    if (defaultDoc) {
      identities = [{
        id: BUILTIN_IDENTITY_ID.USER,
        name: typeof defaultDoc.name === 'string' ? defaultDoc.name : '普通用户',
        permissions: normalizePermissionIds(defaultDoc.permissions, { fallbackToDefault: true }),
      }];
      identityIds = [BUILTIN_IDENTITY_ID.USER];
    }
  }

  const permissionsSet = new Set(
    identities.flatMap((identity) => normalizePermissionIds(identity.permissions, { fallbackToDefault: false }))
  );
  if (typeof user.username === 'string' && user.username.trim().toLowerCase() === 'admin') {
    identityIds = [BUILTIN_IDENTITY_ID.ADMIN];
    identities = [{
      id: BUILTIN_IDENTITY_ID.ADMIN,
      name: '管理员',
      permissions: [...ADMIN_ALL_PERMISSIONS],
    }];
    ADMIN_ALL_PERMISSIONS.forEach((permission) => permissionsSet.add(permission));
  }
  const permissions = [...permissionsSet];
  const role = permissions.includes(USER_PERMISSION.ADMIN_PANEL) ? USER_ROLE.ADMIN : USER_ROLE.USER;

  if (role === USER_ROLE.ADMIN) {
    return {
      role,
      permissions: [...ADMIN_ALL_PERMISSIONS],
      identityIds: identityIds.includes(BUILTIN_IDENTITY_ID.ADMIN) ? identityIds : [...identityIds, BUILTIN_IDENTITY_ID.ADMIN],
      identities,
    };
  }
  return {
    role,
    permissions,
    identityIds,
    identities,
  };
};

const buildAuthUserPayload = (user = {}, access = null) => {
  const identity = access || normalizeUserIdentity(user);
  const mustChangePassword = verifyPassword(DEFAULT_INITIAL_PASSWORD, user.passwordHash);
  return {
    id: user._id,
    username: user.username,
    nickname: typeof user.nickname === 'string' ? user.nickname : '',
    avatarUrl: typeof user.avatarUrl === 'string' ? user.avatarUrl : '',
    lastLoginAt: user.lastLoginAt || null,
    disabled: Boolean(user.disabled),
    role: identity.role,
    permissions: identity.permissions,
    identities: Array.isArray(identity.identities) ? identity.identities : [],
    mustChangePassword,
  };
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
  folderId: typeof req.folderId === 'string' && req.folderId.trim() ? req.folderId : null,
  isPublic: Boolean(req.isPublic),
});

const normalizeRequestFolder = (folder = {}, index = 0) => ({
  id: typeof folder.id === 'string' && folder.id.trim() ? folder.id : `folder-${Date.now()}-${index}`,
  name: typeof folder.name === 'string' && folder.name.trim() ? folder.name : `文件夹 ${index + 1}`,
  expanded: folder.expanded !== false,
});

const normalizeRequestState = (payload = {}) => {
  const folders = Array.isArray(payload.folders) ? payload.folders.map((folder, index) => normalizeRequestFolder(folder, index)) : [];
  const folderIds = new Set(folders.map((folder) => folder.id));
  const requests = Array.isArray(payload.requests)
    ? payload.requests.map((req, index) => {
      const normalized = normalizeRequest(req, index);
      return {
        ...normalized,
        folderId: normalized.folderId && folderIds.has(normalized.folderId) ? normalized.folderId : null,
      };
    })
    : [];
  const selectedRequestId = typeof payload.selectedRequestId === 'string' ? payload.selectedRequestId : null;
  const safeSelectedRequestId = selectedRequestId && requests.some((req) => req.id === selectedRequestId)
    ? selectedRequestId
    : (requests[0]?.id || null);
  return {
    folders,
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
    if (user.disabled) {
      await db.collection(USER_SESSIONS_COLLECTION).deleteOne({ _id: session._id });
      res.setHeader('Set-Cookie', buildClearSessionCookie());
      return res.status(403).json({ error: '用户已被禁用', code: 'USER_DISABLED' });
    }

    const identity = await resolveUserAccessFromIdentity(db, user);
    if (
      user.role !== identity.role
      || JSON.stringify(user.permissions || []) !== JSON.stringify(identity.permissions)
      || JSON.stringify(normalizeIdentityIds(user.identityIds || [], { fallbackToDefault: false })) !== JSON.stringify(identity.identityIds)
    ) {
      await db.collection(USERS_COLLECTION).updateOne(
        { _id: user._id },
        {
          $set: {
            role: identity.role,
            permissions: identity.permissions,
            identityIds: identity.identityIds,
            updatedAt: new Date(),
          },
        }
      );
    }

    req.auth = {
      tokenHash: session.tokenHash,
      sessionId: session._id,
      user: buildAuthUserPayload(user, identity),
    };
    const lastSessionTouch = session.updatedAt ? new Date(session.updatedAt).getTime() : 0;
    if (Date.now() - lastSessionTouch >= SESSION_TOUCH_INTERVAL_MS) {
      await db.collection(USER_SESSIONS_COLLECTION).updateOne(
        { _id: session._id },
        {
          $set: {
            updatedAt: new Date(),
          },
        }
      );
    }
    return next();
  } catch (error) {
    return res.status(500).json({
      error: 'Authentication failed',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

const requireAnyPermission = (...permissions) => (req, res, next) => {
  const username = typeof req.auth?.user?.username === 'string' ? req.auth.user.username.trim().toLowerCase() : '';
  if (req.auth?.user?.role === USER_ROLE.ADMIN || username === 'admin') {
    return next();
  }
  const userPermissions = Array.isArray(req.auth?.user?.permissions) ? req.auth.user.permissions : [];
  if (permissions.some((permission) => userPermissions.includes(permission))) {
    return next();
  }
  return res.status(403).json({
    error: 'Forbidden',
    code: 'PERMISSION_DENIED',
    requiredPermissions: permissions,
  });
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
    const identity = normalizeUserIdentity({});
    const identityIds = [BUILTIN_IDENTITY_ID.USER];
    const insertResult = await db.collection(USERS_COLLECTION).insertOne({
      username: normalizedUsername,
      passwordHash: hashPassword(normalizedPassword),
      lastLoginAt: now,
      role: identity.role,
      permissions: identity.permissions,
      identityIds,
      disabled: false,
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
        role: identity.role,
        permissions: identity.permissions,
        identities: [{
          id: BUILTIN_IDENTITY_ID.USER,
          name: '普通用户',
          permissions: [...DEFAULT_USER_PERMISSIONS],
        }],
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
    if (user.disabled) {
      return res.status(403).json({ error: '用户已被禁用', code: 'USER_DISABLED' });
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
    const access = await resolveUserAccessFromIdentity(db, user);
    return res.json({
      user: {
        ...buildAuthUserPayload(user, access),
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

app.put('/api/auth/profile', requireAuth, async (req, res) => {
  const db = await getDbOrReconnect();
  if (!db) {
    return res.status(503).json(mongoUnavailableResponse());
  }
  const nickname = typeof req.body?.nickname === 'string' ? req.body.nickname.trim() : null;
  const avatarUrl = typeof req.body?.avatarUrl === 'string' ? req.body.avatarUrl.trim() : null;
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  const isChangingPassword = Boolean(currentPassword || newPassword);
  const isDataImage = typeof avatarUrl === 'string' && avatarUrl.startsWith('data:image/');
  const avatarMaxLength = isDataImage ? 3 * 1024 * 1024 : 2048;

  if (nickname !== null && nickname.length > 32) {
    return res.status(400).json({ error: '昵称长度需在 32 个字符以内', code: 'NICKNAME_TOO_LONG' });
  }
  if (avatarUrl !== null && avatarUrl.length > avatarMaxLength) {
    return res.status(400).json({
      error: isDataImage ? '头像图片过大，请上传更小的图片' : '头像地址长度过长',
      code: 'AVATAR_URL_TOO_LONG',
    });
  }
  if (isChangingPassword) {
    if (!currentPassword) {
      return res.status(400).json({ error: '请输入当前密码', code: 'CURRENT_PASSWORD_REQUIRED' });
    }
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: '新密码至少为 6 位', code: 'NEW_PASSWORD_TOO_SHORT' });
    }
  }
  if (nickname === null && avatarUrl === null && !isChangingPassword) {
    return res.status(400).json({ error: '没有可更新的字段', code: 'NO_PROFILE_UPDATE_FIELDS' });
  }

  try {
    const currentUser = await db.collection(USERS_COLLECTION).findOne({ _id: req.auth.user.id });
    if (!currentUser) {
      return res.status(404).json({ error: '用户不存在', code: 'USER_NOT_FOUND' });
    }
    if (isChangingPassword) {
      const isPasswordCorrect = verifyPassword(currentPassword, currentUser.passwordHash);
      if (!isPasswordCorrect) {
        return res.status(401).json({ error: '当前密码错误', code: 'CURRENT_PASSWORD_INCORRECT' });
      }
    }

    const updates = { updatedAt: new Date() };
    if (nickname !== null) {
      updates.nickname = nickname;
    }
    if (avatarUrl !== null) {
      updates.avatarUrl = avatarUrl;
    }
    if (isChangingPassword) {
      updates.passwordHash = hashPassword(newPassword);
    }

    await db.collection(USERS_COLLECTION).updateOne(
      { _id: req.auth.user.id },
      { $set: updates }
    );

    const refreshedUser = await db.collection(USERS_COLLECTION).findOne({ _id: req.auth.user.id });
    if (!refreshedUser) {
      return res.status(404).json({ error: '用户不存在', code: 'USER_NOT_FOUND' });
    }
    const access = await resolveUserAccessFromIdentity(db, refreshedUser);
    return res.json({ user: buildAuthUserPayload(refreshedUser, access) });
  } catch (error) {
    return res.status(500).json({
      error: '更新个人信息失败',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get('/api/requests-state', requireAuth, requireAnyPermission(USER_PERMISSION.REQUEST_MANAGEMENT), async (req, res) => {
  const db = await getDbOrReconnect();
  if (!db) {
    return res.status(503).json(mongoUnavailableResponse());
  }
  try {
    const userDocId = getUserStateDocId(req);
    const existing = await db.collection(REQUEST_STATE_COLLECTION).findOne({ _id: userDocId });
    if (!existing) {
      return res.json({ requests: [], folders: [], selectedRequestId: null });
    }
    const { requests, folders, selectedRequestId } = normalizeRequestState(existing);
    return res.json({ requests, folders, selectedRequestId });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load request state',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.put('/api/requests-state', requireAuth, requireAnyPermission(USER_PERMISSION.REQUEST_MANAGEMENT), async (req, res) => {
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

app.get('/api/requests', requireAuth, requireAnyPermission(USER_PERMISSION.REQUEST_MANAGEMENT), async (req, res) => {
  const db = await getDbOrReconnect();
  if (!db) {
    return res.status(503).json(mongoUnavailableResponse());
  }
  try {
    const userDocId = getUserStateDocId(req);
    const existing = await db.collection(REQUEST_STATE_COLLECTION).findOne({ _id: userDocId });
    const { requests } = normalizeRequestState(existing || {});
    res.json({ requests });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to query requests',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get('/api/workflow-requests', requireAuth, requireAnyPermission(USER_PERMISSION.WORKFLOW_MANAGEMENT), async (req, res) => {
  const db = await getDbOrReconnect();
  if (!db) {
    return res.status(503).json(mongoUnavailableResponse());
  }
  try {
    const userDocId = getUserStateDocId(req);
    const [currentUserState, allUsers] = await Promise.all([
      db.collection(REQUEST_STATE_COLLECTION).findOne({ _id: userDocId }),
      db.collection(USERS_COLLECTION)
        .find({}, { projection: { username: 1 } })
        .toArray(),
    ]);
    const usernameMap = new Map(allUsers.map((user) => [String(user._id), user.username]));
    const allRequestStates = await db.collection(REQUEST_STATE_COLLECTION)
      .find({ _id: { $ne: REQUEST_STATE_DOC_ID } })
      .toArray();

    const ownRequests = normalizeRequestState(currentUserState || {}).requests.map((request) => ({
      ...request,
      ownerUserId: userDocId,
      ownerUsername: req.auth.user.username,
    }));

    const publicRequests = allRequestStates
      .filter((doc) => String(doc._id) !== userDocId)
      .flatMap((doc) => {
        const ownerUserId = String(doc._id);
        const ownerUsername = usernameMap.get(ownerUserId) || '未知用户';
        return normalizeRequestState(doc).requests
          .filter((request) => request.isPublic)
          .map((request) => ({
            ...request,
            ownerUserId,
            ownerUsername,
          }));
      });

    return res.json({ requests: [...ownRequests, ...publicRequests] });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to load workflow requests',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get('/api/workflows-state', requireAuth, requireAnyPermission(USER_PERMISSION.WORKFLOW_MANAGEMENT), async (req, res) => {
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

app.put('/api/workflows-state', requireAuth, requireAnyPermission(USER_PERMISSION.WORKFLOW_MANAGEMENT), async (req, res) => {
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

app.get('/api/admin/stats', requireAuth, requireAnyPermission(USER_PERMISSION.ADMIN_PANEL), async (req, res) => {
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

const listAdminUsersHandler = async (req, res) => {
  const db = await getDbOrReconnect();
  if (!db) {
    return res.status(503).json(mongoUnavailableResponse());
  }
  try {
    const keyword = typeof req.query?.keyword === 'string' ? req.query.keyword.trim() : '';
    const identityId = typeof req.query?.identityId === 'string' ? req.query.identityId.trim() : '';
    const lastLoginFilter = typeof req.query?.lastLoginFilter === 'string' ? req.query.lastLoginFilter.trim() : 'all';
    const page = Math.max(1, Number.parseInt(String(req.query?.page || '1'), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query?.pageSize || '10'), 10) || 10));
    const identities = await db.collection(USER_IDENTITIES_COLLECTION)
      .find({}, { projection: { name: 1, permissions: 1 } })
      .toArray();
    const identityMap = new Map(identities.map((item) => [String(item._id), item]));
    const users = await db.collection(USERS_COLLECTION)
      .find({}, { projection: { username: 1, role: 1, permissions: 1, identityIds: 1, disabled: 1, lastLoginAt: 1 } })
      .sort({ createdAt: -1 })
      .toArray();
    const allItems = users.map((user) => {
        let identityIds = normalizeIdentityIds(user.identityIds, { fallbackToDefault: false });
        if (identityIds.length === 0) {
          identityIds = resolveIdentityByLegacyUser(user);
        }
        if (typeof user.username === 'string' && user.username.trim().toLowerCase() === 'admin') {
          identityIds = [BUILTIN_IDENTITY_ID.ADMIN];
        }
        const identityNames = identityIds
          .map((id) => identityMap.get(id)?.name)
          .filter(Boolean);
        return {
          id: user._id,
          username: user.username,
          identityIds,
          identities: identityNames,
          disabled: Boolean(user.disabled),
          lastLoginAt: user.lastLoginAt || null,
        };
      });

    const now = Date.now();
    const filteredItems = allItems.filter((user) => {
      const matchesKeyword = !keyword || String(user.username || '').toLowerCase().includes(keyword.toLowerCase());
      const matchesIdentity = !identityId || (Array.isArray(user.identityIds) && user.identityIds.includes(identityId));
      let matchesLastLogin = true;
      if (lastLoginFilter === 'never') {
        matchesLastLogin = !user.lastLoginAt;
      } else if (lastLoginFilter === '7d') {
        matchesLastLogin = Boolean(user.lastLoginAt) && new Date(user.lastLoginAt).getTime() >= now - 7 * 24 * 60 * 60 * 1000;
      } else if (lastLoginFilter === '30d') {
        matchesLastLogin = Boolean(user.lastLoginAt) && new Date(user.lastLoginAt).getTime() >= now - 30 * 24 * 60 * 60 * 1000;
      }
      return matchesKeyword && matchesIdentity && matchesLastLogin;
    });

    const total = filteredItems.length;
    const start = (page - 1) * pageSize;
    const pagedItems = filteredItems.slice(start, start + pageSize);

    return res.json({
      users: pagedItems,
      total,
      page,
      pageSize,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to load admin users',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

const listIdentityOverviewHandler = async (req, res) => {
  const db = await getDbOrReconnect();
  if (!db) {
    return res.status(503).json(mongoUnavailableResponse());
  }
  try {
    const cached = getCachedAdminMeta('identityOverview');
    if (cached) {
      return res.json(cached);
    }
    const identities = await db.collection(USER_IDENTITIES_COLLECTION)
      .find({}, { projection: { name: 1, permissions: 1 } })
      .sort({ createdAt: 1 })
      .toArray();
    const counts = await db.collection(USERS_COLLECTION).aggregate([
      {
        $project: {
          effectiveIdentityIds: {
            $cond: [
              { $eq: [{ $toLower: '$username' }, 'admin'] },
              [BUILTIN_IDENTITY_ID.ADMIN],
              {
                $cond: [
                  { $gt: [{ $size: { $ifNull: ['$identityIds', []] } }, 0] },
                  '$identityIds',
                  {
                    $cond: [
                      {
                        $or: [
                          { $eq: ['$role', USER_ROLE.ADMIN] },
                          { $eq: ['$role', 'ADMIN'] },
                          { $eq: ['$role', '管理员'] },
                          { $in: [USER_PERMISSION.ADMIN_PANEL, { $ifNull: ['$permissions', []] }] },
                        ],
                      },
                      [BUILTIN_IDENTITY_ID.ADMIN],
                      [BUILTIN_IDENTITY_ID.USER],
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      { $unwind: '$effectiveIdentityIds' },
      { $group: { _id: '$effectiveIdentityIds', count: { $sum: 1 } } },
    ]).toArray();
    const countMap = new Map(counts.map((item) => [String(item._id), item.count]));

    const items = identities.map((identityDoc) => ({
      id: String(identityDoc._id),
      name: typeof identityDoc.name === 'string' ? identityDoc.name : String(identityDoc._id),
      permissions: normalizePermissionIds(identityDoc.permissions, { fallbackToDefault: false }),
      userCount: countMap.get(String(identityDoc._id)) || 0,
    }));
    const payload = { identities: items };
    setCachedAdminMeta('identityOverview', payload);
    return res.json(payload);
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to load identities',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

const listPermissionPointsHandler = async (req, res) => {
  const db = await getDbOrReconnect();
  if (!db) {
    return res.status(503).json(mongoUnavailableResponse());
  }
  try {
    const cached = getCachedAdminMeta('permissionPoints');
    if (cached) {
      return res.json(cached);
    }
    const permissions = await db.collection(PERMISSION_POINTS_COLLECTION)
      .find({}, { projection: { name: 1 } })
      .sort({ _id: 1 })
      .toArray();
    const payload = {
      permissions: permissions.map((permission) => ({
        id: String(permission._id),
        name: permission.name || String(permission._id),
      })),
    };
    setCachedAdminMeta('permissionPoints', payload);
    return res.json(payload);
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to load permissions',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

const validatePermissionIds = async (db, permissionIds = []) => {
  if (!Array.isArray(permissionIds) || permissionIds.length === 0) {
    return false;
  }
  const docs = await db.collection(PERMISSION_POINTS_COLLECTION)
    .find({ _id: { $in: permissionIds } }, { projection: { _id: 1 } })
    .toArray();
  return docs.length === permissionIds.length;
};

const createIdentityHandler = async (req, res) => {
  const db = await getDbOrReconnect();
  if (!db) {
    return res.status(503).json(mongoUnavailableResponse());
  }
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const permissionIds = normalizePermissionIds(req.body?.permissionIds, { fallbackToDefault: false });
  if (!name) {
    return res.status(400).json({ error: 'Identity name is required', code: 'IDENTITY_NAME_REQUIRED' });
  }
  if (permissionIds.length === 0) {
    return res.status(400).json({ error: 'Identity permissions are required', code: 'IDENTITY_PERMISSIONS_REQUIRED' });
  }
  try {
    const isValid = await validatePermissionIds(db, permissionIds);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid permissionIds', code: 'INVALID_PERMISSION_IDS' });
    }
    const id = `identity_${crypto.randomBytes(8).toString('hex')}`;
    await db.collection(USER_IDENTITIES_COLLECTION).insertOne({
      _id: id,
      name,
      permissions: permissionIds,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    invalidateAdminMetaCache('identityOverview', 'permissionPoints');
    return res.json({ identity: { id, name, permissions: permissionIds } });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to create identity',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

const updateIdentityHandler = async (req, res) => {
  const db = await getDbOrReconnect();
  if (!db) {
    return res.status(503).json(mongoUnavailableResponse());
  }
  const identityId = typeof req.params.identityId === 'string' ? req.params.identityId.trim() : '';
  if (!identityId) {
    return res.status(400).json({ error: 'Invalid identityId', code: 'INVALID_IDENTITY_ID' });
  }
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const permissionIds = normalizePermissionIds(req.body?.permissionIds, { fallbackToDefault: false });
  if (!name) {
    return res.status(400).json({ error: 'Identity name is required', code: 'IDENTITY_NAME_REQUIRED' });
  }
  if (permissionIds.length === 0) {
    return res.status(400).json({ error: 'Identity permissions are required', code: 'IDENTITY_PERMISSIONS_REQUIRED' });
  }
  try {
    const isValid = await validatePermissionIds(db, permissionIds);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid permissionIds', code: 'INVALID_PERMISSION_IDS' });
    }
    const result = await db.collection(USER_IDENTITIES_COLLECTION).findOneAndUpdate(
      { _id: identityId },
      { $set: { name, permissions: permissionIds, updatedAt: new Date() } },
      { returnDocument: 'after', projection: { name: 1, permissions: 1 } }
    );
    const identity = result?.value || result;
    if (!identity) {
      return res.status(404).json({ error: 'Identity not found', code: 'IDENTITY_NOT_FOUND' });
    }
    invalidateAdminMetaCache('identityOverview', 'permissionPoints');
    return res.json({
      identity: {
        id: String(identity._id),
        name: identity.name,
        permissions: normalizePermissionIds(identity.permissions, { fallbackToDefault: false }),
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to update identity',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

const createAdminUserHandler = async (req, res) => {
  const db = await getDbOrReconnect();
  if (!db) {
    return res.status(503).json(mongoUnavailableResponse());
  }
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  let identityIds = normalizeIdentityIds(req.body?.identityIds, { fallbackToDefault: false });
  if (!username) {
    return res.status(400).json({ error: 'Username is required', code: 'USERNAME_REQUIRED' });
  }
  if (identityIds.length === 0) {
    return res.status(400).json({ error: 'At least one identity is required', code: 'IDENTITY_REQUIRED' });
  }
  try {
    const identities = await db.collection(USER_IDENTITIES_COLLECTION)
      .find({ _id: { $in: identityIds } }, { projection: { _id: 1 } })
      .toArray();
    if (identities.length !== identityIds.length) {
      return res.status(400).json({ error: 'Invalid identityIds', code: 'INVALID_IDENTITY_IDS' });
    }
    const exists = await db.collection(USERS_COLLECTION).findOne({ username });
    if (exists) {
      return res.status(409).json({ error: '用户已存在', code: 'USER_ALREADY_EXISTS' });
    }
    const access = await resolveUserAccessFromIdentity(db, { username, identityIds }, { fallbackToDefault: false });
    const now = new Date();
    const result = await db.collection(USERS_COLLECTION).insertOne({
      username,
      passwordHash: hashPassword(DEFAULT_INITIAL_PASSWORD),
      identityIds: access.identityIds,
      role: access.role,
      permissions: access.permissions,
      disabled: false,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    });
    invalidateAdminMetaCache('identityOverview');
    return res.json({
      user: {
        id: result.insertedId,
        username,
        identityIds: access.identityIds,
        identities: access.identities.map((item) => item.name),
        disabled: false,
        lastLoginAt: null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to create user',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

const updateAdminUserStatusHandler = async (req, res) => {
  const db = await getDbOrReconnect();
  if (!db) {
    return res.status(503).json(mongoUnavailableResponse());
  }
  const rawUserId = typeof req.params.userId === 'string' ? req.params.userId.trim() : '';
  if (!ObjectId.isValid(rawUserId)) {
    return res.status(400).json({ error: 'Invalid userId', code: 'INVALID_USER_ID' });
  }
  const disabled = Boolean(req.body?.disabled);
  const userObjectId = new ObjectId(rawUserId);
  try {
    const existingUser = await db.collection(USERS_COLLECTION).findOne(
      { _id: userObjectId },
      { projection: { username: 1 } }
    );
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    }
    if (typeof existingUser.username === 'string' && existingUser.username.trim().toLowerCase() === 'admin' && disabled) {
      return res.status(400).json({ error: 'admin 用户禁止被禁用', code: 'ADMIN_CANNOT_BE_DISABLED' });
    }

    const result = await db.collection(USERS_COLLECTION).findOneAndUpdate(
      { _id: userObjectId },
      { $set: { disabled, updatedAt: new Date() } },
      { returnDocument: 'after', projection: { username: 1, identityIds: 1, disabled: 1, lastLoginAt: 1 } }
    );
    const user = result?.value || result;
    if (!user) {
      return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    }
    const access = await resolveUserAccessFromIdentity(db, user, { fallbackToDefault: true });
    invalidateAdminMetaCache('identityOverview');
    return res.json({
      user: {
        id: user._id,
        username: user.username,
        identityIds: access.identityIds,
        identities: access.identities.map((item) => item.name),
        disabled: Boolean(user.disabled),
        lastLoginAt: user.lastLoginAt || null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to update user status',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

const updateAdminUserIdentitiesHandler = async (req, res) => {
  const db = await getDbOrReconnect();
  if (!db) {
    return res.status(503).json(mongoUnavailableResponse());
  }
  const rawUserId = typeof req.params.userId === 'string' ? req.params.userId.trim() : '';
  if (!ObjectId.isValid(rawUserId)) {
    return res.status(400).json({ error: 'Invalid userId', code: 'INVALID_USER_ID' });
  }
  const userObjectId = new ObjectId(rawUserId);
  const identityIds = normalizeIdentityIds(req.body?.identityIds, { fallbackToDefault: false });
  if (identityIds.length === 0) {
    return res.status(400).json({ error: 'At least one identity is required', code: 'IDENTITY_REQUIRED' });
  }
  try {
    const currentUser = await db.collection(USERS_COLLECTION).findOne(
      { _id: userObjectId },
      { projection: { username: 1, identityIds: 1, disabled: 1, lastLoginAt: 1 } }
    );
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    }
    if (
      typeof currentUser.username === 'string'
      && currentUser.username.trim().toLowerCase() === 'admin'
      && !identityIds.includes(BUILTIN_IDENTITY_ID.ADMIN)
    ) {
      return res.status(400).json({ error: 'admin 用户不能移除管理员身份', code: 'ADMIN_IDENTITY_REQUIRED' });
    }

    const identities = await db.collection(USER_IDENTITIES_COLLECTION)
      .find({ _id: { $in: identityIds } }, { projection: { _id: 1 } })
      .toArray();
    if (identities.length !== identityIds.length) {
      return res.status(400).json({ error: 'Invalid identityIds', code: 'INVALID_IDENTITY_IDS' });
    }

    const access = await resolveUserAccessFromIdentity(
      db,
      { username: currentUser.username, identityIds },
      { fallbackToDefault: false }
    );

    const result = await db.collection(USERS_COLLECTION).findOneAndUpdate(
      { _id: userObjectId },
      {
        $set: {
          identityIds: access.identityIds,
          role: access.role,
          permissions: access.permissions,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after', projection: { username: 1, identityIds: 1, disabled: 1, lastLoginAt: 1 } }
    );
    const updatedUser = result?.value || result;
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    }
    invalidateAdminMetaCache('identityOverview');
    return res.json({
      user: {
        id: updatedUser._id,
        username: updatedUser.username,
        identityIds: access.identityIds,
        identities: access.identities.map((item) => item.name),
        disabled: Boolean(updatedUser.disabled),
        lastLoginAt: updatedUser.lastLoginAt || null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to update user identities',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

const updateUserPermissionsHandler = async (req, res) => {
  const db = await getDbOrReconnect();
  if (!db) {
    return res.status(503).json(mongoUnavailableResponse());
  }
  const rawUserId = typeof req.params.userId === 'string' ? req.params.userId.trim() : '';
  if (!ObjectId.isValid(rawUserId)) {
    return res.status(400).json({ error: 'Invalid userId', code: 'INVALID_USER_ID' });
  }
  const userObjectId = new ObjectId(rawUserId);
  try {
    const currentUser = await db.collection(USERS_COLLECTION).findOne(
      { _id: userObjectId },
      { projection: { username: 1, role: 1, permissions: 1, identityIds: 1 } }
    );
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    }
    const currentIdentity = await resolveUserAccessFromIdentity(db, currentUser);
    const requestedPermissions = normalizePermissions(req.body?.permissions, { fallbackToDefault: false });
    if (currentIdentity.role === USER_ROLE.ADMIN && !requestedPermissions.includes(USER_PERMISSION.ADMIN_PANEL)) {
      return res.status(400).json({
        error: '管理员必须保留管理后台权限',
        code: 'ADMIN_PANEL_PERMISSION_REQUIRED',
      });
    }
    const identityIds = requestedPermissions.includes(USER_PERMISSION.ADMIN_PANEL)
      ? [BUILTIN_IDENTITY_ID.ADMIN]
      : [BUILTIN_IDENTITY_ID.USER];
    const identity = await resolveUserAccessFromIdentity(
      db,
      {
        username: currentUser.username,
        identityIds,
      },
      { fallbackToDefault: false }
    );

    const result = await db.collection(USERS_COLLECTION).findOneAndUpdate(
      { _id: userObjectId },
      {
        $set: {
          role: identity.role,
          permissions: identity.permissions,
          identityIds: identity.identityIds,
          updatedAt: new Date(),
        },
      },
      {
        returnDocument: 'after',
        projection: { username: 1, role: 1, permissions: 1, lastLoginAt: 1, createdAt: 1 },
      }
    );
    const user = result?.value || result;
    if (!user) return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    invalidateAdminMetaCache('identityOverview');
    return res.json({
      user: {
        id: user._id,
        username: user.username,
        role: identity.role,
        permissions: identity.permissions,
        identities: identity.identities || [],
        lastLoginAt: user.lastLoginAt || null,
        createdAt: user.createdAt || null,
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to update user permissions',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

app.get('/api/admin/user-permissions', requireAuth, requireAnyPermission(USER_PERMISSION.ADMIN_PANEL), listAdminUsersHandler);
app.put('/api/admin/user-permissions/:userId', requireAuth, requireAnyPermission(USER_PERMISSION.ADMIN_PANEL), updateUserPermissionsHandler);
app.get('/api/admin/users', requireAuth, requireAnyPermission(USER_PERMISSION.ADMIN_PANEL), listAdminUsersHandler);
app.put('/api/admin/users/:userId', requireAuth, requireAnyPermission(USER_PERMISSION.ADMIN_PANEL), updateUserPermissionsHandler);
app.post('/api/admin/users', requireAuth, requireAnyPermission(USER_PERMISSION.ADMIN_PANEL), createAdminUserHandler);
app.put('/api/admin/users/:userId/identities', requireAuth, requireAnyPermission(USER_PERMISSION.ADMIN_PANEL), updateAdminUserIdentitiesHandler);
app.put('/api/admin/users/:userId/status', requireAuth, requireAnyPermission(USER_PERMISSION.ADMIN_PANEL), updateAdminUserStatusHandler);
app.get('/api/admin/identities', requireAuth, requireAnyPermission(USER_PERMISSION.ADMIN_PANEL), listIdentityOverviewHandler);
app.post('/api/admin/identities', requireAuth, requireAnyPermission(USER_PERMISSION.ADMIN_PANEL), createIdentityHandler);
app.put('/api/admin/identities/:identityId', requireAuth, requireAnyPermission(USER_PERMISSION.ADMIN_PANEL), updateIdentityHandler);
app.get('/api/admin/permissions', requireAuth, requireAnyPermission(USER_PERMISSION.ADMIN_PANEL), listPermissionPointsHandler);
// Backward-compatible aliases to avoid 404 when client/server versions are mismatched.
app.get('/api/user-permissions', requireAuth, requireAnyPermission(USER_PERMISSION.ADMIN_PANEL), listAdminUsersHandler);
app.put('/api/user-permissions/:userId', requireAuth, requireAnyPermission(USER_PERMISSION.ADMIN_PANEL), updateUserPermissionsHandler);
app.get('/api/users', requireAuth, requireAnyPermission(USER_PERMISSION.ADMIN_PANEL), listAdminUsersHandler);
app.put('/api/users/:userId', requireAuth, requireAnyPermission(USER_PERMISSION.ADMIN_PANEL), updateUserPermissionsHandler);

app.all('/api/proxy', requireAuth, requireAnyPermission(USER_PERMISSION.REQUEST_MANAGEMENT, USER_PERMISSION.WORKFLOW_MANAGEMENT), async (req, res) => {
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
      await Promise.all(BUILTIN_PERMISSION_POINTS.map((permission) =>
        db.collection(PERMISSION_POINTS_COLLECTION).updateOne(
          { _id: permission._id },
          {
            $set: { name: permission.name, updatedAt: new Date() },
            $setOnInsert: { createdAt: new Date() },
          },
          { upsert: true }
        )
      ));
      await Promise.all(BUILTIN_IDENTITIES.map((identity) =>
        db.collection(USER_IDENTITIES_COLLECTION).updateOne(
          { _id: identity._id },
          {
            $set: {
              name: identity.name,
              permissions: identity.permissions,
              updatedAt: new Date(),
            },
            $setOnInsert: {
              createdAt: new Date(),
            },
          },
          { upsert: true }
        )
      ));
      await db.collection(USERS_COLLECTION).createIndex({ username: 1 }, { unique: true });
      await db.collection(USER_SESSIONS_COLLECTION).createIndex({ tokenHash: 1 }, { unique: true });
      await db.collection(USER_SESSIONS_COLLECTION).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      await db.collection(AUTH_CAPTCHAS_COLLECTION).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      await db.collection(USERS_COLLECTION).updateOne(
        { username: 'admin' },
        {
          $set: {
            role: USER_ROLE.ADMIN,
            permissions: [...ADMIN_ALL_PERMISSIONS],
            identityIds: [BUILTIN_IDENTITY_ID.ADMIN],
            updatedAt: new Date(),
          },
        }
      );
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

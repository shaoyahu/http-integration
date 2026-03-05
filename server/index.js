import express from 'express';
import cors from 'cors';
import http from 'http';
import https from 'https';
import 'dotenv/config';
import { connectMongo, getDb, getMongoState, disconnectMongo } from './mongo.js';

const app = express();
const PORT = process.env.PORT || 4573;

app.use(cors());

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

app.get('/api/requests-state', async (req, res) => {
  const db = await getDbOrReconnect();
  if (!db) {
    return res.status(503).json(mongoUnavailableResponse());
  }
  try {
    const existing = await db.collection(REQUEST_STATE_COLLECTION).findOne({ _id: REQUEST_STATE_DOC_ID });
    if (!existing) {
      return res.json({ requests: [], selectedRequestId: null });
    }
    const { requests, selectedRequestId } = normalizeRequestState(existing);
    return res.json({ requests, selectedRequestId });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to load request state',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.put('/api/requests-state', async (req, res) => {
  const db = await getDbOrReconnect();
  if (!db) {
    return res.status(503).json(mongoUnavailableResponse());
  }
  try {
    const normalized = normalizeRequestState(req.body || {});
    await db.collection(REQUEST_STATE_COLLECTION).updateOne(
      { _id: REQUEST_STATE_DOC_ID },
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

app.get('/api/requests', async (req, res) => {
  const db = await getDbOrReconnect();
  if (!db) {
    return res.status(503).json(mongoUnavailableResponse());
  }
  try {
    const existing = await db.collection(REQUEST_STATE_COLLECTION).findOne({ _id: REQUEST_STATE_DOC_ID });
    const { requests } = normalizeRequestState(existing || {});
    res.json({ requests });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to query requests',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

app.all('/api/proxy', async (req, res) => {
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

import express from 'express';
import cors from 'cors';
import http from 'http';
import https from 'https';

const app = express();
const PORT = process.env.PORT || 4573;

app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'HTTP Request Builder API is running!' });
});

app.get('/api/requests', (req, res) => {
  res.json({
    endpoints: [
      { 
        id: 1,
        method: "GET",
        url: "https://jsonplaceholder.typicode.com/posts",
        status: 200
      }
    ]
  });
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
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      proxyRes.pipe(res);
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

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

export { app, PORT };
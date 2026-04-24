const DEFAULT_PROXY_USER_AGENT = 'HTTP-Request-Builder-v1.0';

const hasHeader = (headers = {}, headerName = '') => Object.keys(headers).some(
  (key) => key.toLowerCase() === headerName.toLowerCase()
);

export const serializeProxyRequestBody = (body) => {
  if (body === null || body === undefined) {
    return null;
  }
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    return body;
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  if (typeof body === 'object') {
    return JSON.stringify(body);
  }
  return String(body);
};

export const buildProxyRequestOptions = ({ method = 'GET', headers = {}, body = null } = {}) => {
  const nextHeaders = headers && typeof headers === 'object' ? { ...headers } : {};
  const canSendBody = method !== 'GET' && method !== 'HEAD';
  const serializedBody = canSendBody ? serializeProxyRequestBody(body) : null;

  if (!hasHeader(nextHeaders, 'user-agent')) {
    nextHeaders['User-Agent'] = DEFAULT_PROXY_USER_AGENT;
  }

  if (
    serializedBody !== null
    && typeof body === 'object'
    && !Buffer.isBuffer(body)
    && !(body instanceof Uint8Array)
    && !hasHeader(nextHeaders, 'content-type')
  ) {
    nextHeaders['Content-Type'] = 'application/json';
  }

  return {
    method,
    headers: nextHeaders,
    body: serializedBody,
  };
};


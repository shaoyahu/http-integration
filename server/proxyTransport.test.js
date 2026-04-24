import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProxyRequestOptions } from './proxyTransport.js';

test('buildProxyRequestOptions preserves an explicit content type', () => {
  const options = buildProxyRequestOptions({
    method: 'POST',
    headers: {
      'Content-Type': 'application/xml',
    },
    body: { ok: true },
  });

  assert.equal(options.headers['Content-Type'], 'application/xml');
  assert.equal(options.body, '{"ok":true}');
});

test('buildProxyRequestOptions defaults structured bodies to JSON', () => {
  const options = buildProxyRequestOptions({
    method: 'POST',
    body: { ok: true },
  });

  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.equal(options.body, '{"ok":true}');
});

test('buildProxyRequestOptions keeps string bodies untouched', () => {
  const options = buildProxyRequestOptions({
    method: 'POST',
    body: 'raw-body',
  });

  assert.equal(options.body, 'raw-body');
  assert.equal('Content-Type' in options.headers, false);
});

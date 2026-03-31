import test from 'node:test';
import assert from 'node:assert/strict';
import { isBlockedHostname, isPrivateOrLocalIp } from './proxySecurity.js';

test('isBlockedHostname blocks localhost variants', () => {
  assert.equal(isBlockedHostname('localhost'), true);
  assert.equal(isBlockedHostname('api.localhost'), true);
  assert.equal(isBlockedHostname('127.0.0.1'), true);
  assert.equal(isBlockedHostname('example.com'), false);
});

test('isPrivateOrLocalIp blocks private, loopback and link-local ipv4 ranges', () => {
  assert.equal(isPrivateOrLocalIp('10.0.0.8'), true);
  assert.equal(isPrivateOrLocalIp('127.0.0.1'), true);
  assert.equal(isPrivateOrLocalIp('169.254.169.254'), true);
  assert.equal(isPrivateOrLocalIp('172.20.10.5'), true);
  assert.equal(isPrivateOrLocalIp('192.168.1.10'), true);
  assert.equal(isPrivateOrLocalIp('8.8.8.8'), false);
});

test('isPrivateOrLocalIp blocks loopback and unique-local ipv6 ranges', () => {
  assert.equal(isPrivateOrLocalIp('::1'), true);
  assert.equal(isPrivateOrLocalIp('fc00::1'), true);
  assert.equal(isPrivateOrLocalIp('fd12:3456:789a::1'), true);
  assert.equal(isPrivateOrLocalIp('fe80::1'), true);
  assert.equal(isPrivateOrLocalIp('::ffff:127.0.0.1'), true);
  assert.equal(isPrivateOrLocalIp('2001:4860:4860::8888'), false);
});

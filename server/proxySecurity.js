import net from 'net';
import { lookup } from 'node:dns/promises';

const normalizeIpv6MappedIpv4 = (ip) => {
  if (typeof ip !== 'string') {
    return '';
  }
  const normalized = ip.trim().toLowerCase();
  if (!normalized.startsWith('::ffff:')) {
    return normalized;
  }
  return normalized.slice('::ffff:'.length);
};

export const isBlockedHostname = (hostname = '') => {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized === '127.0.0.1'
    || normalized === '0.0.0.0'
    || normalized === '::1'
  );
};

export const isPrivateOrLocalIp = (ip) => {
  const normalized = normalizeIpv6MappedIpv4(ip);
  const family = net.isIP(normalized);
  if (!family) {
    return false;
  }

  if (family === 4) {
    const [first, second] = normalized.split('.').map((segment) => Number.parseInt(segment, 10));
    return (
      first === 0
      || first === 10
      || first === 127
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168)
    );
  }

  return (
    normalized === '::'
    || normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe80:')
  );
};

export const resolveHostnameAddresses = async (hostname) => {
  const result = await lookup(hostname, { all: true });
  return result.map((item) => item.address);
};

export const findBlockedResolvedAddress = async (hostname) => {
  const addresses = await resolveHostnameAddresses(hostname);
  return addresses.find((address) => isPrivateOrLocalIp(address)) || null;
};

export const applyPathMapping = (url: string, key: string, value: string) => {
  const token = `{${key}}`;
  const colonToken = `:${key}`;
  if (url.includes(token)) {
    return url.split(token).join(encodeURIComponent(value));
  }
  if (url.includes(colonToken)) {
    return url.split(colonToken).join(encodeURIComponent(value));
  }
  return url;
};

export const setNestedValue = (target: Record<string, any>, path: string, value: any) => {
  const segments = path.split('.').filter(Boolean);
  if (segments.length === 0) return;
  let cursor = target;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i];
    if (!cursor[key] || typeof cursor[key] !== 'object') {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[segments[segments.length - 1]] = value;
};

export const parseBodyValue = (value: any) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed === '') return '';
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch (e) {
      return value;
    }
  }
  return value;
};

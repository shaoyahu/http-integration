export const formatResponseData = (data: unknown): string => {
  if (data === null || data === undefined) {
    return '';
  }

  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      if (typeof parsed === 'object' && parsed !== null) {
        return JSON.stringify(parsed, null, 2);
      }
    } catch {
      return data;
    }
    return data;
  }

  if (typeof data === 'object') {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }

  return String(data);
};

export const parseResponseData = (data: unknown): unknown => {
  if (data === null || data === undefined) return null;
  if (typeof data === 'object') return data;
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed;
      }
    } catch {
      return null;
    }
  }
  return null;
};

export function validateObject(config, fields) {
  const errors = [];
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return ['config must be an object'];
  }

  for (const [field, rule] of Object.entries(fields)) {
    const value = config[field];
    if (rule.required && (value === undefined || value === null || value === '')) {
      errors.push(`missing required field: ${field}`);
      continue;
    }
    if (value !== undefined && rule.type && typeof value !== rule.type) {
      errors.push(`${field} must be a ${rule.type}`);
    }
  }
  return errors;
}

export function requireApiKey(config, errors) {
  if (!config?.api_key) errors.push('missing required field: api_key');
}
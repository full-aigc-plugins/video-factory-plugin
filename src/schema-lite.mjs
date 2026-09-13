const SUPPORTED = new Set([
  '$schema', '$id', 'title', 'description', 'type', 'properties', 'required',
  'additionalProperties', 'items', 'enum', 'const', 'minimum', 'maximum',
  'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern',
]);

export function assertSupportedSchema(schema, path = '$') {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return;
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED.has(key)) throw new Error(`${path}: unsupported schema keyword ${key}`);
  }
  for (const [name, child] of Object.entries(schema.properties ?? {})) assertSupportedSchema(child, `${path}.properties.${name}`);
  if (schema.items) assertSupportedSchema(schema.items, `${path}.items`);
}

const actualType = (value) => Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;

export function validateSchemaInstance(schema, value, path = '$') {
  const issues = [];
  const fail = (message) => issues.push({ path, message });
  if (schema.const !== undefined && value !== schema.const) fail(`must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) fail(`must be one of ${schema.enum.join(', ')}`);
  const observed = actualType(value);
  const typeMatches = schema.type === 'integer' ? observed === 'number' : observed === schema.type;
  if (schema.type && !typeMatches) {
    fail(`must be ${schema.type}`);
    return issues;
  }
  if (schema.type === 'object') {
    for (const key of schema.required ?? []) if (!(key in value)) issues.push({ path: `${path}.${key}`, message: 'is required' });
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!(key in (schema.properties ?? {}))) issues.push({ path: `${path}.${key}`, message: 'additional property is not allowed' });
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (key in value) issues.push(...validateSchemaInstance(child, value[key], `${path}.${key}`));
    }
  }
  if (schema.type === 'array') {
    if (schema.minItems !== undefined && value.length < schema.minItems) fail(`must contain at least ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) fail(`must contain at most ${schema.maxItems} items`);
    value.forEach((item, index) => issues.push(...validateSchemaInstance(schema.items, item, `${path}[${index}]`)));
  }
  if (schema.type === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) fail(`must have length >= ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) fail(`must have length <= ${schema.maxLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail(`must match ${schema.pattern}`);
  }
  if (schema.type === 'number' || schema.type === 'integer') {
    if (schema.type === 'integer' && !Number.isInteger(value)) fail('must be integer');
    if (schema.minimum !== undefined && value < schema.minimum) fail(`must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) fail(`must be <= ${schema.maximum}`);
  }
  return issues;
}

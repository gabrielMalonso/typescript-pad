export const formatValue = (
  value: unknown,
  nested = false,
  seen = new WeakSet<object>(),
  depth = 0,
): string => {
  if (typeof value === 'string') return nested ? JSON.stringify(value) : value;
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'function') return `[Function${value.name ? `: ${value.name}` : ''}]`;
  if (value === null || typeof value !== 'object') return String(value);
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString();
  if (value instanceof RegExp) return value.toString();
  if (seen.has(value)) return '[Circular]';
  if (depth >= 5) return Array.isArray(value) ? '[Array]' : '[Object]';
  seen.add(value);
  const child = (item: unknown) => formatValue(item, true, seen, depth + 1);
  let result: string;
  if (Array.isArray(value)) {
    result = `[${value.slice(0, 100).map(child).join(', ')}${value.length > 100 ? ', …' : ''}]`;
  } else if (value instanceof Map) {
    result = `Map(${value.size}) {${Array.from(value)
      .slice(0, 100)
      .map(([key, item]) => `${child(key)} => ${child(item)}`)
      .join(', ')}}`;
  } else if (value instanceof Set) {
    result = `Set(${value.size}) {${Array.from(value).slice(0, 100).map(child).join(', ')}}`;
  } else {
    const keys = Object.keys(value);
    result = `{${keys
      .slice(0, 100)
      .map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return `${key}: ${descriptor && 'value' in descriptor ? child(descriptor.value) : '[Getter]'}`;
      })
      .join(', ')}${keys.length > 100 ? ', …' : ''}}`;
  }
  seen.delete(value);
  return result;
};

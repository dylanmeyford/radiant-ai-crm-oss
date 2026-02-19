type JSONSafe =
  | null
  | string
  | number
  | boolean
  | JSONSafe[]
  | { [key: string]: JSONSafe };

/**
 * Serializes arbitrary Mastra workflow run data into a JSON-safe structure so it can be
 * persisted in Mongo without hitting BSON circular reference errors.
 *
 * - Preserves every enumerable field (including nested arrays/objects)
 * - Converts Dates, ObjectIds, Buffers, and Errors into JSON-friendly shapes
 * - Removes functions/symbols/undefined values
 * - Adds "[Circular]" markers when cycles are detected
 */
export function serializeWorkflowRun(run: any): JSONSafe {
  const traversalStack = new WeakSet();

  const serialize = (value: any): JSONSafe | undefined => {
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }

    if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
      return undefined;
    }

    if (typeof value === 'bigint') {
      return Number(value);
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
      return value.toString('base64');
    }

    // Handle Mongo ObjectId instances without importing mongoose
    if (value?._bsontype === 'ObjectID' && typeof value.toString === 'function') {
      return value.toString();
    }

    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack ?? null
      };
    }

    if (Array.isArray(value)) {
      if (traversalStack.has(value)) {
        return '[Circular]';
      }

      traversalStack.add(value);
      const serializedArray = value.reduce<JSONSafe[]>((acc, item) => {
        const serializedItem = serialize(item);
        if (serializedItem !== undefined) {
          acc.push(serializedItem);
        }
        return acc;
      }, []);
      traversalStack.delete(value);
      return serializedArray;
    }

    if (typeof value === 'object') {
      if (traversalStack.has(value)) {
        return '[Circular]';
      }

      traversalStack.add(value);

      // Respect custom toJSON implementations (e.g., Mongoose documents)
      if (typeof value.toJSON === 'function') {
        try {
          const jsonValue = value.toJSON();
          traversalStack.delete(value);
          return serialize(jsonValue);
        } catch {
          // Fall through to plain serialization if toJSON throws
        }
      }

      const serializedObject: { [key: string]: JSONSafe } = {};
      for (const [key, val] of Object.entries(value)) {
        const serialized = serialize(val);
        if (serialized !== undefined) {
          serializedObject[key] = serialized;
        }
      }

      traversalStack.delete(value);
      return serializedObject;
    }

    // Fallback: coerce to string
    return String(value);
  };

  return serialize(run) ?? null;
}


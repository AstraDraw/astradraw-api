/**
 * Utility for filtering API response fields based on query parameters.
 *
 * This allows clients to request only the fields they need, reducing payload size.
 *
 * Usage:
 * ```typescript
 * const ALLOWED_FIELDS = ['id', 'name', 'email'] as const;
 *
 * @Get('users')
 * async listUsers(@Query('fields') fieldsParam?: string) {
 *   const fields = parseFields(fieldsParam, ALLOWED_FIELDS);
 *   const users = await this.service.list();
 *   return users.map(u => filterResponse(this.toResponse(u), fields));
 * }
 * ```
 *
 * Client request:
 * GET /users?fields=id,name
 *
 * Response will only include { id, name } for each user.
 */

/**
 * Parse a comma-separated fields parameter into a Set of valid field names.
 *
 * @param fieldsParam - Comma-separated string of field names (e.g., "id,name,email")
 * @param allowedFields - Array of allowed field names for validation
 * @returns Set of valid field names, or null if no filtering should be applied
 *
 * @example
 * const fields = parseFields("id,name,invalid", ['id', 'name', 'email']);
 * // Returns Set { 'id', 'name' } - 'invalid' is ignored
 *
 * @example
 * const fields = parseFields(undefined, ['id', 'name']);
 * // Returns null - no filtering, return all fields
 */
export function parseFields<T extends string>(
  fieldsParam: string | undefined,
  allowedFields: readonly T[],
): Set<T> | null {
  if (!fieldsParam || fieldsParam.trim() === '') {
    return null; // No filtering - return all fields
  }

  const requested = fieldsParam
    .split(',')
    .map((f) => f.trim())
    .filter((f) => f.length > 0);

  const valid = requested.filter((f) => allowedFields.includes(f as T)) as T[];

  return valid.length > 0 ? new Set(valid) : null;
}

/**
 * Filter a response object to include only the specified fields.
 *
 * @param data - The full response object
 * @param fields - Set of field names to include, or null to return all fields
 * @returns Filtered object containing only the requested fields
 *
 * @example
 * const user = { id: '1', name: 'John', email: 'john@example.com', password: 'hash' };
 * const filtered = filterResponse(user, new Set(['id', 'name']));
 * // Returns { id: '1', name: 'John' }
 *
 * @example
 * const filtered = filterResponse(user, null);
 * // Returns the full user object unchanged
 */
export function filterResponse<T extends object>(
  data: T,
  fields: Set<string> | null,
): Partial<T> {
  if (!fields) {
    return data; // No filtering - return full object
  }

  const filtered: Partial<T> = {};
  for (const field of fields) {
    if (field in data) {
      filtered[field as keyof T] = data[field as keyof T];
    }
  }
  return filtered;
}

/**
 * Filter an array of response objects to include only the specified fields.
 *
 * @param dataArray - Array of response objects
 * @param fields - Set of field names to include, or null to return all fields
 * @returns Array of filtered objects
 */
export function filterResponseArray<T extends object>(
  dataArray: T[],
  fields: Set<string> | null,
): Partial<T>[] {
  if (!fields) {
    return dataArray;
  }
  return dataArray.map((item) => filterResponse(item, fields));
}

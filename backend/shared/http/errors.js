// ============================================================================
// API error type
//
// Routes throw ApiError; the error handler in app.js renders it. This keeps
// every failure response the same shape as the existing 404 handler, and means
// a route never has to remember to `return` after res.status(...).json(...).
// ============================================================================

export class ApiError extends Error {
  /**
   * @param {number} status  HTTP status code
   * @param {string} code    stable machine-readable identifier for clients
   * @param {string} message human-readable explanation
   * @param {object} [extra] optional extra fields, e.g. { details: [...] }
   */
  constructor(status, code, message, extra) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.extra = extra;
  }

  toJSON() {
    return { status: 'error', code: this.code, error: this.message, ...this.extra };
  }
}

export const badRequest = (code, message, extra) => new ApiError(400, code, message, extra);
export const unauthorized = (code, message) => new ApiError(401, code, message);
export const forbidden = (code, message) => new ApiError(403, code, message);
export const notFound = (code, message) => new ApiError(404, code, message);
export const conflict = (code, message, extra) => new ApiError(409, code, message, extra);

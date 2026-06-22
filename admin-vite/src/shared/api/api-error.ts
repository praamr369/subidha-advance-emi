export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isUnauthorized() {
    return this.status === 401;
  }

  get isForbidden() {
    return this.status === 403;
  }

  get isNotFound() {
    return this.status === 404;
  }

  get isValidation() {
    return this.status === 400;
  }

  get fieldErrors(): Record<string, string[]> {
    if (
      this.status === 400 &&
      typeof this.body === "object" &&
      this.body !== null
    ) {
      const result: Record<string, string[]> = {};
      for (const [key, value] of Object.entries(
        this.body as Record<string, unknown>
      )) {
        if (Array.isArray(value)) {
          result[key] = value.map(String);
        } else if (typeof value === "string") {
          result[key] = [value];
        }
      }
      return result;
    }
    return {};
  }
}

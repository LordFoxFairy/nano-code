export enum ConfigErrorCode {
  INVALID_JSON = 'INVALID_JSON',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  UNSUPPORTED_PROVIDER_TYPE = 'UNSUPPORTED_PROVIDER_TYPE',
  PROVIDER_NOT_FOUND = 'PROVIDER_NOT_FOUND',
  MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',
  ENV_VAR_NOT_SET = 'ENV_VAR_NOT_SET',
  INVALID_ROUTE_FORMAT = 'INVALID_ROUTE_FORMAT',
}

export class ConfigError extends Error {
  public readonly code: ConfigErrorCode;
  public readonly suggestion?: string;

  constructor(message: string, code: ConfigErrorCode, suggestion?: string) {
    super(message);
    this.name = 'ConfigError';
    this.code = code;
    this.suggestion = suggestion;

    // Restore prototype chain for instanceof checks
    Object.setPrototypeOf(this, ConfigError.prototype);
  }
}

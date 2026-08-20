import { validateEnvironment } from './env.validation';

describe('Environment Validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should validate successfully in development mode with local fallbacks', () => {
    process.env.NODE_ENV = 'development';
    const env = validateEnvironment();
    expect(env.NODE_ENV).toBe('development');
    expect(env.JWT_ACCESS_SECRET).toBeDefined();
    expect(env.JWT_REFRESH_SECRET).toBeDefined();
  });

  it('should throw error in production if DATABASE_URL is missing', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;
    process.env.JWT_ACCESS_SECRET = 'a_very_strong_random_secret_that_is_32_characters_long_123';
    process.env.JWT_REFRESH_SECRET = 'another_strong_random_secret_that_is_32_chars_long_456';

    expect(() => validateEnvironment()).toThrow(
      'Startup validation failed: Missing required environment variable: DATABASE_URL',
    );
  });

  it('should throw error in production if JWT_ACCESS_SECRET is missing', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    delete process.env.JWT_ACCESS_SECRET;
    process.env.JWT_REFRESH_SECRET = 'another_strong_random_secret_that_is_32_chars_long_456';

    expect(() => validateEnvironment()).toThrow(
      'Startup validation failed: Missing required environment variable: JWT_ACCESS_SECRET',
    );
  });

  it('should throw error in production if JWT_ACCESS_SECRET is too short (< 32 chars)', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.JWT_ACCESS_SECRET = 'short_secret';
    process.env.JWT_REFRESH_SECRET = 'another_strong_random_secret_that_is_32_chars_long_456';

    expect(() => validateEnvironment()).toThrow(
      'Startup validation failed: JWT_ACCESS_SECRET must be at least 32 characters in production',
    );
  });

  it('should throw error in production if JWT secrets contain insecure placeholders', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.JWT_ACCESS_SECRET = 'change-me_this_is_a_very_long_insecure_placeholder_123';
    process.env.JWT_REFRESH_SECRET = 'another_strong_random_secret_that_is_32_chars_long_456';

    expect(() => validateEnvironment()).toThrow(
      'Startup validation failed: Insecure placeholder detected in JWT_ACCESS_SECRET',
    );
  });

  it('should throw error in production if JWT_ACCESS_SECRET and JWT_REFRESH_SECRET are identical', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    const sameSecret = 'same_super_strong_random_secret_that_is_32_chars_long_789';
    process.env.JWT_ACCESS_SECRET = sameSecret;
    process.env.JWT_REFRESH_SECRET = sameSecret;

    expect(() => validateEnvironment()).toThrow(
      'Startup validation failed: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must not be identical',
    );
  });

  it('should pass in production with valid, distinct 32+ character secrets', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.JWT_ACCESS_SECRET = 'super_secret_access_token_key_production_random_123456';
    process.env.JWT_REFRESH_SECRET = 'super_secret_refresh_token_key_production_random_789012';
    process.env.FRONTEND_URL = 'https://app.teachflow.vn';

    const env = validateEnvironment();
    expect(env.NODE_ENV).toBe('production');
    expect(env.FRONTEND_URL).toBe('https://app.teachflow.vn');
  });
});

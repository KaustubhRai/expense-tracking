const { loadConfig } = require('../src/config');

describe('loadConfig', () => {
  const REQUIRED_KEYS = [
    'GEMINI_API_KEY',
    'GOOGLE_SHEETS_ID',
    'GOOGLE_SERVICE_ACCOUNT_KEY_PATH',
    'TARGET_GROUP_JID',
    'ALERT_EMAIL',
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASS',
  ];

  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    REQUIRED_KEYS.forEach(k => { process.env[k] = 'test-value'; });
    process.env.HEALTH_PORT = '3000';
  });

  afterEach(() => {
    Object.keys(process.env).forEach(k => {
      if (!(k in originalEnv)) delete process.env[k];
    });
    Object.assign(process.env, originalEnv);
  });

  it('returns config object when all keys are present', () => {
    const config = loadConfig();
    expect(config.geminiApiKey).toBe('test-value');
    expect(config.sheetsId).toBe('test-value');
    expect(config.healthPort).toBe(3000);
  });

  it('throws when a required key is missing', () => {
    delete process.env.GEMINI_API_KEY;
    expect(() => loadConfig()).toThrow('GEMINI_API_KEY');
  });

  it('defaults healthPort to 3000 when HEALTH_PORT not set', () => {
    delete process.env.HEALTH_PORT;
    const config = loadConfig();
    expect(config.healthPort).toBe(3000);
  });
});

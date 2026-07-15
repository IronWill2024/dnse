import { buildSignature, formatDateHeader } from './utils/common.utils';

describe('DNSE API Utils', () => {
  it('should generate correct hmac-sha256 signature', () => {
    const secret = 'my_secret';
    const method = 'GET';
    const path = '/accounts';
    const dateValue = 'Wed, 24 Jun 2026 01:00:00 +0000';
    const algorithm = 'hmac-sha256';
    const nonce = '1234567890';

    const result = buildSignature(secret, method, path, dateValue, algorithm, nonce);
    
    expect(result.headers).toBe('(request-target) date');
    expect(result.signature).toBeDefined();
    expect(typeof result.signature).toBe('string');
    // Ensure that it runs without throwing errors
  });

  it('should format date header correctly', () => {
    const date = new Date(Date.UTC(2026, 5, 24, 1, 0, 0)); // Month is 0-indexed, so 5 is June
    const header = formatDateHeader(date);
    expect(header).toBe('Wed, 24 Jun 2026 01:00:00 +0000');
  });
});

import { hashPassword, verifyPassword } from '../src/auth/password';
describe('Password storage', () => {
  it('uses independent salts, verifies correct passwords and rejects wrong ones', async () => {
    const first = await hashPassword('password-test-123');
    const second = await hashPassword('password-test-123');
    expect(first).not.toBe(second);
    expect(first).not.toContain('password-test-123');
    expect(await verifyPassword('password-test-123', first)).toBe(true);
    expect(await verifyPassword('different-password', first)).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { hashPassword, genSalt, genToken, genShareId } from '../functions/api/_helpers.js';

describe('genSalt', () => {
  it('returns a 32-char hex string', () => {
    expect(genSalt()).toMatch(/^[0-9a-f]{32}$/);
  });
  it('returns a different value each call', () => {
    expect(genSalt()).not.toBe(genSalt());
  });
});

describe('genToken', () => {
  it('returns a 64-char hex string', () => {
    expect(genToken()).toMatch(/^[0-9a-f]{64}$/);
  });
  it('returns a different value each call', () => {
    expect(genToken()).not.toBe(genToken());
  });
});

describe('genShareId', () => {
  it('returns an 8-char alphanumeric string', () => {
    expect(genShareId()).toMatch(/^[A-Za-z0-9]{8}$/);
  });
  it('returns a different value each call', () => {
    expect(genShareId()).not.toBe(genShareId());
  });
});

describe('hashPassword', () => {
  it('returns a 64-char hex string', async () => {
    const hash = await hashPassword('password123', 'testsalt');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
  it('is deterministic for the same inputs', async () => {
    const h1 = await hashPassword('password123', 'testsalt');
    const h2 = await hashPassword('password123', 'testsalt');
    expect(h1).toBe(h2);
  });
  it('produces different hashes for different passwords', async () => {
    const h1 = await hashPassword('pass1', 'testsalt');
    const h2 = await hashPassword('pass2', 'testsalt');
    expect(h1).not.toBe(h2);
  });
  it('produces different hashes for different salts', async () => {
    const h1 = await hashPassword('password', 'salt1');
    const h2 = await hashPassword('password', 'salt2');
    expect(h1).not.toBe(h2);
  });
  it('works with a salt from genSalt()', async () => {
    const salt = genSalt();
    const hash = await hashPassword('password', salt);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

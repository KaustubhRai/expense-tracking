const { shouldProcess } = require('../src/filters');

const TARGET_JID = 'test-group@g.us';

function makeMessage(overrides = {}) {
  return {
    fromMe: false,
    type: 'chat',
    body: 'milk 20',
    from: TARGET_JID,
    ...overrides,
  };
}

describe('shouldProcess', () => {
  it('returns true for a valid expense message', () => {
    expect(shouldProcess(makeMessage(), TARGET_JID)).toBe(true);
  });

  it('returns true when message is fromMe (user sends to their own group)', () => {
    expect(shouldProcess(makeMessage({ fromMe: true }), TARGET_JID)).toBe(true);
  });

  it('returns false when message type is not chat', () => {
    expect(shouldProcess(makeMessage({ type: 'image' }), TARGET_JID)).toBe(false);
    expect(shouldProcess(makeMessage({ type: 'audio' }), TARGET_JID)).toBe(false);
    expect(shouldProcess(makeMessage({ type: 'sticker' }), TARGET_JID)).toBe(false);
  });

  it('returns false when message body is empty', () => {
    expect(shouldProcess(makeMessage({ body: '' }), TARGET_JID)).toBe(false);
    expect(shouldProcess(makeMessage({ body: null }), TARGET_JID)).toBe(false);
  });

  it('returns false when message body exceeds 500 characters', () => {
    expect(shouldProcess(makeMessage({ body: 'a'.repeat(501) }), TARGET_JID)).toBe(false);
  });

  it('returns true when message body is exactly 500 characters', () => {
    expect(shouldProcess(makeMessage({ body: 'a'.repeat(500) }), TARGET_JID)).toBe(true);
  });

  it('returns false when message is from wrong group', () => {
    expect(shouldProcess(makeMessage({ from: 'other-group@g.us' }), TARGET_JID)).toBe(false);
  });
});

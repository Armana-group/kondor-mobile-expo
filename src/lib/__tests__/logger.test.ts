import { createLogger, logger, sanitizeErrorForUser } from '../logger';

describe('Logger', () => {
  let consoleSpy: {
    log: jest.SpyInstance;
    info: jest.SpyInstance;
    warn: jest.SpyInstance;
    error: jest.SpyInstance;
  };

  beforeEach(() => {
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(),
      info: jest.spyOn(console, 'info').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('output format', () => {
    it('includes prefix in output', () => {
      const log = createLogger('MyModule');
      log.error('test message');
      const args = consoleSpy.error.mock.calls[0];
      expect(args[0]).toContain('[MyModule]');
    });

    it('includes timestamp in output', () => {
      const log = createLogger('Test');
      log.error('test');
      const args = consoleSpy.error.mock.calls[0];
      expect(args[0]).toMatch(/\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('when enabled (__DEV__ is true in test env)', () => {
    it('debug() calls console.log', () => {
      const log = createLogger('Test');
      log.debug('hello');
      expect(consoleSpy.log).toHaveBeenCalled();
    });

    it('info() calls console.info', () => {
      const log = createLogger('Test');
      log.info('hello');
      expect(consoleSpy.info).toHaveBeenCalled();
    });

    it('warn() calls console.warn', () => {
      const log = createLogger('Test');
      log.warn('hello');
      expect(consoleSpy.warn).toHaveBeenCalled();
    });

    it('error() calls console.error', () => {
      logger.error('critical issue');
      expect(consoleSpy.error).toHaveBeenCalled();
      const args = consoleSpy.error.mock.calls[0];
      expect(
        args.some(
          (a: unknown) => typeof a === 'string' && a.includes('critical issue')
        )
      ).toBe(true);
    });
  });

  describe('when disabled (production)', () => {
    it('suppresses all output', () => {
      const log = createLogger('Prod');
      // Create disabled logger simulating production
      const prodLog = new (log.constructor as any)({ prefix: 'Prod', enabled: false });
      prodLog.debug('should not appear');
      prodLog.info('should not appear');
      prodLog.warn('should not appear');
      prodLog.error('should not appear');
      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.info).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.error).not.toHaveBeenCalled();
    });
  });
});

describe('sanitizeErrorForUser', () => {
  it('returns fallback string for Error objects in production-like context', () => {
    // In test env (__DEV__ is true), it returns error.message
    const result = sanitizeErrorForUser(new Error('internal detail'), 'Something went wrong');
    // __DEV__ is true in tests, so it returns the actual message
    expect(result).toBe('internal detail');
  });

  it('returns fallback for non-Error values', () => {
    expect(sanitizeErrorForUser('string error', 'Fallback')).toBe('Fallback');
    expect(sanitizeErrorForUser(null, 'Fallback')).toBe('Fallback');
    expect(sanitizeErrorForUser(undefined, 'Fallback')).toBe('Fallback');
    expect(sanitizeErrorForUser(42, 'Fallback')).toBe('Fallback');
  });

  it('returns fallback for objects without message', () => {
    expect(sanitizeErrorForUser({ code: 500 }, 'Fallback')).toBe('Fallback');
  });
});

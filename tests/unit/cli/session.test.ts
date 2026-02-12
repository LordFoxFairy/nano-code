// tests/unit/cli/session.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Session } from '../../../src/cli/session';

vi.mock('fs-extra');

describe('Session', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should create a new session with default values', () => {
        const session = new Session();
        expect(session.id).toBeDefined();
        expect(session.threadId).toBeDefined();
        expect(session.mode).toBe('sonnet'); // default
        expect(session.messages).toEqual([]);
    });

    it('should generate unique IDs', () => {
        const s1 = new Session();
        const s2 = new Session();
        expect(s1.id).not.toBe(s2.id);
        expect(s1.threadId).not.toBe(s2.threadId);
    });

    it('should add messages', () => {
        const session = new Session();
        session.addMessage({ role: 'user', content: 'hello' });
        expect(session.messages).toHaveLength(1);
        expect(session.messages[0]).toEqual({ role: 'user', content: 'hello' });
    });

    it('should clear session', async () => {
        const session = new Session();
        session.addMessage({ role: 'user', content: 'hello' });
        const oldThreadId = session.threadId;

        await session.clear();

        expect(session.messages).toHaveLength(0);
        expect(session.threadId).not.toBe(oldThreadId);
    });

    it('should handle session lifecycle events', async () => {
        const session = new Session();
        const startHandler = vi.fn();
        const clearHandler = vi.fn();
        const endHandler = vi.fn();

        session.on('start', startHandler);
        session.on('clear', clearHandler);
        session.on('end', endHandler);

        await session.start();
        expect(startHandler).toHaveBeenCalledWith(
            expect.objectContaining({ event: 'start', session })
        );

        await session.clear();
        expect(clearHandler).toHaveBeenCalledWith(
            expect.objectContaining({ event: 'clear', session })
        );

        await session.end();
        expect(endHandler).toHaveBeenCalledWith(
            expect.objectContaining({ event: 'end', session })
        );
    });

    it('should support metadata', () => {
        const session = new Session();
        session.setMetadata('workingDir', '/test');
        expect(session.getMetadata('workingDir')).toBe('/test');
        expect(session.getMetadata('nonexistent')).toBeUndefined();
    });

    it('should set mode', () => {
        const session = new Session();
        session.setMode('opus');
        expect(session.mode).toBe('opus');
    });
});

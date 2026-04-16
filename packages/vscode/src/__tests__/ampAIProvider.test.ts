import { describe, it, expect, vi, beforeEach } from 'vitest';
import './setup';

describe('AmpAIProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export AmpAIProvider class', async () => {
    const { AmpAIProvider } = await import('../providers/ampAIProvider');
    expect(AmpAIProvider).toBeDefined();
    expect(typeof AmpAIProvider).toBe('function');
  });

  it('should export isAmpCliAvailable function', async () => {
    const { isAmpCliAvailable } = await import('../providers/ampAIProvider');
    expect(isAmpCliAvailable).toBeDefined();
    expect(typeof isAmpCliAvailable).toBe('function');
  });

  it('should export ampParallelReview function', async () => {
    const { ampParallelReview } = await import('../providers/ampAIProvider');
    expect(ampParallelReview).toBeDefined();
    expect(typeof ampParallelReview).toBe('function');
  });

  it('should construct with default smart mode', async () => {
    const { AmpAIProvider } = await import('../providers/ampAIProvider');
    const provider = new AmpAIProvider();
    expect(provider).toBeDefined();
  });

  it('should construct with explicit mode', async () => {
    const { AmpAIProvider } = await import('../providers/ampAIProvider');
    const rush = new AmpAIProvider('rush');
    const deep = new AmpAIProvider('deep');
    const smart = new AmpAIProvider('smart');
    expect(rush).toBeDefined();
    expect(deep).toBeDefined();
    expect(smart).toBeDefined();
  });

  it('mock rawReview should return empty array string', async () => {
    const { AmpAIProvider } = await import('../providers/ampAIProvider');
    const provider = new (AmpAIProvider as any)();
    const result = await provider.rawReview('test prompt');
    expect(result).toBe('[]');
  });

  it('mock ampParallelReview should return empty Map', async () => {
    const { ampParallelReview } = await import('../providers/ampAIProvider');
    const results = await ampParallelReview(
      [{ key: 'file.ts', prompt: 'test' }],
      'smart',
    );
    expect(results).toBeInstanceOf(Map);
    expect(results.size).toBe(0);
  });
});

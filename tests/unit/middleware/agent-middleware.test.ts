import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIMessage, SystemMessage, HumanMessage } from '@langchain/core/messages';
import {
  createNanoCodeMiddleware,
  getUsageStats,
  resetUsageStats,
  formatUsageStats,
  formatCompactUsage,
  approximateTokenCount,
  MODEL_PRICING,
  onUsageUpdate,
  getUsageTracker,
  type UsageStats,
} from '../../../src/middleware/agent-middleware.js';

describe('Agent Middleware', () => {
  beforeEach(() => {
    resetUsageStats();
  });

  describe('createNanoCodeMiddleware', () => {
    it('should create middleware with default config', () => {
      const middleware = createNanoCodeMiddleware();
      expect(middleware.name).toBe('nanocode');
    });

    it('should create middleware with token tracking enabled', () => {
      const middleware = createNanoCodeMiddleware({
        enableTokenTracking: true,
      });
      expect(middleware.name).toBe('nanocode');
      expect(middleware.wrapModelCall).toBeDefined();
    });

    it('should create middleware with cost tracking enabled', () => {
      const middleware = createNanoCodeMiddleware({
        enableCostTracking: true,
      });
      expect(middleware.wrapModelCall).toBeDefined();
    });

    it('should create middleware with summarization config', () => {
      const middleware = createNanoCodeMiddleware({
        summarization: {
          maxTokens: 100000,
          keepLastN: 10,
        },
      });
      expect(middleware.beforeModel).toBeDefined();
    });

    it('should not create hooks when all features disabled', () => {
      const middleware = createNanoCodeMiddleware({
        enableTokenTracking: false,
        enableCostTracking: false,
      });
      expect(middleware.wrapModelCall).toBeUndefined();
      expect(middleware.wrapToolCall).toBeUndefined();
      expect(middleware.beforeModel).toBeUndefined();
    });
  });

  describe('wrapModelCall', () => {
    it('should track token usage from model response', async () => {
      const onUsageUpdateCallback = vi.fn();
      const middleware = createNanoCodeMiddleware({
        enableTokenTracking: true,
        onUsageUpdate: onUsageUpdateCallback,
      });

      const mockResponse = new AIMessage({
        content: 'Hello!',
      });
      // Add usage_metadata to response
      (mockResponse as AIMessage & { usage_metadata: unknown }).usage_metadata = {
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
      };

      const mockHandler = vi.fn().mockResolvedValue(mockResponse);
      const mockRequest = {
        model: {},
        messages: [],
        tools: [],
        state: { messages: [] },
        runtime: {},
      };

      // @ts-expect-error Mocking partial request
      await middleware.wrapModelCall!(mockRequest, mockHandler);

      expect(mockHandler).toHaveBeenCalled();
      expect(onUsageUpdateCallback).toHaveBeenCalled();

      const stats = onUsageUpdateCallback.mock.calls[0][0] as UsageStats;
      expect(stats.totalInputTokens).toBe(100);
      expect(stats.totalOutputTokens).toBe(50);
      expect(stats.totalTokens).toBe(150);
      expect(stats.modelCalls).toBe(1);
    });

    it('should track cache usage', async () => {
      const middleware = createNanoCodeMiddleware({
        enableTokenTracking: true,
      });

      const mockResponse = new AIMessage({ content: 'Hi' });
      (mockResponse as AIMessage & { usage_metadata: unknown }).usage_metadata = {
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
        input_token_details: {
          cache_read: 80,
          cache_creation: 20,
        },
      };

      const mockHandler = vi.fn().mockResolvedValue(mockResponse);
      // @ts-expect-error Mocking partial request
      await middleware.wrapModelCall!({ messages: [], tools: [], state: { messages: [] }, runtime: {} }, mockHandler);

      const stats = getUsageStats();
      expect(stats.cacheReadTokens).toBe(80);
      expect(stats.cacheWriteTokens).toBe(20);
    });

    it('should call onBeforeModel callback', async () => {
      const onBeforeModel = vi.fn();
      const middleware = createNanoCodeMiddleware({
        enableTokenTracking: true,
        onBeforeModel,
      });

      const mockMessages = [new HumanMessage({ content: 'test' })];
      const mockHandler = vi.fn().mockResolvedValue(new AIMessage({ content: 'response' }));

      // @ts-expect-error Mocking partial request
      await middleware.wrapModelCall!(
        { messages: mockMessages, tools: [], state: { messages: [] }, runtime: {} },
        mockHandler,
      );

      expect(onBeforeModel).toHaveBeenCalledWith(mockMessages);
    });

    it('should call onAfterModel callback with usage', async () => {
      const onAfterModel = vi.fn();
      const middleware = createNanoCodeMiddleware({
        onAfterModel,
      });

      const mockResponse = new AIMessage({ content: 'response' });
      (mockResponse as AIMessage & { usage_metadata: unknown }).usage_metadata = {
        input_tokens: 10,
        output_tokens: 5,
        total_tokens: 15,
      };

      const mockHandler = vi.fn().mockResolvedValue(mockResponse);
      // @ts-expect-error Mocking partial request
      await middleware.wrapModelCall!(
        { messages: [], tools: [], state: { messages: [] }, runtime: {} },
        mockHandler,
      );

      expect(onAfterModel).toHaveBeenCalledWith(mockResponse, mockResponse.usage_metadata);
    });
  });

  describe('wrapToolCall', () => {
    it('should track tool calls', async () => {
      const onToolCall = vi.fn();
      const middleware = createNanoCodeMiddleware({
        enableTokenTracking: true,
        onToolCall,
      });

      const mockHandler = vi.fn().mockResolvedValue('tool result');
      const mockRequest = {
        toolCall: { name: 'TestTool', args: { arg1: 'value' } },
        tool: {},
        state: { messages: [] },
        runtime: {},
      };

      // @ts-expect-error Mocking partial request
      await middleware.wrapToolCall!(mockRequest, mockHandler);

      expect(mockHandler).toHaveBeenCalled();
      expect(onToolCall).toHaveBeenCalledWith('TestTool', { arg1: 'value' }, 'tool result');

      const stats = getUsageStats();
      expect(stats.toolCalls).toBe(1);
    });
  });

  describe('beforeModel (summarization)', () => {
    it('should not summarize when under token limit', async () => {
      const middleware = createNanoCodeMiddleware({
        summarization: {
          maxTokens: 100000,
          keepLastN: 5,
        },
      });

      const messages = [
        new HumanMessage({ content: 'Short message' }),
        new AIMessage({ content: 'Short reply' }),
      ];

      const result = await middleware.beforeModel!(
        { messages },
        {},
      );

      expect(result).toBeUndefined();
    });

    it('should return summarized messages when over limit', async () => {
      const middleware = createNanoCodeMiddleware({
        summarization: {
          maxTokens: 10, // Very low limit to trigger summarization
          keepLastN: 1,
          tokenCounter: async () => 1000, // Force high token count
        },
      });

      const messages = [
        new HumanMessage({ content: 'Old message 1' }),
        new AIMessage({ content: 'Old reply 1' }),
        new HumanMessage({ content: 'Old message 2' }),
        new AIMessage({ content: 'Old reply 2' }),
        new HumanMessage({ content: 'Recent message' }),
      ];

      const result = await middleware.beforeModel!(
        { messages },
        {},
      );

      expect(result).toBeDefined();
      expect(result?.messages).toBeDefined();
      // Should have summary message + kept messages
      expect(result?.messages?.length).toBe(2); // 1 summary + 1 kept
      expect(result?.messages?.[0]).toBeInstanceOf(SystemMessage);
    });
  });

  describe('Cost Calculation', () => {
    it('should calculate cost based on Claude Sonnet pricing', async () => {
      const middleware = createNanoCodeMiddleware({
        enableCostTracking: true,
        pricing: MODEL_PRICING['claude-sonnet-4'],
      });

      const mockResponse = new AIMessage({ content: 'test' });
      (mockResponse as AIMessage & { usage_metadata: unknown }).usage_metadata = {
        input_tokens: 1_000_000, // 1M tokens
        output_tokens: 500_000,  // 0.5M tokens
        total_tokens: 1_500_000,
      };

      const mockHandler = vi.fn().mockResolvedValue(mockResponse);
      // @ts-expect-error Mocking partial request
      await middleware.wrapModelCall!(
        { messages: [], tools: [], state: { messages: [] }, runtime: {} },
        mockHandler,
      );

      const stats = getUsageStats();
      // Input: $3/1M * 1M = $3
      // Output: $15/1M * 0.5M = $7.5
      // Total: $10.5
      expect(stats.estimatedCost).toBeCloseTo(10.5, 1);
    });

    it('should calculate cost with cache pricing', async () => {
      const middleware = createNanoCodeMiddleware({
        enableCostTracking: true,
        pricing: MODEL_PRICING['claude-sonnet-4'],
      });

      const mockResponse = new AIMessage({ content: 'test' });
      (mockResponse as AIMessage & { usage_metadata: unknown }).usage_metadata = {
        input_tokens: 100_000,
        output_tokens: 50_000,
        total_tokens: 150_000,
        input_token_details: {
          cache_read: 80_000,
          cache_creation: 10_000,
        },
      };

      const mockHandler = vi.fn().mockResolvedValue(mockResponse);
      // @ts-expect-error Mocking partial request
      await middleware.wrapModelCall!(
        { messages: [], tools: [], state: { messages: [] }, runtime: {} },
        mockHandler,
      );

      const stats = getUsageStats();
      expect(stats.cacheReadTokens).toBe(80_000);
      expect(stats.cacheWriteTokens).toBe(10_000);
      // Should include cache costs in calculation
      expect(stats.estimatedCost).toBeGreaterThan(0);
    });
  });

  describe('Usage Stats Formatting', () => {
    it('should format usage stats correctly', async () => {
      // Manually set some stats via model call
      const middleware = createNanoCodeMiddleware({ enableTokenTracking: true });

      const mockResponse = new AIMessage({ content: 'test' });
      (mockResponse as AIMessage & { usage_metadata: unknown }).usage_metadata = {
        input_tokens: 1000,
        output_tokens: 500,
        total_tokens: 1500,
      };

      // @ts-expect-error Mocking partial request
      await middleware.wrapModelCall!(
        { messages: [], tools: [], state: { messages: [] }, runtime: {} },
        vi.fn().mockResolvedValue(mockResponse),
      );

      const stats = getUsageStats();
      const formatted = formatUsageStats(stats);

      expect(formatted).toContain('1,500');
      expect(formatted).toContain('1,000');
      expect(formatted).toContain('500');
      expect(formatted).toContain('$');
    });

    it('should format compact usage', () => {
      const stats: UsageStats = {
        totalInputTokens: 1000,
        totalOutputTokens: 500,
        totalTokens: 1500,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        modelCalls: 1,
        toolCalls: 0,
        estimatedCost: 0.0045,
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
      };

      const compact = formatCompactUsage(stats);
      expect(compact).toContain('1.5k tokens');
      expect(compact).toContain('$0.0045');
    });

    it('should format small token counts without k suffix', () => {
      const stats: UsageStats = {
        totalInputTokens: 100,
        totalOutputTokens: 50,
        totalTokens: 150,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        modelCalls: 1,
        toolCalls: 0,
        estimatedCost: 0.0001,
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
      };

      const compact = formatCompactUsage(stats);
      expect(compact).toContain('150 tokens');
    });
  });

  describe('Usage Update Subscription', () => {
    it('should allow subscribing to usage updates', async () => {
      const callback = vi.fn();
      const unsubscribe = onUsageUpdate(callback);

      const middleware = createNanoCodeMiddleware({ enableTokenTracking: true });
      const mockResponse = new AIMessage({ content: 'test' });
      (mockResponse as AIMessage & { usage_metadata: unknown }).usage_metadata = {
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
      };

      // @ts-expect-error Mocking partial request
      await middleware.wrapModelCall!(
        { messages: [], tools: [], state: { messages: [] }, runtime: {} },
        vi.fn().mockResolvedValue(mockResponse),
      );

      expect(callback).toHaveBeenCalled();

      // Unsubscribe
      unsubscribe();
      resetUsageStats();

      // @ts-expect-error Mocking partial request
      await middleware.wrapModelCall!(
        { messages: [], tools: [], state: { messages: [] }, runtime: {} },
        vi.fn().mockResolvedValue(mockResponse),
      );

      // Should only have been called once (before unsubscribe)
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('approximateTokenCount', () => {
    it('should estimate token count from string content', async () => {
      const messages = [
        new HumanMessage({ content: 'Hello world' }), // 11 chars
        new AIMessage({ content: 'Hi there!' }),      // 9 chars
      ];

      const count = await approximateTokenCount(messages);
      // 20 chars / 4 = 5 tokens (rounded up)
      expect(count).toBe(5);
    });

    it('should handle empty messages', async () => {
      const count = await approximateTokenCount([]);
      expect(count).toBe(0);
    });

    it('should handle array content', async () => {
      const messages = [
        new HumanMessage({
          content: [{ type: 'text', text: 'Hello world' }],
        }),
      ];

      const count = await approximateTokenCount(messages);
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('MODEL_PRICING', () => {
    it('should have pricing for all Claude models', () => {
      expect(MODEL_PRICING['claude-sonnet-4']).toBeDefined();
      expect(MODEL_PRICING['claude-opus-4']).toBeDefined();
      expect(MODEL_PRICING['claude-3-haiku']).toBeDefined();
      expect(MODEL_PRICING['default']).toBeDefined();
    });

    it('should have correct pricing structure', () => {
      const pricing = MODEL_PRICING['claude-sonnet-4'];
      expect(pricing.input).toBe(3.0);
      expect(pricing.output).toBe(15.0);
      expect(pricing.cacheRead).toBe(0.3);
      expect(pricing.cacheWrite).toBe(3.75);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeCommand, checkHealth  } from '@/lib/server';

describe('server', () => {
   let mockFetch = vi.fn();

   beforeEach(() => {
      mockFetch.mockClear();
   })

   it('should run executeCommand', async () => {
     mockFetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ text: '### Result\nClicked', isError: false }),
     });
     globalThis.fetch = mockFetch;

      const command = "click e5";
      const activeTabUrl = "https://playwright.dev"
      
      await executeCommand(command, activeTabUrl);

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:6781/run', {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: `{"raw":"click e5","activeTabUrl":"https://playwright.dev"}`,
            signal: expect.any(AbortSignal),
      });
   })

    it('should run checkHealth', async () => {
     mockFetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ status: 'ok', version: '0.4.0' }),
     });
     globalThis.fetch = mockFetch;

      const result = await checkHealth();

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:6781/health');
      expect(result).toEqual({ status: 'ok', version: '0.4.0' });
   })

})
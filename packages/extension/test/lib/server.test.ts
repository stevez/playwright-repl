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
            body: `{"raw":"click e5","activeTabUrl":"https://playwright.dev"}`
      });
   })

    it('should run executeCommand', async () => {
     mockFetch = vi.fn().mockResolvedValue({ok: true});
     globalThis.fetch = mockFetch;

      await checkHealth();

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:6781/health');
   })

})
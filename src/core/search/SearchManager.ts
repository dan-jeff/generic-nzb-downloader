import { SearchProviderSettings, SearchResult } from '../types/search.js';
import { BaseProvider } from './BaseProvider.js';
import { NzbSearchProvider } from './providers/NzbSearchProvider.js';

export class SearchManager {
  private providers: BaseProvider[] = [];

  constructor(settings: SearchProviderSettings[]) {
    this.updateProviders(settings);
  }

  updateProviders(settings: SearchProviderSettings[]): void {
    console.log('[SearchManager] updateProviders called with', settings.length, 'settings');
    console.log('[SearchManager] Settings content:', JSON.stringify(settings));

    this.providers = settings
      .filter((s) => s.enabled)
      .map((s) => {
        switch (s.type) {
          case 'nzb':
            return new NzbSearchProvider(s);
          default:
            throw new Error(`Unknown provider type: ${s.type}`);
        }
      });
    if (this.providers.length === 0) {
      console.warn('No enabled search providers configured. Please configure indexers in settings.');
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    console.log('[SearchManager] search called. Providers count:', this.providers.length);
    this.providers.forEach((p, i) => console.log(`[SearchManager] Provider ${i}:`, p.constructor.name));

    const results = await Promise.all(
      this.providers.map((p) => p.search(query))
    );
    return results.flat();
  }
}

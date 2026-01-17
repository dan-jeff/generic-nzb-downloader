import { SearchProviderSettings, SearchResult } from '../types/search.js';
import { BaseProvider } from './BaseProvider.js';
import { NzbSearchProvider } from './providers/NzbSearchProvider.js';

export class SearchManager {
  private providers: BaseProvider[] = [];

  constructor(settings: SearchProviderSettings[]) {
    this.updateProviders(settings);
  }

  updateProviders(settings: SearchProviderSettings[]): void {
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
  }

  async search(query: string): Promise<SearchResult[]> {
    const results = await Promise.all(
      this.providers.map((p) => p.search(query))
    );
    return results.flat();
  }
}

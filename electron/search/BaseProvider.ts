import { SearchProviderSettings, SearchResult } from '../types/search.js';

export abstract class BaseProvider {
  protected settings: SearchProviderSettings;

  constructor(settings: SearchProviderSettings) {
    this.settings = settings;
  }

  abstract search(query: string): Promise<SearchResult[]>;
}

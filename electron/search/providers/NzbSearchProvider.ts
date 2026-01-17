import { BaseProvider } from '../BaseProvider.js';
import { SearchResult, IndexerConfig } from '../../types/search.js';

export class NzbSearchProvider extends BaseProvider {
  async search(query: string): Promise<SearchResult[]> {
    const indexers = (this.settings.indexers as IndexerConfig[])?.filter((i: IndexerConfig) => i.enabled) || [];

    const searchPromises = indexers.map(async (indexer: IndexerConfig) => {
      try {
        let allIndexerResults: SearchResult[] = [];
        let offset = 0;
        let total = 0;
        const MAX_RESULTS = 500;

        do {
          const url = `${indexer.url}/api?t=search&q=${encodeURIComponent(query)}&apikey=${indexer.apiKey}&o=json&offset=${offset}`;
          const response = await fetch(url);
          
          if (!response.ok) {
            const errorBody = await response.text();
            const errorMessage = `HTTP error! status: ${response.status}`;
            const httpError = new Error(errorMessage) as Error & { body?: string };
            httpError.body = errorBody;
            throw httpError;
          }

          const data = await response.json();
          
          // Try to get the total number of results from various metadata locations
          if (offset === 0) {
            const responseAttr = data.channel?.response?.['@attributes'];
            total = parseInt(responseAttr?.total || data.channel?.response?.total || '0', 10);
          }

          const items = data.channel?.item || [];
          const mappedResults: SearchResult[] = (Array.isArray(items) ? items : [items])
            .filter((item: any) => item && (item.guid || item.link))
            .map((item: any) => ({
              id: item.guid || item.link,
              title: item.title,
              size: parseInt(item.enclosure?.['@attributes']?.length || item.size || '0', 10),
              date: item.pubDate,
              link: item.link,
              source: indexer.name,
              type: 'nzb' as const,
            }));

          if (mappedResults.length === 0) {
            break;
          }

          allIndexerResults.push(...mappedResults);
          offset += mappedResults.length;

          // Break if we've reached the total or the hard cap
        } while (offset < total && allIndexerResults.length < MAX_RESULTS);

        return allIndexerResults.slice(0, MAX_RESULTS);
      } catch (error) {
        console.error(`Error searching indexer ${indexer.name}:`, error);
        throw error;
      }
    });

    const allResults = await Promise.all(searchPromises);
    return allResults.flat();
  }
}

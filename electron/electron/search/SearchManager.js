import { NzbSearchProvider } from './providers/NzbSearchProvider.js';
export class SearchManager {
    providers = [];
    constructor(settings) {
        this.updateProviders(settings);
    }
    updateProviders(settings) {
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
    async search(query) {
        const results = await Promise.all(this.providers.map((p) => p.search(query).catch((err) => {
            console.error(`Search failed for provider:`, err);
            return [];
        })));
        return results.flat();
    }
}

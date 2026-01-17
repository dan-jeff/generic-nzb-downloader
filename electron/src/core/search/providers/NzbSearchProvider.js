import { BaseProvider } from '../BaseProvider.js';
import { CapacitorHttp } from '@capacitor/core';
export class NzbSearchProvider extends BaseProvider {
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async search(query) {
        const indexers = this.settings.indexers?.filter((i) => i.enabled) || [];
        console.log('[NzbSearchProvider] search called. Enabled indexers:', indexers.length);
        if (indexers.length === 0) {
            console.warn('[NzbSearchProvider] No enabled indexers found!');
        }
        const searchPromises = indexers.map(async (indexer) => {
            console.log('[NzbSearchProvider] Searching indexer:', indexer.name, indexer.url);
            let allIndexerResults = [];
            const MAX_RESULTS = 500;
            try {
                let offset = 0;
                let total = 0;
                do {
                    let retryAttempts = 0;
                    const MAX_RETRIES = 1;
                    const url = `${indexer.url}/api?t=search&q=${encodeURIComponent(query)}&apikey=${indexer.apiKey}&o=json&offset=${offset}`;
                    console.log(`[NzbSearchProvider] Requesting: ${url}`);
                    const makeRequest = async () => {
                        return await CapacitorHttp.get({
                            url: url,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                                'Accept': 'application/json'
                            }
                        });
                    };
                    let response = await makeRequest();
                    console.log(`[NzbSearchProvider] Response status: ${response.status}`);
                    if (response.status === 503) {
                        if (retryAttempts < MAX_RETRIES) {
                            const errorBody = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
                            console.error('[NzbSearchProvider] 503 error received. Body:', errorBody);
                            const waitMatch = errorBody.match(/wait\s+(\d+)\s+second/i);
                            const waitSeconds = waitMatch ? parseInt(waitMatch[1], 10) : 4;
                            console.log(`[NzbSearchProvider] Waiting ${waitSeconds} seconds before retry...`);
                            await this.sleep(waitSeconds * 1000);
                            retryAttempts++;
                            response = await makeRequest();
                            console.log(`[NzbSearchProvider] Retry response status: ${response.status}`);
                        }
                    }
                    if (response.status !== 200) {
                        const errorBody = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
                        const errorMessage = `HTTP error! status: ${response.status}`;
                        const httpError = new Error(errorMessage);
                        httpError.body = errorBody;
                        if (response.status === 503) {
                            const waitMatch = errorBody.match(/wait\s+(\d+)\s+second/i);
                            const waitSeconds = waitMatch ? parseInt(waitMatch[1], 10) : 4;
                            httpError.retryable = true;
                            httpError.retryAfter = waitSeconds;
                        }
                        console.error('[NzbSearchProvider] FULL ERROR BODY:', errorBody);
                        throw httpError;
                    }
                    // CapacitorHttp automatically parses JSON into response.data
                    const data = response.data;
                    // Try to get the total number of results from various metadata locations
                    if (offset === 0) {
                        const responseAttr = data.channel?.response?.['@attributes'];
                        total = parseInt(responseAttr?.total || data.channel?.response?.total || '0', 10);
                    }
                    const items = data.channel?.item || [];
                    if (!items || items.length === 0) {
                        alert(`Search success but 0 items found. Raw keys: ${Object.keys(data).join(',')}`);
                    }
                    const mappedResults = (Array.isArray(items) ? items : [items])
                        .filter((item) => item && (item.guid || item.link))
                        .map((item) => ({
                        id: item.guid || item.link,
                        title: item.title,
                        size: parseInt(item.enclosure?.['@attributes']?.length || item.size || '0', 10),
                        date: item.pubDate,
                        link: item.link,
                        source: indexer.name,
                        type: 'nzb',
                    }));
                    if (mappedResults.length === 0) {
                        break;
                    }
                    allIndexerResults.push(...mappedResults);
                    offset += mappedResults.length;
                    // Add delay between page requests
                    if (offset < total && allIndexerResults.length < MAX_RESULTS) {
                        await this.sleep(500);
                    }
                    // Break if we've reached the total or the hard cap
                } while (offset < total && allIndexerResults.length < MAX_RESULTS);
                return allIndexerResults.slice(0, MAX_RESULTS);
            }
            catch (error) {
                console.error(`Error searching indexer ${indexer.name}:`, error);
                if (allIndexerResults.length > 0) {
                    console.warn(`[NzbSearchProvider] Returning partial results (${allIndexerResults.length} items) for indexer ${indexer.name} due to error:`, error);
                    return allIndexerResults.slice(0, MAX_RESULTS);
                }
                throw error;
            }
        });
        const allResults = await Promise.all(searchPromises);
        return allResults.flat();
    }
}

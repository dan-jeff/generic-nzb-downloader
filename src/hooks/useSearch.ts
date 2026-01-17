import { useState, useCallback } from 'react';
import { SearchResult } from '../types/search';
import { serviceContainer } from '@/core/ServiceContainer';

type SearchError = {
  message: string;
  body?: string;
  retryable?: boolean;
  retryAfter?: number;
};

export const useSearch = () => {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SearchError | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const search = useCallback(async (query: string): Promise<SearchResult[]> => {
    if (!query.trim()) return [];

    try {
      setLoading(true);
      setError(null);
      setIsRetrying(false);
      
      const electron = (window as any).electron;
      
      if (electron && electron.search) {
        const searchResults = await electron.search(query);
        setResults(searchResults);
        return searchResults;
      } else {
        const searchManager = await serviceContainer.getSearchManager();
        const searchResults = await searchManager.search(query);
        setResults(searchResults);
        return searchResults;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Search failed';
      const errorBody = error instanceof Error && 'body' in error ? (error as { body?: string }).body : undefined;
      const retryable = error instanceof Error && 'retryable' in error ? (error as { retryable?: boolean }).retryable : false;
      const retryAfter = error instanceof Error && 'retryAfter' in error ? (error as { retryAfter?: number }).retryAfter : undefined;
      console.error('Search failed:', error);
      setError({ message: errorMessage, body: errorBody, retryable, retryAfter });
      setIsRetrying(retryable ?? false);
      setResults([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const clearResults = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  return {
    results,
    loading,
    error,
    isRetrying,
    search,
    clearResults,
  };
};
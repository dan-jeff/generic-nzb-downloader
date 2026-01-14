export interface IndexerConfig {
  id: string;
  name: string;
  url: string;
  apiKey: string;
  enabled: boolean;
}

export type NewsreaderType = 'sabnzbd' | 'nzbget' | 'direct';

export interface NewsreaderSettings {
  id: string;
  enabled: boolean;
  name: string;
  type: NewsreaderType;
  url: string;
  apiKey: string;
  username?: string;
  password?: string;
  priority: number;
  downloadPath?: string;
  hostname?: string;
  port?: number;
  useSSL?: boolean;
  retryAttempts?: number;
  retryBackoffMs?: number;
  segmentConcurrency?: number;
  fallbackProviderIds?: string[];
  maxConnections?: number;
  articleTimeoutMs?: number;
}

export type SearchProviderType = 'nzb';

export interface SearchProviderSettings {
  type: SearchProviderType;
  enabled: boolean;
  indexers?: IndexerConfig[];
  newsreaders?: NewsreaderSettings[];
}

export interface SearchResult {
  id: string;
  title: string;
  size: number;
  date: string;
  link: string;
  source: string;
  type: 'nzb';
}

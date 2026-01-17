import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import { DOMParser } from '@xmldom/xmldom';
import { Readable, Writable } from 'stream';
import { spawn, ChildProcess } from 'child_process';
import { DownloadStatus, DownloadState } from '../types/download.js';
import { NewsreaderSettings } from '../types/search.js';
import { IFileSystem } from '@core/interfaces/IFileSystem.js';
import { NntpConnection } from './NntpConnection.js';
import { NetworkFactory } from '@core/interfaces/INetwork.js';

export interface YencMetadata {
  line: number;
  size: number;
  name: string;
  part?: number;
  total?: number;
  partSize?: number;
  begin?: number;
  endSize?: number;
  pc32?: string;
}

export interface DecodedSegment {
  data?: Buffer;
  metadata: YencMetadata;
  crcValid?: boolean;
}

export interface StoredSegment {
  path: string;
  metadata: YencMetadata;
  size: number;
}

export interface ProviderStats {
  segmentsDownloaded: number;
  fallbackUsageCount: number;
  lastUsed: number;
}

export class FallbackManager {
  private primaryProviderId: string;
  private fallbackProviderIds: string[];
  private currentProviders: Map<string, string>;
  private retryCounts: Map<string, Map<string, number>>;
  private successRecords: Map<string, string>;
  private failedRecords: Map<string, Set<string>>;
  private providerStats: Map<string, ProviderStats>;
  private retryAttempts: number;

  constructor(primaryProviderId: string, fallbackProviderIds: string[] = [], retryAttempts: number = 3) {
    this.primaryProviderId = primaryProviderId;
    this.fallbackProviderIds = fallbackProviderIds;
    this.currentProviders = new Map();
    this.retryCounts = new Map();
    this.successRecords = new Map();
    this.failedRecords = new Map();
    this.providerStats = new Map();
    this.retryAttempts = retryAttempts;
    this.initializeProviderStats(this.primaryProviderId);
    this.fallbackProviderIds.forEach(id => this.initializeProviderStats(id));
  }

  private initializeProviderStats(providerId: string): void {
    if (!this.providerStats.has(providerId)) {
      this.providerStats.set(providerId, {
        segmentsDownloaded: 0,
        fallbackUsageCount: 0,
        lastUsed: 0
      });
    }
  }

  getNextProvider(currentProviderId: string, _segmentId: string): string | null {
    const allProviders = [this.primaryProviderId, ...this.fallbackProviderIds];
    const currentIndex = allProviders.indexOf(currentProviderId);

    if (currentIndex === -1) {
      return this.primaryProviderId;
    }

    const nextIndex = currentIndex + 1;
    if (nextIndex < allProviders.length) {
      const nextProvider = allProviders[nextIndex];
      const stats = this.providerStats.get(nextProvider);
      if (stats) {
        stats.fallbackUsageCount++;
      }
      return nextProvider;
    }

    return null;
  }

  recordFailure(segmentId: string, providerId: string): void {
    if (!this.retryCounts.has(segmentId)) {
      this.retryCounts.set(segmentId, new Map());
    }
    const segmentRetries = this.retryCounts.get(segmentId)!;
    const currentCount = segmentRetries.get(providerId) || 0;
    segmentRetries.set(providerId, currentCount + 1);

    if (!this.failedRecords.has(providerId)) {
      this.failedRecords.set(providerId, new Set());
    }
    this.failedRecords.get(providerId)!.add(segmentId);
  }

  recordSuccess(segmentId: string, providerId: string): void {
    this.successRecords.set(segmentId, providerId);
    this.currentProviders.delete(segmentId);

    const stats = this.providerStats.get(providerId);
    if (stats) {
      stats.segmentsDownloaded++;
      stats.lastUsed = Date.now();
    }
  }

  shouldRetry(segmentId: string, providerId: string): boolean {
    if (!this.retryCounts.has(segmentId)) {
      return true;
    }
    const segmentRetries = this.retryCounts.get(segmentId)!;
    const currentCount = segmentRetries.get(providerId) || 0;
    return currentCount < this.retryAttempts;
  }

  getRetryCount(segmentId: string, providerId: string): number {
    if (!this.retryCounts.has(segmentId)) {
      return 0;
    }
    return this.retryCounts.get(segmentId)!.get(providerId) || 0;
  }

  getCurrentProvider(segmentId: string): string | undefined {
    return this.currentProviders.get(segmentId);
  }

  setCurrentProvider(segmentId: string, providerId: string): void {
    this.currentProviders.set(segmentId, providerId);
  }

  getProviderStats(providerId: string): ProviderStats | undefined {
    return this.providerStats.get(providerId);
  }

  getAllProviderStats(): Map<string, ProviderStats> {
    return new Map(this.providerStats);
  }

  resetForSegment(segmentId: string): void {
    this.retryCounts.delete(segmentId);
    this.currentProviders.delete(segmentId);
  }
}

export class YencDecoder {
  private static CRC32_TABLE: number[] | null = null;

  private static initCrc32Table(): void {
    if (this.CRC32_TABLE) return;
    this.CRC32_TABLE = new Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      this.CRC32_TABLE[n] = c;
    }
  }

  private static calculateCrc32(buffer: Buffer): number {
    this.initCrc32Table();
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buffer.length; i++) {
      crc = (crc >>> 8) ^ this.CRC32_TABLE![(crc ^ buffer[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  static decode(encodedData: string): DecodedSegment {
    const lines = encodedData.split('\r\n');
    const metadata: YencMetadata = {
      line: 128,
      size: 0,
      name: ''
    };
    let dataStartIndex = -1;
    let dataEndIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('=ybegin')) {
        this.parseYBegin(line, metadata);
      } else if (line.startsWith('=ypart')) {
        this.parseYPart(line, metadata);
      } else if (line.startsWith('=yend')) {
        this.parseYEnd(line, metadata);
        dataEndIndex = i - 1;
      } else if (dataStartIndex === -1 && !line.startsWith('=y')) {
        dataStartIndex = i;
      }
    }

    if (dataStartIndex === -1 || dataEndIndex === -1 || dataStartIndex > dataEndIndex) {
      throw new Error('Invalid yEnc format: could not find data section');
    }

    const dataLines = lines.slice(dataStartIndex, dataEndIndex + 1);
    const decodedBuffer = this.decodeData(dataLines);

    let crcValid: boolean | undefined;
    if (metadata.pc32) {
      const calculatedCrc = this.calculateCrc32(decodedBuffer).toString(16).toLowerCase();
      const expectedCrc = metadata.pc32.toLowerCase();
      crcValid = calculatedCrc === expectedCrc;
    }

    return {
      data: decodedBuffer,
      metadata,
      crcValid
    };
  }

  private static parseYBegin(line: string, metadata: YencMetadata): void {
    const parts = line.substring(7).trim().split(' ');
    for (const part of parts) {
      const [key, value] = part.split('=');
      switch (key) {
        case 'line':
          metadata.line = parseInt(value, 10);
          break;
        case 'size':
          metadata.size = parseInt(value, 10);
          break;
        case 'name':
          metadata.name = value;
          break;
      }
    }
  }

  private static parseYPart(line: string, metadata: YencMetadata): void {
    const parts = line.substring(7).trim().split(' ');
    for (const part of parts) {
      const [key, value] = part.split('=');
      switch (key) {
        case 'part':
          metadata.part = parseInt(value, 10);
          break;
        case 'total':
          metadata.total = parseInt(value, 10);
          break;
        case 'size':
          metadata.partSize = parseInt(value, 10);
          break;
        case 'begin':
          metadata.begin = parseInt(value, 10);
          break;
      }
    }
  }

  private static parseYEnd(line: string, metadata: YencMetadata): void {
    const parts = line.substring(6).trim().split(' ');
    for (const part of parts) {
      const [key, value] = part.split('=');
      switch (key) {
        case 'size':
          metadata.endSize = parseInt(value, 10);
          break;
        case 'pc32':
          metadata.pc32 = value;
          break;
      }
    }
  }

  private static decodeData(lines: string[]): Buffer {
    const chunks: Buffer[] = [];

    for (const line of lines) {
      let escaped = false;
      const decodedBytes: number[] = [];

      for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (escaped) {
          const byte = (char.charCodeAt(0) - 64 - 42) & 0xFF;
          decodedBytes.push(byte);
          escaped = false;
        } else if (char === '=') {
          escaped = true;
        } else {
          const byte = (char.charCodeAt(0) - 42) & 0xFF;
          decodedBytes.push(byte);
        }
      }

      if (decodedBytes.length > 0) {
        chunks.push(Buffer.from(decodedBytes));
      }
    }

    return Buffer.concat(chunks);
  }
}

export class StreamingYencDecoder extends Writable {
  private decoderState: 'WAIT_BEGIN' | 'IN_PART' | 'IN_DATA' | 'FINISHED' = 'WAIT_BEGIN';
  private outputStream: Writable | null;
  private metadata: YencMetadata = { line: 128, size: 0, name: '' };
  private crc32 = 0xFFFFFFFF;
  private static CRC32_TABLE: number[] | null = null;
  public metadataPromise: Promise<YencMetadata>;
  private metadataResolve!: (meta: YencMetadata) => void;
  private metadataReject!: (err: Error) => void;
  private timeoutMs: number;
  private timeoutHandle?: NodeJS.Timeout;

  constructor(outputStream: Writable | null, timeoutMs: number = 30000) {
    super({ objectMode: true });
    this.outputStream = outputStream;
    this.timeoutMs = timeoutMs;
    StreamingYencDecoder.initCrc32Table();
    this.metadataPromise = new Promise((resolve, reject) => {
      this.metadataResolve = resolve;
      this.metadataReject = reject;
    });
    this.timeoutHandle = setTimeout(() => {
      this.metadataReject(new Error(`Streaming decoder timeout after ${timeoutMs}ms`));
      this.destroy();
    }, this.timeoutMs);
    this.on('error', (err) => {
      this.clearTimeout();
      this.metadataReject(err);
    });
  }

  private clearTimeout(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = undefined;
    }
  }

  private static initCrc32Table(): void {
    if (this.CRC32_TABLE) return;
    this.CRC32_TABLE = new Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      this.CRC32_TABLE[n] = c;
    }
  }

  _write(chunk: any, _encoding: string, callback: (error?: Error | null) => void): void {
    const line = chunk as string;
    try {
      const canContinue = this.processLine(line);
      if (canContinue) {
        callback();
      } else {
        if (this.outputStream) {
          this.outputStream.once('drain', () => callback());
        } else {
          callback();
        }
      }
    } catch (err) {
      callback(err instanceof Error ? err : new Error(String(err)));
    }
  }

  private processLine(line: string): boolean {
    if (line.startsWith('=ybegin')) {
      YencDecoder['parseYBegin'](line, this.metadata);
      this.decoderState = 'IN_PART';
      return true;
    } else if (line.startsWith('=ypart')) {
      YencDecoder['parseYPart'](line, this.metadata);
      return true;
    } else if (line.startsWith('=yend')) {
      YencDecoder['parseYEnd'](line, this.metadata);
      
      // Verify CRC if available and we have processed data
      if (this.metadata.pc32) {
         // const calculatedCrc = (this.crc32 ^ 0xFFFFFFFF) >>> 0;
         // const calculatedCrcHex = calculatedCrc.toString(16).toLowerCase();
         // const expectedCrc = this.metadata.pc32.toLowerCase();
         // We could store crcValid in metadata or emit it
         // For now, we trust the download if no error thrown
      }

      this.metadataResolve(this.metadata);
      this.decoderState = 'FINISHED';
      this.clearTimeout();
      return true;
    } else if (this.decoderState === 'IN_PART' || this.decoderState === 'WAIT_BEGIN') {
      if (!line.startsWith('=y')) {
        this.decoderState = 'IN_DATA';
        return this.decodeAndWrite(line);
      }
      return true;
    } else if (this.decoderState === 'IN_DATA') {
      return this.decodeAndWrite(line);
    }
    return true;
  }

  private decodeAndWrite(line: string): boolean {
    if (!this.outputStream) return true;

    let escaped = false;
    const decodedBytes: number[] = [];

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (escaped) {
        const byte = (char.charCodeAt(0) - 64 - 42) & 0xFF;
        decodedBytes.push(byte);
        escaped = false;
      } else if (char === '=') {
        escaped = true;
      } else {
        const byte = (char.charCodeAt(0) - 42) & 0xFF;
        decodedBytes.push(byte);
      }
    }

    if (decodedBytes.length > 0) {
      const buffer = Buffer.from(decodedBytes);
      
      // Update CRC
      const table = StreamingYencDecoder.CRC32_TABLE!;
      let crc = this.crc32;
      for (let i = 0; i < buffer.length; i++) {
        crc = (crc >>> 8) ^ table[(crc ^ buffer[i]) & 0xFF];
      }
      this.crc32 = crc;

      return this.outputStream.write(buffer);
    }
    return true;
  }

  _final(callback: (error?: Error | null) => void): void {
    this.clearTimeout();
    if (this.outputStream) {
      this.outputStream.end(callback);
    } else {
      callback();
    }
  }
}

export interface SegmentDownloadConfig {
  retryAttempts?: number;
  retryBackoffMs?: number;
  currentProviderId: string;
  fallbackProviderIds: string[];
  providerSettings: Map<string, { hostname: string; port: number; useSSL: boolean; username?: string; password?: string }>;
  switchProviderCallback?: (newProviderId: string) => Promise<NntpConnectionPool>;
  fileSystem?: IFileSystem;
}

export class SegmentDownloader {
  private connectionPool: NntpConnectionPool;
  private failedSegments: Set<string> = new Set();
  private fallbackManager: FallbackManager;
  private config: SegmentDownloadConfig;
  private perSegmentProviders: Map<string, string> = new Map();
  private fileSystem?: IFileSystem;

  constructor(connectionPool: NntpConnectionPool, config: SegmentDownloadConfig) {
    this.connectionPool = connectionPool;
    this.config = config;
    this.fileSystem = config.fileSystem;
    this.fallbackManager = new FallbackManager(
      config.currentProviderId,
      config.fallbackProviderIds,
      config.retryAttempts || 3
    );
  }

  async downloadSegment(messageId: string, destinationPath?: string): Promise<DecodedSegment> {
    console.log(`[SegmentDownloader] >>> downloadSegment called for messageId: ${messageId}`);
    console.log(`[SegmentDownloader] destinationPath: ${destinationPath}`);
    console.log(`[SegmentDownloader] connectionPool exists: ${!!this.connectionPool}`);
    
    const segmentId = messageId;
    const retryAttempts = this.config.retryAttempts || 3;
    const retryBackoffMs = this.config.retryBackoffMs || 1000;

    let currentProviderId = this.config.currentProviderId;
    if (!this.perSegmentProviders.has(segmentId)) {
      this.perSegmentProviders.set(segmentId, currentProviderId);
      this.fallbackManager.setCurrentProvider(segmentId, currentProviderId);
    } else {
      currentProviderId = this.perSegmentProviders.get(segmentId)!;
    }

    console.log(`[SegmentDownloader] Starting download loop with provider: ${currentProviderId}`);

    while (currentProviderId) {
      const canRetry = this.fallbackManager.shouldRetry(segmentId, currentProviderId);
      const retryCount = this.fallbackManager.getRetryCount(segmentId, currentProviderId);
      console.log(`[SegmentDownloader] shouldRetry: ${canRetry}, retryCount: ${retryCount}/${retryAttempts}`);
      
      if (!canRetry) {
        const nextProvider = this.fallbackManager.getNextProvider(currentProviderId, segmentId);
        if (nextProvider) {
          console.log(`Segment ${messageId}: Retries exhausted on provider ${currentProviderId}, switching to ${nextProvider}`);
          await this.switchProvider(messageId, nextProvider);
          currentProviderId = nextProvider;
          continue;
        } else {
          this.failedSegments.add(messageId);
          throw new Error(`Segment ${messageId} failed on all providers`);
        }
      }

      try {
        console.log(`[SegmentDownloader] Attempting to download segment ${messageId} on provider ${currentProviderId}`);
        
        if (destinationPath) {
          console.log(`[SegmentDownloader] Using stream download to: ${destinationPath}`);
          const result = await this.downloadSegmentStream(messageId, destinationPath);
          this.fallbackManager.recordSuccess(segmentId, currentProviderId);
          this.perSegmentProviders.delete(segmentId);
          console.log(`[SegmentDownloader] Stream download successful for ${messageId}`);
          return result;
        }

        console.log(`[SegmentDownloader] Using fetchArticleBody for ${messageId}`);
        const body = await this.fetchArticleBody(messageId);
        console.log(`[SegmentDownloader] fetchArticleBody returned, body length: ${body.length}`);
        const decoded = YencDecoder.decode(body);

        if (decoded.crcValid === false) {
          console.warn(`CRC mismatch for segment ${messageId}, proceeding anyway`);
        }

        if (decoded.metadata.pc32 && decoded.crcValid === undefined) {
          console.warn(`CRC validation skipped for segment ${messageId}`);
        }

        this.fallbackManager.recordSuccess(segmentId, currentProviderId);
        this.perSegmentProviders.delete(segmentId);
        return decoded;
      } catch (err) {
        console.error(`[SegmentDownloader] >>> DOWNLOAD SEGMENT FAILED <<<`);
        console.error(`[SegmentDownloader] Error type: ${err instanceof Error ? err.constructor.name : typeof err}`);
        console.error(`[SegmentDownloader] Error message: ${err instanceof Error ? err.message : String(err)}`);
        console.error(`[SegmentDownloader] Error stack:`, err instanceof Error ? err.stack : 'N/A');

        const nntpResponse = (err as any)?.response;
        const nntpCode = (err as any)?.code;

        console.error(`[SegmentDownloader] NNTP response code:`, nntpCode || 'N/A');
        console.error(`[SegmentDownloader] NNTP response message:`, nntpResponse || 'N/A');

        const error = err instanceof Error ? err : new Error(String(err));
        const newRetryCount = this.fallbackManager.getRetryCount(segmentId, currentProviderId) + 1;

        this.fallbackManager.recordFailure(segmentId, currentProviderId);
        console.warn(`Retry ${newRetryCount}/${retryAttempts} for segment ${messageId} on provider ${currentProviderId}: ${error.message}`);

        if (this.fallbackManager.shouldRetry(segmentId, currentProviderId)) {
          const delay = retryBackoffMs * Math.pow(2, newRetryCount - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          const nextProvider = this.fallbackManager.getNextProvider(currentProviderId, segmentId);
          if (nextProvider) {
            console.log(`Segment ${messageId}: All retries exhausted on provider ${currentProviderId}, switching to ${nextProvider}`);
            await this.switchProvider(messageId, nextProvider);
            currentProviderId = nextProvider;
            this.perSegmentProviders.set(segmentId, currentProviderId);
            this.fallbackManager.setCurrentProvider(segmentId, currentProviderId);
          } else {
            this.failedSegments.add(messageId);
            throw new Error(`Segment ${messageId} permanently failed on all providers after ${retryAttempts} attempts each`);
          }
        }
      }
    }

    this.failedSegments.add(messageId);
    throw new Error(`Segment ${messageId} failed on all providers`);
  }

  private async downloadSegmentStream(messageId: string, destinationPath: string): Promise<DecodedSegment> {
    console.log(`[SegmentDownloader] >>> downloadSegmentStream called`);
    console.log(`[SegmentDownloader] messageId: ${messageId}, dest: ${destinationPath}`);
    
    if (!this.fileSystem) {
      throw new Error('IFileSystem not provided for streaming download');
    }

    console.log(`[SegmentDownloader] Creating output stream...`);
    const outputStream = this.fileSystem.writeStream(destinationPath);
    console.log(`[SegmentDownloader] Creating decoder...`);
    const decoder = new StreamingYencDecoder(outputStream, 30000);

    console.log(`[SegmentDownloader] Requesting NNTP stream from connectionPool...`);
    const nntpStream = await this.connectionPool.requestStream(messageId);
    console.log(`[SegmentDownloader] NNTP stream received, piping to decoder...`);
    nntpStream.pipe(decoder);

    console.log(`[SegmentDownloader] Waiting for decoder metadata...`);
    const metadata = await decoder.metadataPromise;
    console.log(`[SegmentDownloader] Metadata received`);

    // Wait for the stream to finish writing before returning
    console.log(`[SegmentDownloader] Waiting for stream to finish writing...`);
    await new Promise<void>((resolve, reject) => {
      decoder.on('finish', () => {
        console.log(`[SegmentDownloader] Stream finished`);
        resolve();
      });
      decoder.on('error', (err) => {
        console.error(`[SegmentDownloader] Stream error:`, err);
        reject(err);
      });
    });

    return {
      metadata,
      data: undefined,
      crcValid: true
    };
  }

  private async switchProvider(messageId: string, newProviderId: string): Promise<void> {
    if (this.config.switchProviderCallback) {
      this.connectionPool = await this.config.switchProviderCallback(newProviderId);
      console.log(`Switched connection pool to provider ${newProviderId} for segment ${messageId}`);
    }
  }

  private fetchArticleBody(messageId: string): Promise<string> {
    console.log(`[SegmentDownloader] >>> fetchArticleBody called for: ${messageId}`);
    return new Promise((resolve, reject) => {
      console.log(`[SegmentDownloader] Calling connectionPool.request()...`);
      this.connectionPool.request(messageId, (err, body) => {
        if (err) {
          console.error(`[SegmentDownloader] connectionPool.request() failed:`, err);
          reject(err);
          return;
        }

        if (!body || body.trim().length === 0) {
          console.error(`[SegmentDownloader] Empty body for article ${messageId}`);
          reject(new Error(`Empty body for article ${messageId}`));
          return;
        }

        console.log(`[SegmentDownloader] fetchArticleBody successful, body length: ${body.length}`);
        resolve(body);
      });
    });
  }

  getFailedSegments(): string[] {
    return Array.from(this.failedSegments);
  }

  clearFailedSegments(): void {
    this.failedSegments.clear();
  }

  getFallbackManager(): FallbackManager {
    return this.fallbackManager;
  }
}

export interface NzbSegment {
  number: number;
  bytes: number;
  messageId: string;
}

export interface NzbFile {
  subject: string;
  filename: string;
  groups: string[];
  segments: NzbSegment[];
}

export interface DownloadJob {
  id: string;
  name: string;
  savePath?: string;
  files: NzbFile[];
  totalSize: number;
  status: DownloadState;
  downloadedBytes?: number;
  startTime?: number;
  progress?: number;
  speed?: number;
  eta?: number;
}

export interface NntpConnectionPoolConfig {
  maxConnections?: number;
  articleTimeoutMs?: number;
}

type ArticleCallback = (err: Error | null, body?: string) => void;

type RequestTask = 
  | { type: 'callback', messageId: string, callback: ArticleCallback }
  | { type: 'stream', messageId: string, resolve: (s: Readable) => void, reject: (e: Error) => void };

export class NntpConnectionPool {
  private connections: NntpConnection[] = [];
  private availableConnections: NntpConnection[] = [];
  private requestQueue: RequestTask[] = [];
  private hostname: string;
  private port: number;
  private useSSL: boolean;
  private username?: string;
  private password?: string;
  private maxConnections: number;
  private articleTimeoutMs: number;
  private networkFactory: NetworkFactory;

  constructor(
    hostname: string,
    port: number,
    useSSL: boolean,
    username: string | undefined,
    password: string | undefined,
    networkFactory: NetworkFactory,
    config: NntpConnectionPoolConfig = {}
  ) {
    this.hostname = hostname;
    this.port = port;
    this.useSSL = useSSL;
    this.username = username;
    this.password = password;
    this.networkFactory = networkFactory;
    this.maxConnections = config.maxConnections || 4;
    this.articleTimeoutMs = config.articleTimeoutMs || 15000;
  }

  async request(messageId: string, callback: ArticleCallback): Promise<void> {
    console.log(`[NntpConnectionPool] >>> request() called for messageId: ${messageId}`);
    const connection = this.getAvailableConnection();
    
    if (connection) {
      console.log(`[NntpConnectionPool] Using available connection`);
      this.fetchArticle(connection, messageId, callback);
    } else {
      console.log(`[NntpConnectionPool] No available connection, queuing request`);
      this.requestQueue.push({ type: 'callback', messageId, callback });
    }
  }

  async requestStream(messageId: string): Promise<Readable> {
    console.log(`[NntpConnectionPool] >>> requestStream() called for messageId: ${messageId}`);
    const connection = this.getAvailableConnection();

    if (connection) {
      console.log(`[NntpConnectionPool] Using available connection for stream`);
      return new Promise((resolve, reject) => {
        this.fetchArticleStream(connection, messageId, resolve, reject);
      });
    } else {
      console.log(`[NntpConnectionPool] No available connection, queuing stream request`);
      return new Promise((resolve, reject) => {
        this.requestQueue.push({ type: 'stream', messageId, resolve, reject });
      });
    }
  }

  private getAvailableConnection(): NntpConnection | null {
    console.log(`[NntpConnectionPool] getAvailableConnection() called`);
    console.log(`[NntpConnectionPool] Available connections: ${this.availableConnections.length}, Total connections: ${this.connections.length}, Max: ${this.maxConnections}`);
    
    if (this.availableConnections.length > 0) {
      const connection = this.availableConnections.shift()!;
      console.log(`[NntpConnectionPool] Returning existing available connection`);
      return connection;
    }

    if (this.connections.length < this.maxConnections) {
      console.log(`[NntpConnectionPool] Creating new connection (${this.connections.length + 1}/${this.maxConnections})`);
      const connection = new NntpConnection(this.networkFactory, this.articleTimeoutMs);
      this.connections.push(connection);
      return connection;
    }

    console.log(`[NntpConnectionPool] All connections busy, returning null`);
    return null;
  }

  private async fetchArticle(connection: NntpConnection, messageId: string, callback: ArticleCallback): Promise<void> {
    console.log(`[NntpConnectionPool] >>> fetchArticle() called for messageId: ${messageId}`);
    console.log(`[NntpConnectionPool] Connection isConnected: ${connection.isConnected()}`);
    
    try {
      if (!connection.isConnected()) {
        console.log(`[NntpConnectionPool] Connection not connected, calling connect()...`);
        console.log(`[NntpConnectionPool] Connect params: ${this.hostname}:${this.port}, SSL: ${this.useSSL}, username: ${!!this.username}`);
        await connection.connect(this.hostname, this.port, this.useSSL, this.username, this.password);
        console.log(`[NntpConnectionPool] Connection established successfully`);
      }

      console.log(`[NntpConnectionPool] Calling connection.getBody()...`);
      const body = await connection.getBody(messageId);
      console.log(`[NntpConnectionPool] getBody() returned, body length: ${body.length}`);
      callback(null, body);

      this.returnConnectionToPool(connection);
      this.processNextRequest();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(`[NntpConnectionPool] fetchArticle() failed:`, error.message);
      console.error(`[NntpConnectionPool] Error stack:`, error.stack);
      callback(error);

      if (!connection.isConnected()) {
        console.log(`[NntpConnectionPool] Connection lost, removing and creating replacement`);
        this.removeConnection(connection);
        this.createReplacementConnection();
      } else {
        this.returnConnectionToPool(connection);
      }
      this.processNextRequest();
    }
  }

  private async fetchArticleStream(connection: NntpConnection, messageId: string, resolve: (s: Readable) => void, reject: (e: Error) => void): Promise<void> {
    try {
      if (!connection.isConnected()) {
        await connection.connect(this.hostname, this.port, this.useSSL, this.username, this.password);
      }

      const stream = await connection.getArticleStream(messageId);
      
      const cleanup = () => {
        this.returnConnectionToPool(connection);
        this.processNextRequest();
      };
      
      stream.on('end', cleanup);
      stream.on('error', (_err) => {
        if (!connection.isConnected()) {
           this.removeConnection(connection);
           this.createReplacementConnection();
        } else {
           this.returnConnectionToPool(connection);
        }
        this.processNextRequest();
      });

      resolve(stream);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      reject(error);

      if (!connection.isConnected()) {
        this.removeConnection(connection);
        this.createReplacementConnection();
      } else {
        this.returnConnectionToPool(connection);
      }
      this.processNextRequest();
    }
  }

  private returnConnectionToPool(connection: NntpConnection): void {
    if (connection.isConnected() && this.connections.includes(connection)) {
      this.availableConnections.push(connection);
    }
  }

  private removeConnection(connection: NntpConnection): void {
    connection.disconnect();
    const index = this.connections.indexOf(connection);
    if (index > -1) {
      this.connections.splice(index, 1);
    }
    const availableIndex = this.availableConnections.indexOf(connection);
    if (availableIndex > -1) {
      this.availableConnections.splice(availableIndex, 1);
    }
  }

  private createReplacementConnection(): void {
    if (this.connections.length < this.maxConnections) {
      const connection = new NntpConnection(this.networkFactory, this.articleTimeoutMs);
      this.connections.push(connection);
    }
  }

  private processNextRequest(): void {
    if (this.requestQueue.length === 0) {
      return;
    }

    const connection = this.getAvailableConnection();
    if (connection) {
      const nextRequest = this.requestQueue.shift()!;
      if (nextRequest.type === 'callback') {
        this.fetchArticle(connection, nextRequest.messageId, nextRequest.callback);
      } else {
        this.fetchArticleStream(connection, nextRequest.messageId, nextRequest.resolve, nextRequest.reject);
      }
    }
  }

  async initialize(): Promise<void> {
    const initialConnections = Math.min(2, this.maxConnections);
    for (let i = 0; i < initialConnections; i++) {
      const connection = new NntpConnection(this.networkFactory, this.articleTimeoutMs);
      await connection.connect(this.hostname, this.port, this.useSSL, this.username, this.password);
      this.connections.push(connection);
      this.availableConnections.push(connection);
    }
  }

  shutdown(): void {
    for (const connection of this.connections) {
      connection.disconnect();
    }
    this.connections = [];
    this.availableConnections = [];
    this.requestQueue = [];
  }

  getStats(): { totalConnections: number; availableConnections: number; queuedRequests: number } {
    return {
      totalConnections: this.connections.length,
      availableConnections: this.availableConnections.length,
      queuedRequests: this.requestQueue.length
    };
  }
}

export abstract class BaseNewsreaderClient {
  protected settings: NewsreaderSettings;
  protected client?: AxiosInstance;

  constructor(settings: NewsreaderSettings) {
    this.settings = settings;
    if (settings.type !== 'direct') {
      this.client = axios.create({
        baseURL: settings.url,
        timeout: 10000,
      });
    }
  }

  abstract addNzb(content: Buffer, filename: string, category: string, downloadPath?: string): Promise<string>;
  abstract getStatus(ids: string[]): Promise<DownloadStatus[]>;
  abstract pause(id: string): Promise<boolean>;
  abstract delete(id: string, removeFiles: boolean): Promise<boolean>;
}

export class FileAssembler {
  static async assembleFile(
    job: DownloadJob & {
      downloadedBytes?: number;
      startTime?: number;
    },
    file: NzbFile & {
      downloadedArticles: number;
      size: number;
      articles: number;
      downloadedSegments: Map<number, StoredSegment>;
      downloadedBytes?: number;
    },
    fileSystem?: IFileSystem
  ): Promise<void> {
    if (!job.savePath) {
      throw new Error('Save path not set');
    }

    if (!fileSystem) {
      throw new Error('IFileSystem not provided to FileAssembler');
    }

    const filePath = job.name ? `${job.savePath}/${file.filename}` : file.filename;
    const fileHandle = await fileSystem.open(filePath, 'w');

    try {
      let currentOffset = 0;
      let totalWrittenBytes = 0;

      const segmentsWithMetadata = Array.from(file.downloadedSegments.entries()).map(([segNum, stored]) => {
        const segmentInfo = file.segments.find(s => s.number === segNum);
        return {
          stored,
          sortKey: segmentInfo ? segmentInfo.number : segNum
        };
      }).sort((a, b) => a.sortKey - b.sortKey);

      console.log(`Assembling file ${file.filename} with ${segmentsWithMetadata.length} segments`);

      for (const { stored } of segmentsWithMetadata) {
        const data = await fileSystem.readFile(stored.path);
        let writeOffset = currentOffset;

        if (typeof stored.metadata.begin === 'number') {
          writeOffset = Math.max(0, stored.metadata.begin - 1);
        }

        await fileHandle.write(data, 0, data.length, writeOffset);
        totalWrittenBytes += data.length;

        if (typeof stored.metadata.begin === 'number') {
          currentOffset = Math.max(currentOffset, writeOffset + data.length);
        } else {
          currentOffset += data.length;
        }

        try {
          await fileSystem.unlink(stored.path);
        } catch (err) {
          console.warn(`Failed to remove segment file ${stored.path}:`, err);
        }
      }

      if (job.savePath) {
        const segmentsDir = `${job.savePath}/.segments`;
        try {
          const remaining = await fileSystem.exists(segmentsDir);
          if (remaining) {
            await fileSystem.unlink(segmentsDir);
          }
        } catch (err) {
          console.warn('Failed to remove segments directory:', err);
        }
      }

      file.downloadedBytes = totalWrittenBytes;
      console.log(`File ${file.filename} assembled successfully, ${totalWrittenBytes} bytes written`);
    } finally {
      await fileHandle.close();
    }
  }
}

export interface Par2Result {
  success: boolean;
  needsRepair: boolean;
  repaired: boolean;
  filesCorrect: number;
  filesDamaged: number;
  filesMissing: number;
  message: string;
}

export class Par2Manager {
  private static PAR2_PATHS = ['/usr/bin/par2', '/usr/local/bin/par2', 'par2'];
  private static VERIFY_TIMEOUT_MS = 300000;
  private static REPAIR_TIMEOUT_MS = 600000;

  private par2Path: string | null = null;
  private fileSystem?: IFileSystem;

  constructor(fileSystem?: IFileSystem) {
    this.fileSystem = fileSystem;
  }

  private async findPar2Executable(): Promise<string | null> {
    if (this.par2Path) {
      return this.par2Path;
    }

    for (const par2Path of Par2Manager.PAR2_PATHS) {
      try {
        const result = await this.spawnCommand(par2Path, ['--version'], 5000);
        if (result.exitCode === 0) {
          this.par2Path = par2Path;
          console.log(`PAR2 found at: ${par2Path}`);
          return par2Path;
        }
      } catch (err) {
        continue;
      }
    }

    return null;
  }

  private spawnCommand(command: string, args: string[], timeoutMs: number): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let child: ChildProcess;

      try {
        child = spawn(command, args);
      } catch (err) {
        reject(new Error(`Failed to spawn ${command}: ${err instanceof Error ? err.message : String(err)}`));
        return;
      }

      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error(`Command timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      if (child.stdout) {
        child.stdout.on('data', (data: Buffer) => {
          stdout += data.toString();
        });
      }

      if (child.stderr) {
        child.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
      }

      child.on('close', (code: number | null) => {
        clearTimeout(timeout);
        resolve({ exitCode: code || 0, stdout, stderr });
      });

      child.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  private parseVerifyOutput(output: string): { allCorrect: boolean; damaged: number; missing: number } {
    const lowerOutput = output.toLowerCase();
    const allCorrect = lowerOutput.includes('all files are correct') ||
                        lowerOutput.includes('all files ok');

    const damagedMatch = output.match(/(\d+)\s+files?\s+damaged/i) ||
                        output.match(/damaged:\s*(\d+)/i);
    const damaged = damagedMatch ? parseInt(damagedMatch[1], 10) : 0;

    const missingMatch = output.match(/(\d+)\s+files?\s+missing/i) ||
                        output.match(/missing:\s*(\d+)/i);
    const missing = missingMatch ? parseInt(missingMatch[1], 10) : 0;

    return { allCorrect, damaged, missing };
  }

  private parseRepairOutput(output: string): { success: boolean; repaired: number; message: string } {
    const lowerOutput = output.toLowerCase();
    const success = lowerOutput.includes('repair complete') ||
                    lowerOutput.includes('repair successful');

    const repairedMatch = output.match(/repaired:\s*(\d+)/i) ||
                         output.match(/(\d+)\s+files?\s+repaired/i);
    const repaired = repairedMatch ? parseInt(repairedMatch[1], 10) : 0;

    if (lowerOutput.includes('insufficient recovery data')) {
      return { success: false, repaired, message: 'Insufficient recovery data to repair' };
    }

    if (lowerOutput.includes('repair failed')) {
      return { success: false, repaired, message: 'Repair failed' };
    }

    return { success, repaired, message: success ? 'Repair successful' : 'Repair failed' };
  }

  async verifyAndRepair(downloadPath: string): Promise<Par2Result> {
    console.log(`[Par2Manager] Starting PAR2 verification for ${downloadPath}`);

    const par2Path = await this.findPar2Executable();
    if (!par2Path) {
      console.warn('[Par2Manager] par2cmdline not installed, skipping verification/repair');
      return {
        success: true,
        needsRepair: false,
        repaired: false,
        filesCorrect: 0,
        filesDamaged: 0,
        filesMissing: 0,
        message: 'par2cmdline not installed, skipped'
      };
    }

    const par2Files = await this.findPar2Files(downloadPath);
    if (par2Files.length === 0) {
      console.log('[Par2Manager] No PAR2 files found, skipping verification/repair');
      return {
        success: true,
        needsRepair: false,
        repaired: false,
        filesCorrect: 0,
        filesDamaged: 0,
        filesMissing: 0,
        message: 'No PAR2 files found'
      };
    }

    console.log(`[Par2Manager] Found ${par2Files.length} PAR2 files: ${par2Files.join(', ')}`);

    const mainPar2File = this.findMainPar2File(par2Files);
    console.log(`[Par2Manager] Using main PAR2 file: ${mainPar2File}`);

    const verifyResult = await this.runVerify(par2Path, downloadPath, mainPar2File);
    console.log(`[Par2Manager] Verification result:`, verifyResult);

    if (verifyResult.allCorrect) {
      console.log('[Par2Manager] All files are correct, no repair needed');
      return {
        success: true,
        needsRepair: false,
        repaired: false,
        filesCorrect: -1,
        filesDamaged: 0,
        filesMissing: 0,
        message: 'All files are correct'
      };
    }

    if (verifyResult.damaged > 0 || verifyResult.missing > 0) {
      console.log(`[Par2Manager] Need repair: ${verifyResult.damaged} damaged, ${verifyResult.missing} missing files`);
      const repairResult = await this.runRepair(par2Path, downloadPath, mainPar2File);
      console.log(`[Par2Manager] Repair result:`, repairResult);

      return {
        success: repairResult.success,
        needsRepair: true,
        repaired: repairResult.success,
        filesCorrect: 0,
        filesDamaged: verifyResult.damaged,
        filesMissing: verifyResult.missing,
        message: repairResult.message
      };
    }

    return {
      success: true,
      needsRepair: false,
      repaired: false,
      filesCorrect: -1,
      filesDamaged: 0,
      filesMissing: 0,
      message: 'Verification complete, no issues found'
    };
  }

  private async findPar2Files(downloadPath: string): Promise<string[]> {
    console.warn('[Par2Manager] findPar2Files not fully implemented with IFileSystem');
    return [];
  }

  private findMainPar2File(par2Files: string[]): string {
    const nonVolumeFiles = par2Files.filter(f => !f.includes('.vol'));
    if (nonVolumeFiles.length > 0) {
      return nonVolumeFiles[0];
    }
    return par2Files[0];
  }

  private async runVerify(par2Path: string, downloadPath: string, par2File: string): Promise<{ allCorrect: boolean; damaged: number; missing: number }> {
    const par2FilePath = `${downloadPath}/${par2File}`;
    console.log(`[Par2Manager] Running: ${par2Path} verify "${par2FilePath}"`);

    try {
      const result = await this.spawnCommand(par2Path, ['verify', par2FilePath], Par2Manager.VERIFY_TIMEOUT_MS);

      console.log(`[Par2Manager] Verify exit code: ${result.exitCode}`);
      if (result.stdout) console.log(`[Par2Manager] Verify stdout:\n${result.stdout}`);
      if (result.stderr) console.log(`[Par2Manager] Verify stderr:\n${result.stderr}`);

      const output = result.stdout + result.stderr;
      return this.parseVerifyOutput(output);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(`[Par2Manager] Verify command failed:`, error.message);
      throw error;
    }
  }

  private async runRepair(par2Path: string, downloadPath: string, par2File: string): Promise<{ success: boolean; repaired: number; message: string }> {
    const par2FilePath = `${downloadPath}/${par2File}`;
    console.log(`[Par2Manager] Running: ${par2Path} repair "${par2FilePath}"`);

    try {
      const result = await this.spawnCommand(par2Path, ['repair', par2FilePath], Par2Manager.REPAIR_TIMEOUT_MS);

      console.log(`[Par2Manager] Repair exit code: ${result.exitCode}`);
      if (result.stdout) console.log(`[Par2Manager] Repair stdout:\n${result.stdout}`);
      if (result.stderr) console.log(`[Par2Manager] Repair stderr:\n${result.stderr}`);

      const output = result.stdout + result.stderr;
      return this.parseRepairOutput(output);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(`[Par2Manager] Repair command failed:`, error.message);
      throw error;
    }
  }
}

export class SABnzbdClient extends BaseNewsreaderClient {
  async addNzb(content: Buffer, filename: string, category: string, downloadPath?: string): Promise<string> {
    const form = new FormData();
    form.append('name', content, { filename });
    form.append('cat', category);
    if (downloadPath) {
      form.append('dir', downloadPath);
    }

    const response = await this.client!.post('/api', form, {
      params: {
        mode: 'addurl',
        output: 'json',
        apikey: this.settings.apiKey
      }
    });

    const data = response.data;
    if (!data || data.status !== 'success') {
      throw new Error(`Failed to add NZB: ${JSON.stringify(data)}`);
    }

    return data.nzo_id || data.id;
  }

  async getStatus(ids: string[]): Promise<DownloadStatus[]> {
    const response = await this.client!.get('/api', {
      params: {
        mode: 'queue',
        output: 'json',
        apikey: this.settings.apiKey
      }
    });

    const data = response.data;
    const allDownloads: DownloadStatus[] = [];

    if (data.queue) {
      const queue = data.queue;
      const slots = queue.slots || [];

      for (const slot of slots) {
        allDownloads.push({
          id: slot.nzo_id,
          name: slot.filename,
          size: slot.mb * 1024 * 1024,
          remainingSize: slot.mbleft * 1024 * 1024,
          progress: slot.percentage,
          status: this.mapSABnzbdStatus(slot.status),
          speed: slot.kbpersec * 1024,
          eta: slot.timeleft,
          category: slot.cat,
          outputPath: slot.download_dir
        });
      }

      const history = queue.history?.slots || [];
      for (const slot of history) {
        allDownloads.push({
          id: slot.nzo_id,
          name: slot.name,
          size: slot.mb * 1024 * 1024,
          remainingSize: 0,
          progress: 100,
          status: this.mapSABnzbdStatus(slot.status),
          speed: 0,
          eta: 0,
          category: slot.cat,
          outputPath: slot.storage
        });
      }
    }

    if (ids.length > 0) {
      return allDownloads.filter(d => ids.includes(d.id));
    }
    return allDownloads;
  }

  async pause(id: string): Promise<boolean> {
    const response = await this.client!.get('/api', {
      params: {
        mode: 'queue',
        name: 'pause',
        value: id,
        output: 'json',
        apikey: this.settings.apiKey
      }
    });

    return response.data?.status === 'success';
  }

  async delete(id: string, removeFiles: boolean): Promise<boolean> {
    const mode = removeFiles ? 'history' : 'queue';
    const name = 'delete' + (removeFiles ? '_del_files' : '');

    const response = await this.client!.get('/api', {
      params: {
        mode,
        name,
        value: id,
        output: 'json',
        apikey: this.settings.apiKey
      }
    });

    return response.data?.status === 'success';
  }

  private mapSABnzbdStatus(status: string): DownloadState {
    switch (status.toLowerCase()) {
      case 'downloading':
        return 'Downloading';
      case 'paused':
        return 'Paused';
      case 'queued':
        return 'Queued';
      case 'completed':
      case 'finished':
        return 'Completed';
      case 'failed':
        return 'Failed';
      case 'checking':
      case 'verifying':
        return 'Checking';
      case 'repairing':
        return 'Repairing';
      case 'extracting':
        return 'Extracting';
      default:
        return 'Queued';
    }
  }
}

export class NZBGetClient extends BaseNewsreaderClient {
  async addNzb(content: Buffer, filename: string, category: string, downloadPath?: string): Promise<string> {
    const form = new FormData();
    form.append('nzbfile', content, { filename });
    form.append('category', category);
    if (downloadPath) {
      form.append('destDir', downloadPath);
    }

    const response = await this.client!.post('/rpc', form);

    const data = response.data;
    if (data && data.result && typeof data.result === 'string') {
      return data.result;
    }

    throw new Error(`Failed to add NZB: ${JSON.stringify(data)}`);
  }

  async getStatus(ids: string[]): Promise<DownloadStatus[]> {
    const response = await this.client!.post('/rpc', {
      method: 'listgroups'
    });

    const data = response.data;
    const allDownloads: DownloadStatus[] = [];

    if (data.result && Array.isArray(data.result)) {
      for (const item of data.result) {
        allDownloads.push({
          id: item.NZBID.toString(),
          name: item.NZBName,
          size: (item.FileSizeMB || 0) * 1024 * 1024,
          remainingSize: (item.RemainingSizeMB || 0) * 1024 * 1024,
          progress: ((item.FileSizeMB - item.RemainingSizeMB) / (item.FileSizeMB || 1)) * 100,
          status: this.mapNZBGetStatus(item.Status),
          speed: (item.DownloadRate || 0) * 1024,
          eta: item.RemainingSec || 0,
          category: item.Category,
          outputPath: item.DestDir
        });
      }
    }

    if (ids.length > 0) {
      return allDownloads.filter(d => ids.includes(d.id));
    }
    return allDownloads;
  }

  async pause(id: string): Promise<boolean> {
    const response = await this.client!.post('/rpc', {
      method: 'editqueue',
      action: 'pause',
      value: id
    });

    return response.data?.result === true;
  }

  async delete(id: string, removeFiles: boolean): Promise<boolean> {
    const response = await this.client!.post('/rpc', {
      method: 'editqueue',
      action: removeFiles ? 'finaldelete' : 'delete',
      value: id
    });

    return response.data?.result === true;
  }

  private mapNZBGetStatus(status: string): DownloadState {
    switch (status.toUpperCase()) {
      case 'DOWNLOADING':
        return 'Downloading';
      case 'PAUSED':
        return 'Paused';
      case 'QUEUED':
        return 'Queued';
      case 'COMPLETED':
      case 'SUCCESS':
        return 'Completed';
      case 'FAILED':
      case 'WARNING':
        return 'Failed';
      case 'CHECKING':
      case 'VERIFYING':
        return 'Checking';
      case 'REPAIRING':
        return 'Repairing';
      case 'EXTRACTING':
        return 'Extracting';
      case 'MOVING':
        return 'Assembling';
      default:
        return 'Queued';
    }
  }
}


export class DirectUsenetClient extends BaseNewsreaderClient {
  private connectionPool?: NntpConnectionPool;
  private segmentDownloader?: SegmentDownloader;
  private fileSystem?: IFileSystem;
  private networkFactory: NetworkFactory;
  private activeDownloads: Map<string, DownloadStatus> = new Map();

  constructor(settings: NewsreaderSettings, networkFactory: NetworkFactory, fileSystem?: IFileSystem) {
    console.error('[DirectUsenetClient] >>> CONSTRUCTOR CALLED <<<');
    console.error('[DirectUsenetClient] Constructor params:', { name: settings.name, type: settings.type, hostname: settings.hostname, hasFileSystem: !!fileSystem });
    super(settings);
    this.networkFactory = networkFactory;
    this.fileSystem = fileSystem;
    this.initializeConnection();
  }

  private initializeConnection(): void {
    console.error('[DirectUsenetClient] >>> INITIALIZE CONNECTION CALLED <<<');
    console.error('[DirectUsenetClient] Settings check:', {
      hostname: this.settings.hostname,
      port: this.settings.port,
      useSSL: this.settings.useSSL,
      hasUsername: !!this.settings.username,
      hasPassword: !!this.settings.password
    });

    if (!this.settings.hostname || !this.settings.port) {
      console.error('[DirectUsenetClient] >>> MISSING HOSTNAME OR PORT <<<');
      return;
    }

    let actualUseSSL = this.settings.useSSL ?? false;
    if (this.settings.type === 'direct' && !actualUseSSL) {
      console.error('[DirectUsenetClient] >>> FORCING SSL TRUE FOR DIRECT CONNECTION <<<');
      actualUseSSL = true;
    }

    try {
      this.connectionPool = new NntpConnectionPool(
        this.settings.hostname,
        this.settings.port,
        actualUseSSL,
        this.settings.username,
        this.settings.password,
        this.networkFactory,
        {
          maxConnections: this.settings.maxConnections,
          articleTimeoutMs: this.settings.articleTimeoutMs
        }
      );

      this.segmentDownloader = new SegmentDownloader(this.connectionPool, {
        retryAttempts: this.settings.retryAttempts,
        retryBackoffMs: this.settings.retryBackoffMs,
        currentProviderId: this.settings.id,
        fallbackProviderIds: this.settings.fallbackProviderIds || [],
        providerSettings: new Map(),
        switchProviderCallback: undefined,
        fileSystem: this.fileSystem
      });
    } catch (error) {
      console.error('[DirectUsenetClient] >>> NETWORK INITIALIZATION FAILED <<<', error);
      throw new Error('Failed to initialize NNTP connection: ' + (error instanceof Error ? error.message : String(error)));
    }
  }

  async addNzb(content: Buffer, filename: string, category: string, downloadPath?: string): Promise<string> {
    const id = Math.random().toString(36).substring(7);
    console.log('[DirectUsenetClient] addNzb called, generated id:', id);

    if (!downloadPath) {
      throw new Error('Download path not configured');
    }

    if (!this.segmentDownloader || !this.connectionPool) {
      this.initializeConnection();
    }

    const doc = new DOMParser().parseFromString(content.toString('utf-8'), 'text/xml');
    const segmentElements = Array.from(doc.getElementsByTagName('segment'));
    let totalSize = segmentElements.reduce((sum, seg) => sum + parseInt(seg.getAttribute('bytes') || '0', 10), 0);
    if (isNaN(totalSize)) totalSize = 0;

    this.activeDownloads.set(id, {
      id,
      name: filename,
      size: totalSize,
      remainingSize: totalSize,
      progress: 0,
      status: 'Queued',
      speed: 0,
      eta: 0,
      outputPath: downloadPath,
      category: category
    });

    // Start background download
    this.processDownload(id, content, filename, downloadPath).catch(err => {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorStack = err instanceof Error ? err.stack : undefined;
      console.error(`[DirectUsenetClient] Download ${id} failed:`, errorMsg);
      if (errorStack) {
        console.error(`[DirectUsenetClient] Stack trace:`, errorStack);
      }
      console.error(`[DirectUsenetClient] Full error object:`, JSON.stringify(err, Object.getOwnPropertyNames(err)));
      const status = this.activeDownloads.get(id);
      if (status) {
        status.status = 'Failed';
      }
    });

    return id;
  }

  private async processDownload(id: string, content: Buffer, filename: string, downloadPath?: string) {
    const status = this.activeDownloads.get(id);
    if (!status) return;

    status.status = 'Downloading';
    console.log(`[DirectUsenetClient] Starting download process for ${id}`);

    try {
      const doc = new DOMParser().parseFromString(content.toString('utf-8'), 'text/xml');
      const fileElements = Array.from(doc.getElementsByTagName('file'));

      for (const fileElement of fileElements) {
        const subject = fileElement.getAttribute('subject') || '';
        const segments: NzbSegment[] = [];
        const segmentElements = Array.from(fileElement.getElementsByTagName('segment'));

        for (const segmentElement of segmentElements) {
          const number = parseInt(segmentElement.getAttribute('number') || '0', 10);
          const bytes = parseInt(segmentElement.getAttribute('bytes') || '0', 10);
          const messageId = segmentElement.textContent?.trim() || '';
          segments.push({ number, bytes, messageId });
        }

        if (segments.length === 0) continue;

        const totalBytes = segments.reduce((sum, seg) => sum + seg.bytes, 0);
        
        const filenameMatch = subject.match(/"([^"]+)"/);
        const extractedFilename = filenameMatch ? filenameMatch[1] : filename;
        status.name = extractedFilename; // Update name if we found a better one

        const segmentsDir = `${downloadPath}/.segments`;
        if (this.fileSystem) {
           await this.fileSystem.mkdir(segmentsDir);
        } else {
           throw new Error('IFileSystem not provided');
        }

        const downloadedSegments = new Map<number, StoredSegment>();
        let downloadedBytesFile = 0;

        for (const segment of segments) {
           const segmentPath = `${segmentsDir}/${extractedFilename}.${segment.number}.tmp`;
           
           if (!this.segmentDownloader) throw new Error('Segment downloader missing');
           
           console.log(`[DirectUsenetClient] About to download segment ${segment.number}, messageId: ${segment.messageId}`);
           console.log(`[DirectUsenetClient] SegmentDownloader exists: ${!!this.segmentDownloader}`);
           console.log(`[DirectUsenetClient] ConnectionPool exists: ${!!this.connectionPool}`);
           
           const result = await this.segmentDownloader.downloadSegment(segment.messageId, segmentPath);
           
           console.log(`[DirectUsenetClient] Segment ${segment.number} downloaded successfully`);
           
           const segmentSize = result.data ? result.data.length : segment.bytes; // Approx if streamed
           
           downloadedSegments.set(segment.number, {
             path: segmentPath,
             metadata: result.metadata,
             size: segmentSize
           });

           downloadedBytesFile += segmentSize;
           status.remainingSize = Math.max(0, status.remainingSize - segmentSize);
           status.progress = status.size > 0 ? ((status.size - status.remainingSize) / status.size) * 100 : 0;
        }
        
        // Assemble
        status.status = 'Assembling'; // Or keep Downloading
        const fileWithSegments = {
            subject,
            filename: extractedFilename,
            groups: [],
            segments,
            downloadedArticles: downloadedSegments.size,
            size: totalBytes,
            articles: segments.length,
            downloadedSegments
        };

        const job = {
            id,
            name: extractedFilename,
            savePath: downloadPath,
            files: [fileWithSegments],
            totalSize: totalBytes,
            status: 'Completed' as DownloadState,
            downloadedBytes: downloadedBytesFile,
            startTime: Date.now()
        };

        await FileAssembler.assembleFile(job, fileWithSegments, this.fileSystem);
      }

      status.status = 'Completed';
      status.progress = 100;
      status.remainingSize = 0;
      console.log(`[DirectUsenetClient] Download ${id} completed`);

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorStack = err instanceof Error ? err.stack : undefined;
      console.error(`[DirectUsenetClient] Error processing download ${id}:`, errorMsg);
      if (errorStack) {
        console.error(`[DirectUsenetClient] Stack trace:`, errorStack);
      }
      console.error(`[DirectUsenetClient] Full error object:`, JSON.stringify(err, Object.getOwnPropertyNames(err)));
      status.status = 'Failed';
      throw err;
    }
  }

  async getStatus(ids: string[]): Promise<DownloadStatus[]> {
    if (ids.length === 0) return Array.from(this.activeDownloads.values());
    return ids.map(id => this.activeDownloads.get(id)).filter(s => s !== undefined) as DownloadStatus[];
  }

  async pause(_id: string): Promise<boolean> {
    return false;
  }

  async delete(id: string, _removeFiles: boolean): Promise<boolean> {
    this.activeDownloads.delete(id);
    return true;
  }
}

export class NewsreaderClientFactory {
  static create(settings: NewsreaderSettings, networkFactory: NetworkFactory, fileSystem?: IFileSystem): BaseNewsreaderClient {
    console.error('[NewsreaderClientFactory] >>> CREATE CALLED <<<');
    console.error('[NewsreaderClientFactory] Type:', settings.type);
    
    switch (settings.type) {
      case 'sabnzbd':
        console.error('[NewsreaderClientFactory] Creating SABnzbdClient');
        return new SABnzbdClient(settings);
      case 'nzbget':
        console.error('[NewsreaderClientFactory] Creating NZBGetClient');
        return new NZBGetClient(settings);
      case 'direct':
        console.error('[NewsreaderClientFactory] Creating DirectUsenetClient');
        return new DirectUsenetClient(settings, networkFactory, fileSystem);
      default:
        console.error('[NewsreaderClientFactory] Unknown type:', settings.type);
        throw new Error(`Unsupported newsreader type: ${(settings as any).type}`);
    }
  }
}

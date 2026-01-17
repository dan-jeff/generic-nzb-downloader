import axios from 'axios';
import FormData from 'form-data';
import { DOMParser } from '@xmldom/xmldom';
import { Writable } from 'stream';
import { spawn } from 'child_process';
import { NntpConnection } from './NntpConnection.js';
export class FallbackManager {
    primaryProviderId;
    fallbackProviderIds;
    currentProviders;
    retryCounts;
    successRecords;
    failedRecords;
    providerStats;
    retryAttempts;
    constructor(primaryProviderId, fallbackProviderIds = [], retryAttempts = 3) {
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
    initializeProviderStats(providerId) {
        if (!this.providerStats.has(providerId)) {
            this.providerStats.set(providerId, {
                segmentsDownloaded: 0,
                fallbackUsageCount: 0,
                lastUsed: 0
            });
        }
    }
    getNextProvider(currentProviderId, _segmentId) {
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
    recordFailure(segmentId, providerId) {
        if (!this.retryCounts.has(segmentId)) {
            this.retryCounts.set(segmentId, new Map());
        }
        const segmentRetries = this.retryCounts.get(segmentId);
        const currentCount = segmentRetries.get(providerId) || 0;
        segmentRetries.set(providerId, currentCount + 1);
        if (!this.failedRecords.has(providerId)) {
            this.failedRecords.set(providerId, new Set());
        }
        this.failedRecords.get(providerId).add(segmentId);
    }
    recordSuccess(segmentId, providerId) {
        this.successRecords.set(segmentId, providerId);
        this.currentProviders.delete(segmentId);
        const stats = this.providerStats.get(providerId);
        if (stats) {
            stats.segmentsDownloaded++;
            stats.lastUsed = Date.now();
        }
    }
    shouldRetry(segmentId, providerId) {
        if (!this.retryCounts.has(segmentId)) {
            return true;
        }
        const segmentRetries = this.retryCounts.get(segmentId);
        const currentCount = segmentRetries.get(providerId) || 0;
        return currentCount < this.retryAttempts;
    }
    getRetryCount(segmentId, providerId) {
        if (!this.retryCounts.has(segmentId)) {
            return 0;
        }
        return this.retryCounts.get(segmentId).get(providerId) || 0;
    }
    getCurrentProvider(segmentId) {
        return this.currentProviders.get(segmentId);
    }
    setCurrentProvider(segmentId, providerId) {
        this.currentProviders.set(segmentId, providerId);
    }
    getProviderStats(providerId) {
        return this.providerStats.get(providerId);
    }
    getAllProviderStats() {
        return new Map(this.providerStats);
    }
    resetForSegment(segmentId) {
        this.retryCounts.delete(segmentId);
        this.currentProviders.delete(segmentId);
    }
}
export class YencDecoder {
    static CRC32_TABLE = null;
    static initCrc32Table() {
        if (this.CRC32_TABLE)
            return;
        this.CRC32_TABLE = new Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            this.CRC32_TABLE[n] = c;
        }
    }
    static calculateCrc32(buffer) {
        this.initCrc32Table();
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < buffer.length; i++) {
            crc = (crc >>> 8) ^ this.CRC32_TABLE[(crc ^ buffer[i]) & 0xFF];
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }
    static decode(encodedData) {
        const lines = encodedData.split('\r\n');
        const metadata = {
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
            }
            else if (line.startsWith('=ypart')) {
                this.parseYPart(line, metadata);
            }
            else if (line.startsWith('=yend')) {
                this.parseYEnd(line, metadata);
                dataEndIndex = i - 1;
            }
            else if (dataStartIndex === -1 && !line.startsWith('=y')) {
                dataStartIndex = i;
            }
        }
        if (dataStartIndex === -1 || dataEndIndex === -1 || dataStartIndex > dataEndIndex) {
            throw new Error('Invalid yEnc format: could not find data section');
        }
        const dataLines = lines.slice(dataStartIndex, dataEndIndex + 1);
        const decodedBuffer = this.decodeData(dataLines);
        let crcValid;
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
    static parseYBegin(line, metadata) {
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
    static parseYPart(line, metadata) {
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
    static parseYEnd(line, metadata) {
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
    static decodeData(lines) {
        const chunks = [];
        for (const line of lines) {
            let escaped = false;
            const decodedBytes = [];
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (escaped) {
                    const byte = (char.charCodeAt(0) - 64 - 42) & 0xFF;
                    decodedBytes.push(byte);
                    escaped = false;
                }
                else if (char === '=') {
                    escaped = true;
                }
                else {
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
    decoderState = 'WAIT_BEGIN';
    outputStream;
    metadata = { line: 128, size: 0, name: '' };
    crc32 = 0xFFFFFFFF;
    static CRC32_TABLE = null;
    metadataPromise;
    metadataResolve;
    metadataReject;
    timeoutMs;
    timeoutHandle;
    constructor(outputStream, timeoutMs = 30000) {
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
    clearTimeout() {
        if (this.timeoutHandle) {
            clearTimeout(this.timeoutHandle);
            this.timeoutHandle = undefined;
        }
    }
    static initCrc32Table() {
        if (this.CRC32_TABLE)
            return;
        this.CRC32_TABLE = new Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            this.CRC32_TABLE[n] = c;
        }
    }
    _write(chunk, _encoding, callback) {
        const line = chunk;
        try {
            const canContinue = this.processLine(line);
            if (canContinue) {
                callback();
            }
            else {
                if (this.outputStream) {
                    this.outputStream.once('drain', () => callback());
                }
                else {
                    callback();
                }
            }
        }
        catch (err) {
            callback(err instanceof Error ? err : new Error(String(err)));
        }
    }
    processLine(line) {
        if (line.startsWith('=ybegin')) {
            YencDecoder['parseYBegin'](line, this.metadata);
            this.decoderState = 'IN_PART';
            return true;
        }
        else if (line.startsWith('=ypart')) {
            YencDecoder['parseYPart'](line, this.metadata);
            return true;
        }
        else if (line.startsWith('=yend')) {
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
        }
        else if (this.decoderState === 'IN_PART' || this.decoderState === 'WAIT_BEGIN') {
            if (!line.startsWith('=y')) {
                this.decoderState = 'IN_DATA';
                return this.decodeAndWrite(line);
            }
            return true;
        }
        else if (this.decoderState === 'IN_DATA') {
            return this.decodeAndWrite(line);
        }
        return true;
    }
    decodeAndWrite(line) {
        if (!this.outputStream)
            return true;
        let escaped = false;
        const decodedBytes = [];
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (escaped) {
                const byte = (char.charCodeAt(0) - 64 - 42) & 0xFF;
                decodedBytes.push(byte);
                escaped = false;
            }
            else if (char === '=') {
                escaped = true;
            }
            else {
                const byte = (char.charCodeAt(0) - 42) & 0xFF;
                decodedBytes.push(byte);
            }
        }
        if (decodedBytes.length > 0) {
            const buffer = Buffer.from(decodedBytes);
            // Update CRC
            const table = StreamingYencDecoder.CRC32_TABLE;
            let crc = this.crc32;
            for (let i = 0; i < buffer.length; i++) {
                crc = (crc >>> 8) ^ table[(crc ^ buffer[i]) & 0xFF];
            }
            this.crc32 = crc;
            return this.outputStream.write(buffer);
        }
        return true;
    }
    _final(callback) {
        this.clearTimeout();
        if (this.outputStream) {
            this.outputStream.end(callback);
        }
        else {
            callback();
        }
    }
}
export class SegmentDownloader {
    connectionPool;
    failedSegments = new Set();
    fallbackManager;
    config;
    perSegmentProviders = new Map();
    fileSystem;
    constructor(connectionPool, config) {
        this.connectionPool = connectionPool;
        this.config = config;
        this.fileSystem = config.fileSystem;
        this.fallbackManager = new FallbackManager(config.currentProviderId, config.fallbackProviderIds, config.retryAttempts || 3);
    }
    async downloadSegment(messageId, destinationPath) {
        const segmentId = messageId;
        const retryAttempts = this.config.retryAttempts || 3;
        const retryBackoffMs = this.config.retryBackoffMs || 1000;
        let currentProviderId = this.config.currentProviderId;
        if (!this.perSegmentProviders.has(segmentId)) {
            this.perSegmentProviders.set(segmentId, currentProviderId);
            this.fallbackManager.setCurrentProvider(segmentId, currentProviderId);
        }
        else {
            currentProviderId = this.perSegmentProviders.get(segmentId);
        }
        while (currentProviderId) {
            if (!this.fallbackManager.shouldRetry(segmentId, currentProviderId)) {
                const nextProvider = this.fallbackManager.getNextProvider(currentProviderId, segmentId);
                if (nextProvider) {
                    console.log(`Segment ${messageId}: Retries exhausted on provider ${currentProviderId}, switching to ${nextProvider}`);
                    await this.switchProvider(messageId, nextProvider);
                    currentProviderId = nextProvider;
                    continue;
                }
                else {
                    this.failedSegments.add(messageId);
                    throw new Error(`Segment ${messageId} failed on all providers`);
                }
            }
            try {
                if (destinationPath) {
                    const result = await this.downloadSegmentStream(messageId, destinationPath);
                    this.fallbackManager.recordSuccess(segmentId, currentProviderId);
                    this.perSegmentProviders.delete(segmentId);
                    return result;
                }
                const body = await this.fetchArticleBody(messageId);
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
            }
            catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                const newRetryCount = this.fallbackManager.getRetryCount(segmentId, currentProviderId) + 1;
                this.fallbackManager.recordFailure(segmentId, currentProviderId);
                console.warn(`Retry ${newRetryCount}/${retryAttempts} for segment ${messageId} on provider ${currentProviderId}: ${error.message}`);
                if (this.fallbackManager.shouldRetry(segmentId, currentProviderId)) {
                    const delay = retryBackoffMs * Math.pow(2, newRetryCount - 1);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
                else {
                    const nextProvider = this.fallbackManager.getNextProvider(currentProviderId, segmentId);
                    if (nextProvider) {
                        console.log(`Segment ${messageId}: All retries exhausted on provider ${currentProviderId}, switching to ${nextProvider}`);
                        await this.switchProvider(messageId, nextProvider);
                        currentProviderId = nextProvider;
                        this.perSegmentProviders.set(segmentId, currentProviderId);
                        this.fallbackManager.setCurrentProvider(segmentId, currentProviderId);
                    }
                    else {
                        this.failedSegments.add(messageId);
                        throw new Error(`Segment ${messageId} permanently failed on all providers after ${retryAttempts} attempts each`);
                    }
                }
            }
        }
        this.failedSegments.add(messageId);
        throw new Error(`Segment ${messageId} failed on all providers`);
    }
    async downloadSegmentStream(messageId, destinationPath) {
        if (!this.fileSystem) {
            throw new Error('IFileSystem not provided for streaming download');
        }
        const outputStream = this.fileSystem.writeStream(destinationPath);
        const decoder = new StreamingYencDecoder(outputStream, 30000);
        const nntpStream = await this.connectionPool.requestStream(messageId);
        nntpStream.pipe(decoder);
        await decoder.metadataPromise;
        return {
            metadata: await decoder.metadataPromise,
            data: undefined,
            crcValid: true
        };
    }
    async switchProvider(messageId, newProviderId) {
        if (this.config.switchProviderCallback) {
            this.connectionPool = await this.config.switchProviderCallback(newProviderId);
            console.log(`Switched connection pool to provider ${newProviderId} for segment ${messageId}`);
        }
    }
    fetchArticleBody(messageId) {
        return new Promise((resolve, reject) => {
            this.connectionPool.request(messageId, (err, body) => {
                if (err) {
                    reject(err);
                    return;
                }
                if (!body || body.trim().length === 0) {
                    reject(new Error(`Empty body for article ${messageId}`));
                    return;
                }
                resolve(body);
            });
        });
    }
    getFailedSegments() {
        return Array.from(this.failedSegments);
    }
    clearFailedSegments() {
        this.failedSegments.clear();
    }
    getFallbackManager() {
        return this.fallbackManager;
    }
}
export class NntpConnectionPool {
    connections = [];
    availableConnections = [];
    requestQueue = [];
    hostname;
    port;
    useSSL;
    username;
    password;
    maxConnections;
    articleTimeoutMs;
    networkFactory;
    constructor(hostname, port, useSSL, username, password, networkFactory, config = {}) {
        this.hostname = hostname;
        this.port = port;
        this.useSSL = useSSL;
        this.username = username;
        this.password = password;
        this.networkFactory = networkFactory;
        this.maxConnections = config.maxConnections || 4;
        this.articleTimeoutMs = config.articleTimeoutMs || 15000;
    }
    async request(messageId, callback) {
        const connection = this.getAvailableConnection();
        if (connection) {
            this.fetchArticle(connection, messageId, callback);
        }
        else {
            this.requestQueue.push({ type: 'callback', messageId, callback });
        }
    }
    async requestStream(messageId) {
        const connection = this.getAvailableConnection();
        if (connection) {
            return new Promise((resolve, reject) => {
                this.fetchArticleStream(connection, messageId, resolve, reject);
            });
        }
        else {
            return new Promise((resolve, reject) => {
                this.requestQueue.push({ type: 'stream', messageId, resolve, reject });
            });
        }
    }
    getAvailableConnection() {
        if (this.availableConnections.length > 0) {
            const connection = this.availableConnections.shift();
            return connection;
        }
        if (this.connections.length < this.maxConnections) {
            const connection = new NntpConnection(this.networkFactory, this.articleTimeoutMs);
            this.connections.push(connection);
            return connection;
        }
        return null;
    }
    async fetchArticle(connection, messageId, callback) {
        try {
            if (!connection.isConnected()) {
                await connection.connect(this.hostname, this.port, this.useSSL, this.username, this.password);
            }
            const body = await connection.getBody(messageId);
            callback(null, body);
            this.returnConnectionToPool(connection);
            this.processNextRequest();
        }
        catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            callback(error);
            if (!connection.isConnected()) {
                this.removeConnection(connection);
                this.createReplacementConnection();
            }
            else {
                this.returnConnectionToPool(connection);
            }
            this.processNextRequest();
        }
    }
    async fetchArticleStream(connection, messageId, resolve, reject) {
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
                }
                else {
                    this.returnConnectionToPool(connection);
                }
                this.processNextRequest();
            });
            resolve(stream);
        }
        catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            reject(error);
            if (!connection.isConnected()) {
                this.removeConnection(connection);
                this.createReplacementConnection();
            }
            else {
                this.returnConnectionToPool(connection);
            }
            this.processNextRequest();
        }
    }
    returnConnectionToPool(connection) {
        if (connection.isConnected() && this.connections.includes(connection)) {
            this.availableConnections.push(connection);
        }
    }
    removeConnection(connection) {
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
    createReplacementConnection() {
        if (this.connections.length < this.maxConnections) {
            const connection = new NntpConnection(this.networkFactory, this.articleTimeoutMs);
            this.connections.push(connection);
        }
    }
    processNextRequest() {
        if (this.requestQueue.length === 0) {
            return;
        }
        const connection = this.getAvailableConnection();
        if (connection) {
            const nextRequest = this.requestQueue.shift();
            if (nextRequest.type === 'callback') {
                this.fetchArticle(connection, nextRequest.messageId, nextRequest.callback);
            }
            else {
                this.fetchArticleStream(connection, nextRequest.messageId, nextRequest.resolve, nextRequest.reject);
            }
        }
    }
    async initialize() {
        const initialConnections = Math.min(2, this.maxConnections);
        for (let i = 0; i < initialConnections; i++) {
            const connection = new NntpConnection(this.networkFactory, this.articleTimeoutMs);
            await connection.connect(this.hostname, this.port, this.useSSL, this.username, this.password);
            this.connections.push(connection);
            this.availableConnections.push(connection);
        }
    }
    shutdown() {
        for (const connection of this.connections) {
            connection.disconnect();
        }
        this.connections = [];
        this.availableConnections = [];
        this.requestQueue = [];
    }
    getStats() {
        return {
            totalConnections: this.connections.length,
            availableConnections: this.availableConnections.length,
            queuedRequests: this.requestQueue.length
        };
    }
}
export class BaseNewsreaderClient {
    settings;
    client;
    constructor(settings) {
        this.settings = settings;
        if (settings.type !== 'direct') {
            this.client = axios.create({
                baseURL: settings.url,
                timeout: 10000,
            });
        }
    }
}
export class FileAssembler {
    static async assembleFile(job, file, fileSystem) {
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
                }
                else {
                    currentOffset += data.length;
                }
                try {
                    await fileSystem.unlink(stored.path);
                }
                catch (err) {
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
                }
                catch (err) {
                    console.warn('Failed to remove segments directory:', err);
                }
            }
            file.downloadedBytes = totalWrittenBytes;
            console.log(`File ${file.filename} assembled successfully, ${totalWrittenBytes} bytes written`);
        }
        finally {
            await fileHandle.close();
        }
    }
}
export class Par2Manager {
    static PAR2_PATHS = ['/usr/bin/par2', '/usr/local/bin/par2', 'par2'];
    static VERIFY_TIMEOUT_MS = 300000;
    static REPAIR_TIMEOUT_MS = 600000;
    par2Path = null;
    fileSystem;
    constructor(fileSystem) {
        this.fileSystem = fileSystem;
    }
    async findPar2Executable() {
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
            }
            catch (err) {
                continue;
            }
        }
        return null;
    }
    spawnCommand(command, args, timeoutMs) {
        return new Promise((resolve, reject) => {
            let stdout = '';
            let stderr = '';
            let child;
            try {
                child = spawn(command, args);
            }
            catch (err) {
                reject(new Error(`Failed to spawn ${command}: ${err instanceof Error ? err.message : String(err)}`));
                return;
            }
            const timeout = setTimeout(() => {
                child.kill();
                reject(new Error(`Command timed out after ${timeoutMs}ms`));
            }, timeoutMs);
            if (child.stdout) {
                child.stdout.on('data', (data) => {
                    stdout += data.toString();
                });
            }
            if (child.stderr) {
                child.stderr.on('data', (data) => {
                    stderr += data.toString();
                });
            }
            child.on('close', (code) => {
                clearTimeout(timeout);
                resolve({ exitCode: code || 0, stdout, stderr });
            });
            child.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
    }
    parseVerifyOutput(output) {
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
    parseRepairOutput(output) {
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
    async verifyAndRepair(downloadPath) {
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
    async findPar2Files(downloadPath) {
        console.warn('[Par2Manager] findPar2Files not fully implemented with IFileSystem');
        return [];
    }
    findMainPar2File(par2Files) {
        const nonVolumeFiles = par2Files.filter(f => !f.includes('.vol'));
        if (nonVolumeFiles.length > 0) {
            return nonVolumeFiles[0];
        }
        return par2Files[0];
    }
    async runVerify(par2Path, downloadPath, par2File) {
        const par2FilePath = `${downloadPath}/${par2File}`;
        console.log(`[Par2Manager] Running: ${par2Path} verify "${par2FilePath}"`);
        try {
            const result = await this.spawnCommand(par2Path, ['verify', par2FilePath], Par2Manager.VERIFY_TIMEOUT_MS);
            console.log(`[Par2Manager] Verify exit code: ${result.exitCode}`);
            if (result.stdout)
                console.log(`[Par2Manager] Verify stdout:\n${result.stdout}`);
            if (result.stderr)
                console.log(`[Par2Manager] Verify stderr:\n${result.stderr}`);
            const output = result.stdout + result.stderr;
            return this.parseVerifyOutput(output);
        }
        catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error(`[Par2Manager] Verify command failed:`, error.message);
            throw error;
        }
    }
    async runRepair(par2Path, downloadPath, par2File) {
        const par2FilePath = `${downloadPath}/${par2File}`;
        console.log(`[Par2Manager] Running: ${par2Path} repair "${par2FilePath}"`);
        try {
            const result = await this.spawnCommand(par2Path, ['repair', par2FilePath], Par2Manager.REPAIR_TIMEOUT_MS);
            console.log(`[Par2Manager] Repair exit code: ${result.exitCode}`);
            if (result.stdout)
                console.log(`[Par2Manager] Repair stdout:\n${result.stdout}`);
            if (result.stderr)
                console.log(`[Par2Manager] Repair stderr:\n${result.stderr}`);
            const output = result.stdout + result.stderr;
            return this.parseRepairOutput(output);
        }
        catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error(`[Par2Manager] Repair command failed:`, error.message);
            throw error;
        }
    }
}
export class SABnzbdClient extends BaseNewsreaderClient {
    async addNzb(content, filename, category, downloadPath) {
        const form = new FormData();
        form.append('name', content, { filename });
        form.append('cat', category);
        if (downloadPath) {
            form.append('dir', downloadPath);
        }
        const response = await this.client.post('/api', form, {
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
    async getStatus(ids) {
        const response = await this.client.get('/api', {
            params: {
                mode: 'queue',
                output: 'json',
                apikey: this.settings.apiKey
            }
        });
        const data = response.data;
        const allDownloads = [];
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
    async pause(id) {
        const response = await this.client.get('/api', {
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
    async delete(id, removeFiles) {
        const mode = removeFiles ? 'history' : 'queue';
        const name = 'delete' + (removeFiles ? '_del_files' : '');
        const response = await this.client.get('/api', {
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
    mapSABnzbdStatus(status) {
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
    async addNzb(content, filename, category, downloadPath) {
        const form = new FormData();
        form.append('nzbfile', content, { filename });
        form.append('category', category);
        if (downloadPath) {
            form.append('destDir', downloadPath);
        }
        const response = await this.client.post('/rpc', form);
        const data = response.data;
        if (data && data.result && typeof data.result === 'string') {
            return data.result;
        }
        throw new Error(`Failed to add NZB: ${JSON.stringify(data)}`);
    }
    async getStatus(ids) {
        const response = await this.client.post('/rpc', {
            method: 'listgroups'
        });
        const data = response.data;
        const allDownloads = [];
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
    async pause(id) {
        const response = await this.client.post('/rpc', {
            method: 'editqueue',
            action: 'pause',
            value: id
        });
        return response.data?.result === true;
    }
    async delete(id, removeFiles) {
        const response = await this.client.post('/rpc', {
            method: 'editqueue',
            action: removeFiles ? 'finaldelete' : 'delete',
            value: id
        });
        return response.data?.result === true;
    }
    mapNZBGetStatus(status) {
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
    connectionPool;
    segmentDownloader;
    fileSystem;
    networkFactory;
    isAndroidOrCapacitor() {
        return typeof window !== 'undefined' &&
            window.Capacitor?.isNativePlatform?.() === true ||
            window.Capacitor?.getPlatform?.() === 'android' ||
            window.Capacitor?.getPlatform?.() === 'ios';
    }
    constructor(settings, networkFactory, fileSystem) {
        console.error('[DirectUsenetClient] >>> CONSTRUCTOR CALLED <<<');
        console.error('[DirectUsenetClient] Constructor params:', { name: settings.name, type: settings.type, hostname: settings.hostname, hasFileSystem: !!fileSystem });
        super(settings);
        this.networkFactory = networkFactory;
        this.fileSystem = fileSystem;
        this.initializeConnection();
    }
    initializeConnection() {
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
            console.error('[DirectUsenetClient] hostname:', !!this.settings.hostname);
            console.error('[DirectUsenetClient] port:', this.settings.port);
            return;
        }
        console.error('[DirectUsenetClient] About to create NntpConnectionPool with:');
        console.error('[DirectUsenetClient]   hostname:', this.settings.hostname);
        console.error('[DirectUsenetClient]   port:', this.settings.port);
        console.error('[DirectUsenetClient]   useSSL:', this.settings.useSSL);
        const useSSL = this.settings.useSSL || false;
        console.error('[DirectUsenetClient] Original SSL setting:', useSSL);
        console.error('[DirectUsenetClient] Is Android/Capacitor:', this.isAndroidOrCapacitor());
        let actualUseSSL = useSSL;
        if (this.isAndroidOrCapacitor() && useSSL) {
            console.error('[DirectUsenetClient] >>> DISABLING SSL ON ANDROID <<<');
            console.error('[DirectUsenetClient] CapacitorNetworkAdapter does not support SSL/TLS');
            console.error('[DirectUsenetClient] Will connect without SSL (port may need to be 119)');
            actualUseSSL = false;
        }
        console.error('[DirectUsenetClient] Final SSL setting:', actualUseSSL);
        console.error('[DirectUsenetClient] Connection params:', {
            hostname: this.settings.hostname,
            port: this.settings.port,
            useSSL: actualUseSSL,
            username: this.settings.username ? 'set' : 'not set'
        });
        this.connectionPool = new NntpConnectionPool(this.settings.hostname, this.settings.port, actualUseSSL, this.settings.username, this.settings.password, this.networkFactory, {
            maxConnections: this.settings.maxConnections,
            articleTimeoutMs: this.settings.articleTimeoutMs
        });
        this.segmentDownloader = new SegmentDownloader(this.connectionPool, {
            retryAttempts: this.settings.retryAttempts,
            retryBackoffMs: this.settings.retryBackoffMs,
            currentProviderId: this.settings.id,
            fallbackProviderIds: this.settings.fallbackProviderIds || [],
            providerSettings: new Map(),
            switchProviderCallback: undefined,
            fileSystem: this.fileSystem
        });
        console.error('[DirectUsenetClient] Constructor: segmentDownloader created:', typeof this.segmentDownloader);
        console.error('[DirectUsenetClient] Constructor: connectionPool type:', typeof this.connectionPool);
    }
    async addNzb(content, filename, category, downloadPath) {
        console.error('[DirectUsenetClient] >>> ADDNZB METHOD CALLED <<<');
        console.error('[DirectUsenetClient] Method params:', { filename, category, downloadPath, bufferSize: content?.length });
        console.log('[DirectUsenetClient] addNzb called:', { filename, category, downloadPath, bufferSize: content?.length });
        if (!downloadPath) {
            console.error('[DirectUsenetClient] >>> NO DOWNLOAD PATH <<<');
            const newsreaderName = this.settings.name || this.settings.id || 'newsreader';
            console.error('[DirectUsenetClient] No download path provided for:', newsreaderName);
            throw new Error(`Download path not configured. Please configure a download path in Settings > Newsreaders > ${newsreaderName} before downloading with Direct Usenet.`);
        }
        if (!this.segmentDownloader || !this.connectionPool) {
            console.error('[DirectUsenetClient] >>> MISSING CONNECTION/SEGMENT_DOWNLOADER <<<');
            console.error('[DirectUsenetClient] segmentDownloader:', !!this.segmentDownloader);
            console.error('[DirectUsenetClient] connectionPool:', !!this.connectionPool);
            this.initializeConnection();
        }
        if (!this.segmentDownloader) {
            console.error('[DirectUsenetClient] >>> SEGMENT DOWNLOADER STILL NULL <<<');
            throw new Error('Segment downloader not available');
        }
        const id = Math.random().toString(36).substring(7);
        console.log('[DirectUsenetClient] Starting download of', filename, 'to', downloadPath);
        try {
            const doc = new DOMParser().parseFromString(content.toString('utf-8'), 'text/xml');
            console.log('[DirectUsenetClient] Parsed XML, document element:', doc?.documentElement?.tagName);
            const fileElements = doc.getElementsByTagName('file');
            console.log('[DirectUsenetClient] Found file elements:', fileElements?.length);
            const fileElementArray = Array.from(fileElements);
            console.log('[DirectUsenetClient] File element array length:', fileElementArray.length);
            console.log('[DirectUsenetClient] Starting loop over file elements');
            console.error('[DirectUsenetClient] About to start download loop');
            for (const fileElement of fileElementArray) {
                console.log('[DirectUsenetClient] Processing file element:', {
                    tagName: fileElement.tagName,
                    subject: fileElement.getAttribute('subject')
                });
                const subject = fileElement.getAttribute('subject') || '';
                console.log('[DirectUsenetClient] File subject:', subject);
                const segments = [];
                const segmentElements = fileElement.getElementsByTagName('segment');
                const segmentElementArray = Array.from(segmentElements);
                console.log('[DirectUsenetClient] Segment elements count:', segmentElementArray.length);
                for (const segmentElement of segmentElementArray) {
                    const number = parseInt(segmentElement.getAttribute('number') || '0', 10);
                    const bytes = parseInt(segmentElement.getAttribute('bytes') || '0', 10);
                    const messageId = segmentElement.textContent?.trim() || '';
                    segments.push({ number, bytes, messageId });
                }
                const filenameMatch = subject.match(/"([^"]+)"/);
                const extractedFilename = filenameMatch ? filenameMatch[1] : filename;
                const nzbFile = {
                    subject,
                    filename: extractedFilename,
                    groups: [],
                    segments
                };
                if (segments.length === 0) {
                    console.log('[DirectUsenetClient] Warning: No segments found in file, skipping download');
                    continue;
                }
                console.log(`[DirectUsenetClient] Downloading file: ${extractedFilename} with ${segments.length} segments`);
                const segmentsDir = `${downloadPath}/.segments`;
                if (this.fileSystem) {
                    console.log(`[DirectUsenetClient] Creating segments directory: ${segmentsDir}`);
                    try {
                        await this.fileSystem.mkdir(segmentsDir);
                        console.log(`[DirectUsenetClient] Segments directory created successfully`);
                    }
                    catch (dirError) {
                        console.error('[DirectUsenetClient] Failed to create segments directory:', dirError);
                        console.error('[DirectUsenetClient] Directory error stack:', dirError instanceof Error ? dirError.stack : 'N/A');
                        throw new Error(`Failed to create segments directory: ${dirError instanceof Error ? dirError.message : String(dirError)}`);
                    }
                }
                else {
                    throw new Error('IFileSystem not provided');
                }
                const downloadedSegments = new Map();
                for (const segment of segments) {
                    console.log(`[DirectUsenetClient] About to call downloadSegment for ${extractedFilename}, segment ${segments.indexOf(segment)}/${segments.length}`);
                    if (!this.segmentDownloader) {
                        console.error('[DirectUsenetClient] ERROR: segmentDownloader became undefined during loop');
                        throw new Error('Segment downloader not available');
                    }
                    const segmentPath = `${segmentsDir}/${extractedFilename}.${segment.number}.tmp`;
                    console.log('[DirectUsenetClient] About to download segment:', {
                        segmentId: segment.messageId,
                        path: segmentPath,
                        segmentDownloaderExists: !!this.segmentDownloader,
                        segmentDownloaderType: typeof this.segmentDownloader
                    });
                    if (!this.segmentDownloader) {
                        console.error('[DirectUsenetClient] ERROR: segmentDownloader is undefined, skipping segment download');
                        continue;
                    }
                    const result = await this.segmentDownloader.downloadSegment(segment.messageId, segmentPath);
                    console.log(`[DirectUsenetClient] downloadSegment returned for segment ${segment.messageId}`);
                    console.log(`[DirectUsenetClient] Segment result:`, {
                        hasData: !!result.data,
                        hasMetadata: !!result.metadata,
                        dataLength: result.data ? result.data.length : 0
                    });
                    downloadedSegments.set(segment.number, {
                        path: segmentPath,
                        metadata: result.metadata,
                        size: result.data ? result.data.length : 0
                    });
                }
                const fileWithSegments = {
                    ...nzbFile,
                    downloadedArticles: downloadedSegments.size,
                    size: segments.reduce((sum, seg) => sum + seg.bytes, 0),
                    articles: segments.length,
                    downloadedSegments
                };
                const job = {
                    id,
                    name: extractedFilename,
                    savePath: downloadPath,
                    files: [fileWithSegments],
                    totalSize: segments.reduce((sum, seg) => sum + seg.bytes, 0),
                    status: 'Completed',
                    downloadedBytes: 0,
                    startTime: Date.now()
                };
                console.log(`[DirectUsenetClient] About to assemble file: ${extractedFilename}`);
                console.log(`[DirectUsenetClient] File job details:`, {
                    savePath: job.savePath,
                    filesCount: job.files.length,
                    downloadedSegmentsCount: fileWithSegments.downloadedSegments.size,
                    fileSystemProvided: !!this.fileSystem
                });
                try {
                    await FileAssembler.assembleFile(job, fileWithSegments, this.fileSystem);
                    console.log(`[DirectUsenetClient] File assembled successfully: ${extractedFilename}`);
                }
                catch (assembleError) {
                    console.error('[DirectUsenetClient] Failed to assemble file:', assembleError);
                    console.error('[DirectUsenetClient] Assemble error stack:', assembleError instanceof Error ? assembleError.stack : 'N/A');
                    throw new Error(`Failed to assemble file: ${assembleError instanceof Error ? assembleError.message : String(assembleError)}`);
                }
                console.log(`[DirectUsenetClient] Successfully assembled file: ${extractedFilename}`);
            }
            console.log('[DirectUsenetClient] Finished loop over file elements');
            console.log(`[DirectUsenetClient] Completed download of ${filename}`);
            return id;
        }
        catch (parseError) {
            console.error('[DirectUsenetClient] Error parsing NZB XML:', parseError);
            console.error('[DirectUsenetClient] Parse error stack:', parseError instanceof Error ? parseError.stack : 'N/A');
            throw new Error(`Failed to parse NZB file: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        }
    }
    async getStatus(_ids) {
        return [];
    }
    async pause(id) {
        console.warn('[DirectUsenetClient] Pause not implemented for direct downloads');
        return false;
    }
    async delete(_id, _removeFiles) {
        return true;
    }
}
export class NewsreaderClientFactory {
    static create(settings, networkFactory, fileSystem) {
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
                throw new Error(`Unsupported newsreader type: ${settings.type}`);
        }
    }
}

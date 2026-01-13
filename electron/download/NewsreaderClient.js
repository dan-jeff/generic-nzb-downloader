import axios from 'axios';
import FormData from 'form-data';
import * as net from 'net';
import * as tls from 'tls';
import { DOMParser } from '@xmldom/xmldom';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
// @ts-ignore - No types available for node-7z
import Seven from 'node-7z';
import sevenBin from '7zip-bin';
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
export class SegmentDownloader {
    connectionPool;
    failedSegments = new Set();
    fallbackManager;
    config;
    perSegmentProviders = new Map();
    constructor(connectionPool, config) {
        this.connectionPool = connectionPool;
        this.config = config;
        this.fallbackManager = new FallbackManager(config.currentProviderId, config.fallbackProviderIds, config.retryAttempts || 3);
    }
    async downloadSegment(messageId) {
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
export class NntpConnection {
    socket = null;
    hostname;
    port;
    useSSL;
    username;
    password;
    connected = false;
    currentGroup;
    reconnectAttempts = 0;
    maxReconnectAttempts = 3;
    reconnectDelayMs = 1000;
    articleTimeoutMs;
    connectTimeoutMs = 30000;
    responseBuffer = '';
    constructor(articleTimeoutMs = 15000) {
        this.hostname = '';
        this.port = 119;
        this.useSSL = false;
        this.articleTimeoutMs = articleTimeoutMs;
    }
    async connect(hostname, port, useSSL, username, password) {
        this.hostname = hostname;
        this.port = port;
        this.useSSL = useSSL;
        this.username = username;
        this.password = password;
        this.responseBuffer = '';
        return new Promise((resolve, reject) => {
            const connectTimeout = setTimeout(() => {
                this.connected = false;
                this.socket?.destroy();
                reject(new Error(`Connection timeout after ${this.connectTimeoutMs}ms`));
            }, this.connectTimeoutMs);
            try {
                if (useSSL) {
                    this.socket = tls.connect({
                        host: hostname,
                        port: port,
                        rejectUnauthorized: false
                    });
                }
                else {
                    this.socket = net.connect({
                        host: hostname,
                        port: port
                    });
                }
                this.socket.on('connect', () => {
                    clearTimeout(connectTimeout);
                });
                this.socket.on('data', (data) => {
                    this.responseBuffer += data.toString('latin1');
                    this.processResponseBuffer();
                });
                this.socket.on('error', (err) => {
                    clearTimeout(connectTimeout);
                    this.connected = false;
                    reject(err);
                });
                this.socket.on('close', (hadErr) => {
                    clearTimeout(connectTimeout);
                    if (hadErr) {
                        this.connected = false;
                        reject(new Error('Connection closed due to error'));
                    }
                });
                this.readGreeting()
                    .then(() => {
                    this.authenticate()
                        .then(() => {
                        this.connected = true;
                        resolve();
                    })
                        .catch((authErr) => {
                        this.connected = false;
                        reject(authErr);
                    });
                })
                    .catch((err) => {
                    this.connected = false;
                    reject(err);
                });
            }
            catch (err) {
                clearTimeout(connectTimeout);
                reject(err);
            }
        });
    }
    async readGreeting() {
        const response = await this.readResponse();
        const code = parseInt(response.substring(0, 3), 10);
        if (code !== 200 && code !== 201) {
            throw new Error(`Unexpected greeting: ${response}`);
        }
    }
    async authenticate() {
        if (!this.username || !this.password) {
            return;
        }
        const userResponse = await this.sendCommand(`AUTHINFO USER ${this.username}`);
        const userCode = parseInt(userResponse.substring(0, 3), 10);
        if (userCode === 381) {
            const passResponse = await this.sendCommand(`AUTHINFO PASS ${this.password}`);
            const passCode = parseInt(passResponse.substring(0, 3), 10);
            if (passCode !== 281) {
                throw new Error(`Authentication failed: ${passResponse}`);
            }
        }
        else if (userCode !== 281) {
            throw new Error(`Authentication failed: ${userResponse}`);
        }
    }
    async sendCommand(command, options = {}) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Timeout waiting for response to: ${command}`));
            }, this.articleTimeoutMs);
            this.expectMultiLine = Boolean(options.multiline);
            this.commandCallback = (response, error) => {
                clearTimeout(timeout);
                if (error) {
                    reject(error);
                    return;
                }
                resolve(response);
            };
            try {
                this.socket?.write(`${command}\r\n`, 'utf-8', (err) => {
                    if (err) {
                        clearTimeout(timeout);
                        this.commandCallback = null;
                        reject(err);
                    }
                });
            }
            catch (err) {
                clearTimeout(timeout);
                this.commandCallback = null;
                reject(err);
            }
        });
    }
    commandCallback = null;
    pendingMultiLine = false;
    expectMultiLine = false;
    multiLineBuffer = [];
    processResponseBuffer() {
        while (true) {
            const newlineIndex = this.responseBuffer.indexOf('\r\n');
            if (newlineIndex === -1) {
                break;
            }
            const line = this.responseBuffer.substring(0, newlineIndex);
            this.responseBuffer = this.responseBuffer.substring(newlineIndex + 2);
            if (!this.pendingMultiLine) {
                const code = parseInt(line.substring(0, 3), 10);
                if (isNaN(code)) {
                    if (this.commandCallback) {
                        this.commandCallback('', new Error(`Invalid response: ${line}`));
                        this.commandCallback = null;
                    }
                    return;
                }
                if (this.expectMultiLine) {
                    this.expectMultiLine = false;
                    if (code === 220 || code === 222) {
                        this.pendingMultiLine = true;
                        this.multiLineBuffer = [line];
                        continue;
                    }
                }
                if (this.commandCallback) {
                    this.commandCallback(line, null);
                    this.commandCallback = null;
                }
            }
            else {
                if (line === '.') {
                    this.pendingMultiLine = false;
                    const response = this.multiLineBuffer.join('\r\n');
                    if (this.commandCallback) {
                        this.commandCallback(response, null);
                        this.commandCallback = null;
                    }
                    this.multiLineBuffer = [];
                }
                else {
                    let dataLine = line;
                    if (dataLine.startsWith('..')) {
                        dataLine = dataLine.substring(1);
                    }
                    this.multiLineBuffer.push(dataLine);
                }
            }
        }
    }
    async readResponse() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Timeout waiting for response'));
            }, this.articleTimeoutMs);
            this.commandCallback = (response, error) => {
                clearTimeout(timeout);
                if (error) {
                    reject(error);
                    return;
                }
                resolve(response);
            };
        });
    }
    async ensureConnected() {
        if (!this.connected && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            await new Promise(resolve => setTimeout(resolve, this.reconnectDelayMs));
            await this.connect(this.hostname, this.port, this.useSSL, this.username, this.password);
        }
        if (!this.connected) {
            throw new Error('NNTP connection failed');
        }
    }
    async getBody(messageId) {
        await this.ensureConnected();
        const response = await this.sendCommand(`BODY <${messageId}>`, { multiline: true });
        const code = parseInt(response.substring(0, 3), 10);
        if (code !== 220 && code !== 222) {
            this.connected = false;
            throw new Error(`Failed to get body: ${response}`);
        }
        const body = response.substring(response.indexOf('\r\n') + 2);
        return body;
    }
    async getArticle(messageId) {
        await this.ensureConnected();
        const response = await this.sendCommand(`ARTICLE <${messageId}>`, { multiline: true });
        const code = parseInt(response.substring(0, 3), 10);
        if (code !== 220) {
            this.connected = false;
            throw new Error(`Failed to get article: ${response}`);
        }
        const separatorIndex = response.indexOf('\r\n\r\n');
        if (separatorIndex === -1) {
            return { headers: {}, body: response.substring(response.indexOf('\r\n') + 2) };
        }
        const headersPart = response.substring(response.indexOf('\r\n') + 2, separatorIndex);
        const bodyPart = response.substring(separatorIndex + 4);
        const headers = {};
        const headerLines = headersPart.split('\r\n');
        for (const line of headerLines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
                const name = line.substring(0, colonIndex).toLowerCase();
                const value = line.substring(colonIndex + 1).trim();
                headers[name] = value;
            }
        }
        return { headers, body: bodyPart };
    }
    async setGroup(group) {
        await this.ensureConnected();
        const response = await this.sendCommand(`GROUP ${group}`);
        const code = parseInt(response.substring(0, 3), 10);
        if (code !== 211) {
            this.connected = false;
            throw new Error(`Failed to set group: ${response}`);
        }
        this.currentGroup = group;
    }
    disconnect() {
        this.connected = false;
        this.currentGroup = undefined;
        this.responseBuffer = '';
        this.commandCallback = null;
        this.pendingMultiLine = false;
        this.multiLineBuffer = [];
        try {
            if (this.socket && !this.socket.destroyed) {
                this.socket.end();
                this.socket.destroy();
            }
        }
        catch (err) {
            console.error('Error disconnecting NNTP client:', err);
        }
        this.socket = null;
    }
    isConnected() {
        return this.connected && this.socket !== null && !this.socket.destroyed;
    }
    getCurrentGroup() {
        return this.currentGroup;
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
    constructor(hostname, port, useSSL, username, password, config = {}) {
        this.hostname = hostname;
        this.port = port;
        this.useSSL = useSSL;
        this.username = username;
        this.password = password;
        this.maxConnections = config.maxConnections || 10;
        this.articleTimeoutMs = config.articleTimeoutMs || 15000;
    }
    async request(messageId, callback) {
        const connection = this.getAvailableConnection();
        if (connection) {
            this.fetchArticle(connection, messageId, callback);
        }
        else {
            this.requestQueue.push({ messageId, callback });
        }
    }
    getAvailableConnection() {
        if (this.availableConnections.length > 0) {
            const connection = this.availableConnections.shift();
            return connection;
        }
        if (this.connections.length < this.maxConnections) {
            const connection = new NntpConnection(this.articleTimeoutMs);
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
            const connection = new NntpConnection(this.articleTimeoutMs);
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
            this.fetchArticle(connection, nextRequest.messageId, nextRequest.callback);
        }
    }
    async initialize() {
        const initialConnections = Math.min(2, this.maxConnections);
        for (let i = 0; i < initialConnections; i++) {
            const connection = new NntpConnection(this.articleTimeoutMs);
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
    static async assembleFile(job, file) {
        if (!job.savePath) {
            throw new Error('Save path not set');
        }
        const filePath = job.name ? path.join(job.savePath, file.filename) : file.filename;
        const fileHandle = await fs.promises.open(filePath, 'w');
        try {
            let currentOffset = 0;
            let totalWrittenBytes = 0;
            const segmentsWithMetadata = Array.from(file.downloadedSegments.entries()).map(([segNum, decoded]) => {
                const segmentInfo = file.segments.find(s => s.number === segNum);
                return {
                    decoded,
                    sortKey: segmentInfo ? segmentInfo.number : segNum
                };
            }).sort((a, b) => a.sortKey - b.sortKey);
            console.log(`Assembling file ${file.filename} with ${segmentsWithMetadata.length} segments`);
            for (const { decoded } of segmentsWithMetadata) {
                const data = decoded.data;
                let writeOffset = currentOffset;
                if (typeof decoded.metadata.begin === 'number') {
                    writeOffset = Math.max(0, decoded.metadata.begin - 1);
                }
                await fileHandle.write(data, 0, data.length, writeOffset);
                totalWrittenBytes += data.length;
                if (typeof decoded.metadata.begin === 'number') {
                    currentOffset = Math.max(currentOffset, writeOffset + data.length);
                }
                else {
                    currentOffset += data.length;
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
        try {
            const entries = await fs.promises.readdir(downloadPath);
            return entries
                .filter(entry => entry.toLowerCase().endsWith('.par2'))
                .sort((a, b) => a.localeCompare(b));
        }
        catch (err) {
            console.error(`[Par2Manager] Error reading directory ${downloadPath}:`, err);
            return [];
        }
    }
    findMainPar2File(par2Files) {
        const nonVolumeFiles = par2Files.filter(f => !f.includes('.vol'));
        if (nonVolumeFiles.length > 0) {
            return nonVolumeFiles[0];
        }
        return par2Files[0];
    }
    async runVerify(par2Path, downloadPath, par2File) {
        const par2FilePath = path.join(downloadPath, par2File);
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
        const par2FilePath = path.join(downloadPath, par2File);
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
            if (error.message.includes('timed out')) {
                return { success: false, repaired: 0, message: 'Repair operation timed out' };
            }
            return { success: false, repaired: 0, message: `Repair failed: ${error.message}` };
        }
    }
}
export class DirectUsenetClient extends BaseNewsreaderClient {
    activeDownloads = new Map();
    connectionPool;
    segmentDownloader;
    pausedDownloads = new Set();
    providerSettings = new Map();
    fallbackProviderIds = [];
    connectionPools = new Map();
    async addNzb(content, filename, _category, downloadPath, autoExtract) {
        const id = Math.random().toString(36).substring(7);
        const parser = new DOMParser();
        const doc = parser.parseFromString(content.toString(), 'text/xml');
        const files = doc.getElementsByTagName('file');
        const downloadFiles = [];
        let totalSize = 0;
        // Process individual files
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const subject = file.getAttribute('subject') || '';
            const fileSegments = file.getElementsByTagName('segment');
            const groupsElement = file.getElementsByTagName('groups')[0];
            const groupElements = groupsElement?.getElementsByTagName('group') || [];
            const groups = [];
            for (let j = 0; j < groupElements.length; j++) {
                groups.push(groupElements[j].textContent || '');
            }
            const segments = [];
            let fileSize = 0;
            for (let j = 0; j < fileSegments.length; j++) {
                const seg = fileSegments[j];
                const number = parseInt(seg.getAttribute('number') || '0', 10);
                const bytes = parseInt(seg.getAttribute('bytes') || '0', 10);
                const messageId = seg.textContent || '';
                segments.push({ number, bytes, messageId });
                fileSize += bytes;
            }
            // Try to extract a clean filename from the subject
            // Standard format often is "Subject [01/50] - "filename.ext" yEnc"
            let fileOutputName = `file_${i}`;
            const match = /"([^"]+)"/.exec(subject);
            if (match) {
                fileOutputName = match[1];
            }
            else {
                // Fallback to simpler cleaning if no quotes
                fileOutputName = subject.split(' ')[0] || `file_${i}`;
            }
            if (/\.par2$/i.test(fileOutputName)) {
                continue;
            }
            downloadFiles.push({
                subject,
                filename: fileOutputName,
                groups,
                segments,
                downloadedArticles: 0,
                size: fileSize,
                articles: fileSegments.length,
                downloadedSegments: new Map(),
                downloadedBytes: 0
            });
        }
        // Calculate total size from all files
        totalSize = downloadFiles.reduce((sum, f) => sum + f.size, 0);
        const totalArticles = downloadFiles.reduce((sum, f) => sum + f.articles, 0);
        // Determine clean name and folder structure for the JOB itself
        const cleanName = filename.replace(/\.nzb$/i, '');
        // Create a dedicated folder for this download job
        const finalDownloadPath = downloadPath ? path.join(downloadPath, cleanName) : cleanName;
        this.activeDownloads.set(id, {
            id,
            name: cleanName,
            savePath: finalDownloadPath,
            files: downloadFiles,
            totalSize,
            downloadedArticles: 0,
            totalArticles,
            status: 'Downloading',
            downloadedBytes: 0,
            startTime: Date.now(),
            autoExtract: autoExtract ?? true // Default to true if not provided, though Manager should provide it
        });
        // Start background download (mocked for now, but with real connection logic)
        this.processDownload(id);
        return id;
    }
    cleanupConnectionPool() {
        for (const [providerId, pool] of this.connectionPools) {
            pool.shutdown();
            this.connectionPools.delete(providerId);
        }
        this.connectionPool = undefined;
    }
    async switchProvider(newProviderId) {
        if (this.connectionPools.has(newProviderId)) {
            const pool = this.connectionPools.get(newProviderId);
            if (pool) {
                this.connectionPool = pool;
                console.log(`Switched to existing connection pool for provider ${newProviderId}`);
                return pool;
            }
        }
        const settings = this.providerSettings.get(newProviderId);
        if (!settings) {
            throw new Error(`No settings found for provider ${newProviderId}`);
        }
        const newPool = new NntpConnectionPool(settings.hostname, settings.port, settings.useSSL, settings.username, settings.password, {
            maxConnections: this.settings.maxConnections || 10,
            articleTimeoutMs: this.settings.articleTimeoutMs || 15000
        });
        await newPool.initialize();
        this.connectionPools.set(newProviderId, newPool);
        this.connectionPool = newPool;
        console.log(`Created new connection pool for provider ${newProviderId}`);
        return newPool;
    }
    registerFallbackProvider(providerId, settings) {
        this.providerSettings.set(providerId, settings);
    }
    async processDownload(id) {
        const download = this.activeDownloads.get(id);
        if (!download)
            return;
        // Create the target directory if it doesn't exist
        if (download.savePath && !fs.existsSync(download.savePath)) {
            try {
                fs.mkdirSync(download.savePath, { recursive: true });
            }
            catch (err) {
                console.error('Failed to create download directory:', err);
                download.status = 'Failed';
                return;
            }
        }
        try {
            this.fallbackProviderIds = this.settings.fallbackProviderIds || [];
            this.providerSettings.set(this.settings.id, {
                hostname: this.settings.hostname || 'localhost',
                port: this.settings.port || 119,
                useSSL: this.settings.useSSL || false,
                username: this.settings.username,
                password: this.settings.password || ''
            });
            for (const fallbackId of this.fallbackProviderIds) {
                const fallbackSettings = this.providerSettings.get(fallbackId);
                if (!fallbackSettings) {
                    console.warn(`Fallback provider ${fallbackId} is configured but no settings available. Call registerFallbackProvider() to configure it.`);
                }
            }
            const primarySettings = this.providerSettings.get(this.settings.id);
            this.connectionPool = new NntpConnectionPool(primarySettings.hostname, primarySettings.port, primarySettings.useSSL, primarySettings.username, primarySettings.password, {
                maxConnections: this.settings.maxConnections || 10,
                articleTimeoutMs: this.settings.articleTimeoutMs || 15000
            });
            await this.connectionPool.initialize();
            this.connectionPools.set(this.settings.id, this.connectionPool);
            this.segmentDownloader = new SegmentDownloader(this.connectionPool, {
                retryAttempts: this.settings.retryAttempts || 3,
                retryBackoffMs: this.settings.retryBackoffMs || 1000,
                currentProviderId: this.settings.id,
                fallbackProviderIds: this.fallbackProviderIds,
                providerSettings: this.providerSettings,
                switchProviderCallback: async (newProviderId) => {
                    return await this.switchProvider(newProviderId);
                }
            });
            await this.downloadSegments(id);
            // Switch to assembling state
            const d = this.activeDownloads.get(id);
            if (d) {
                d.status = 'Assembling';
                await this.assembleFiles(id);
            }
            // Switch to repairing state (PAR2 verification/repair)
            const d3 = this.activeDownloads.get(id);
            if (d3 && d3.savePath) {
                d3.status = 'Repairing';
                const par2Manager = new Par2Manager();
                const par2Result = await par2Manager.verifyAndRepair(d3.savePath);
                if (par2Result.needsRepair && !par2Result.repaired) {
                    console.error(`PAR2 repair failed: ${par2Result.message}`);
                    d3.status = 'Failed';
                    this.cleanupConnectionPool();
                    return;
                }
            }
            // Extraction (Configurable)
            const dExtract = this.activeDownloads.get(id);
            if (dExtract && dExtract.autoExtract) {
                dExtract.status = 'Extracting';
                await this.extractFiles(id);
            }
            const dFinal = this.activeDownloads.get(id);
            if (dFinal) {
                // If we extracted, extractFiles might have set status to Completed or Failed.
                // If we didn't extract, we need to set it here.
                if (dFinal.status !== 'Failed' && dFinal.status !== 'Completed') {
                    dFinal.status = 'Completed';
                }
            }
            this.cleanupConnectionPool();
        }
        catch (error) {
            console.error('Direct download error:', error);
            const d = this.activeDownloads.get(id);
            if (d) {
                d.status = 'Failed';
            }
            this.cleanupConnectionPool();
        }
    }
    async downloadSegments(id) {
        const download = this.activeDownloads.get(id);
        if (!download || !this.segmentDownloader)
            return;
        const maxConcurrent = this.settings.maxConnections || 10;
        const allSegments = [];
        for (let fileIndex = 0; fileIndex < download.files.length; fileIndex++) {
            const file = download.files[fileIndex];
            for (const segment of file.segments) {
                allSegments.push({ fileIndex, segment });
            }
        }
        let index = 0;
        const activeDownloads = new Map();
        const processSegment = async (fileIndex, segment) => {
            const d = this.activeDownloads.get(id);
            if (!d)
                return;
            if (this.pausedDownloads.has(id)) {
                while (this.pausedDownloads.has(id)) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    const currentD = this.activeDownloads.get(id);
                    if (!currentD)
                        return;
                }
            }
            try {
                const decoded = await this.segmentDownloader.downloadSegment(segment.messageId);
                const file = d.files[fileIndex];
                file.downloadedSegments.set(segment.number, decoded);
                file.downloadedArticles++;
                file.downloadedBytes = (file.downloadedBytes || 0) + decoded.data.length;
                d.downloadedArticles++;
                d.downloadedBytes = (d.downloadedBytes || 0) + decoded.data.length;
                d.progress = download.totalSize > 0 ? (d.downloadedBytes / download.totalSize) * 100 : 0;
                if (d.startTime) {
                    const elapsedSeconds = (Date.now() - d.startTime) / 1000;
                    if (elapsedSeconds > 0) {
                        d.speed = d.downloadedBytes / elapsedSeconds;
                        const remainingBytes = download.totalSize - d.downloadedBytes;
                        d.eta = d.speed > 0 ? remainingBytes / d.speed : 0;
                    }
                }
            }
            catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                console.error(`Failed to download segment ${segment.messageId}:`, error.message);
            }
        };
        while (index < allSegments.length) {
            while (activeDownloads.size < maxConcurrent && index < allSegments.length) {
                const { fileIndex, segment } = allSegments[index];
                const promise = processSegment(fileIndex, segment)
                    .finally(() => {
                    activeDownloads.delete(segment.messageId);
                });
                activeDownloads.set(segment.messageId, promise);
                index++;
            }
            if (activeDownloads.size > 0) {
                await Promise.race(Array.from(activeDownloads.values()));
            }
        }
        await Promise.all(Array.from(activeDownloads.values()));
        const failedSegments = this.segmentDownloader.getFailedSegments();
        if (failedSegments.length > 0) {
            const download = this.activeDownloads.get(id);
            if (download) {
                download.status = 'Failed';
            }
            console.error(`Download ${id} failed. ${failedSegments.length} segments could not be downloaded from any provider.`);
            console.error(`Failed segment IDs:`, failedSegments);
            const fallbackManager = this.segmentDownloader.getFallbackManager();
            const allStats = fallbackManager.getAllProviderStats();
            console.log('Provider statistics:');
            for (const [providerId, stats] of allStats) {
                console.log(`  ${providerId}: ${stats.segmentsDownloaded} segments downloaded, ${stats.fallbackUsageCount} times used as fallback`);
            }
            throw new Error(`${failedSegments.length} segments failed to download after trying all available providers`);
        }
        const fallbackManager = this.segmentDownloader.getFallbackManager();
        const allStats = fallbackManager.getAllProviderStats();
        console.log(`Download complete for ${id}. Provider statistics:`);
        for (const [providerId, stats] of allStats) {
            console.log(`  ${providerId}: ${stats.segmentsDownloaded} segments downloaded, ${stats.fallbackUsageCount} times used as fallback`);
        }
    }
    async assembleFiles(id) {
        const download = this.activeDownloads.get(id);
        if (!download || !download.savePath)
            return;
        console.log(`Starting file assembly for ${download.name}`);
        for (const file of download.files) {
            if (file.downloadedSegments.size === 0) {
                console.warn(`Skipping file ${file.filename} - no segments downloaded`);
                continue;
            }
            try {
                await FileAssembler.assembleFile(download, file);
                console.log(`Assembled ${file.filename}`);
            }
            catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                console.error(`Failed to assemble file ${file.filename}:`, error.message);
            }
        }
        console.log(`File assembly complete for ${download.name}`);
    }
    async extractFiles(id) {
        const download = this.activeDownloads.get(id);
        if (!download || !download.savePath) {
            console.error(`[DirectClient] Extract files failed: download not found or no save path for id ${id}`);
            return;
        }
        console.log(`[DirectClient] Starting extraction for ${download.name}`);
        let archivePath = null;
        try {
            const archives = download.files.filter(f => /\.(rar|part0*1\.rar|001|zip|7z)$/i.test(f.filename));
            if (archives.length > 0) {
                const mainArchive = archives[0].filename;
                archivePath = path.join(download.savePath, mainArchive);
                if (fs.existsSync(archivePath)) {
                    const stats = fs.statSync(archivePath);
                    if (stats.size === 0) {
                        console.warn(`[DirectClient] Archive file exists but is empty: ${archivePath}`);
                        archivePath = null;
                    }
                }
                else {
                    console.warn(`[DirectClient] Archive file not found: ${archivePath}`);
                    archivePath = null;
                }
            }
        }
        catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error(`[DirectClient] Error while locating archive: ${error.message}`);
            archivePath = null;
        }
        if (!archivePath) {
            console.log(`[DirectClient] No archive found to extract, assuming files are ready`);
            download.status = 'Completed';
            this.cleanupConnectionPool();
            return;
        }
        console.log(`[DirectClient] Extracting archive: ${archivePath}`);
        try {
            const myStream = Seven.extractFull(archivePath, download.savePath, {
                $bin: sevenBin.path7za,
                recursive: true,
                $progress: true
            });
            let currentFile = '';
            myStream.on('progress', (data) => {
                if (data && data.file) {
                    currentFile = data.file;
                    console.log(`[DirectClient] Extracting: ${currentFile}`);
                }
            });
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Extraction timed out'));
                }, 300000);
                myStream.on('end', () => {
                    clearTimeout(timeout);
                    resolve();
                });
                myStream.on('error', (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
            });
            console.log(`[DirectClient] Extraction complete for ${archivePath}`);
            download.status = 'Completed';
            this.cleanupConnectionPool();
        }
        catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.error(`[DirectClient] Extraction failed for ${archivePath}: ${error.message}`);
            if (error.stack) {
                console.error(`[DirectClient] Error stack: ${error.stack}`);
            }
            download.status = 'Failed';
            this.cleanupConnectionPool();
        }
    }
    async getStatus(ids) {
        return ids
            .filter(id => this.activeDownloads.has(id))
            .map(id => {
            const d = this.activeDownloads.get(id);
            const progress = d.progress || (d.downloadedArticles / d.totalArticles) * 100;
            const remainingSize = d.totalSize - (d.downloadedBytes || 0);
            const speed = d.speed || (d.status === 'Downloading' ? 1024 * 1024 * 5 : 0);
            const eta = d.eta !== undefined ? d.eta : (d.status === 'Downloading' && speed > 0 ? remainingSize / speed : 0);
            return {
                id,
                name: d.name,
                size: d.totalSize,
                remainingSize,
                progress,
                status: d.status,
                speed,
                eta,
                category: 'default',
                outputPath: d.savePath
            };
        });
    }
    async pause(id) {
        const d = this.activeDownloads.get(id);
        if (d) {
            if (d.status === 'Paused') {
                d.status = 'Downloading';
                this.pausedDownloads.delete(id);
            }
            else {
                d.status = 'Paused';
                this.pausedDownloads.add(id);
            }
            return true;
        }
        return false;
    }
    async delete(id, _removeFiles) {
        return this.activeDownloads.delete(id);
    }
    // Helper for actual NNTP connection (to be used by processDownload)
    // @ts-ignore - Keeping this for future reference/implementation
    async connectNNTP() {
        const { hostname, port, useSSL, username, password } = this.settings;
        return new Promise((resolve, reject) => {
            const socket = useSSL
                ? tls.connect(port || 563, hostname, { rejectUnauthorized: false })
                : net.connect(port || 119, hostname);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            // let authenticated = false;
            socket.on('data', (data) => {
                const response = data.toString();
                if (response.startsWith('200') || response.startsWith('201')) {
                    if (username) {
                        socket.write(`AUTHINFO USER ${username}\r\n`);
                    }
                    else {
                        resolve(socket);
                    }
                }
                else if (response.startsWith('381')) {
                    socket.write(`AUTHINFO PASS ${password}\r\n`);
                }
                else if (response.startsWith('281')) {
                    // authenticated = true;
                    resolve(socket);
                }
                else if (response.startsWith('502')) {
                    reject(new Error('Authentication failed'));
                }
            });
            socket.on('error', reject);
        });
    }
}
export class SABnzbdClient extends BaseNewsreaderClient {
    async addNzb(content, filename, category, downloadPath, _autoExtract) {
        const form = new FormData();
        form.append('nzbfile', content, { filename });
        const params = {
            mode: 'addfile',
            apikey: this.settings.apiKey,
            output: 'json',
            cat: category
        };
        if (downloadPath) {
            // SABnzbd doesn't officially support 'path' in addfile, but some versions/forks might.
            params.path = downloadPath;
        }
        const response = await this.client.post('/api', form, {
            params,
            headers: form.getHeaders()
        });
        if (response.data && response.data.status === true && response.data.nzo_ids && response.data.nzo_ids.length > 0) {
            return response.data.nzo_ids[0];
        }
        // Sometimes SABnzbd returns status: true but no nzo_ids if it's already in queue or history
        if (response.data && response.data.status === true) {
            // We might need to fetch the queue to find the ID, but for now we'll throw if no ID
            throw new Error('SABnzbd added NZB but did not return an ID');
        }
        throw new Error(`Failed to add NZB to SABnzbd: ${JSON.stringify(response.data)}`);
    }
    async getStatus(ids) {
        const response = await this.client.get('/api', {
            params: {
                mode: 'queue',
                apikey: this.settings.apiKey,
                output: 'json'
            }
        });
        if (!response.data || !response.data.queue) {
            return [];
        }
        const queue = response.data.queue;
        const slots = queue.slots || [];
        return slots
            .filter((slot) => ids.includes(slot.nzo_id))
            .map((slot) => ({
            id: slot.nzo_id,
            name: slot.filename,
            size: parseFloat(slot.mb) * 1024 * 1024,
            remainingSize: parseFloat(slot.mbleft) * 1024 * 1024,
            progress: parseFloat(slot.percentage),
            status: this.mapStatus(slot.status),
            speed: parseFloat(queue.kbpersec) * 1024,
            eta: this.parseEta(slot.timeleft),
            category: slot.cat
        }));
    }
    mapStatus(status) {
        const s = status.toLowerCase();
        if (s.includes('downloading'))
            return 'Downloading';
        if (s.includes('paused'))
            return 'Paused';
        if (s.includes('queued'))
            return 'Queued';
        if (s.includes('checking'))
            return 'Checking';
        if (s.includes('repairing'))
            return 'Repairing';
        if (s.includes('extracting'))
            return 'Extracting';
        if (s.includes('failed'))
            return 'Failed';
        if (s.includes('completed'))
            return 'Completed';
        return 'Queued';
    }
    parseEta(timeleft) {
        if (!timeleft || timeleft === '0:00:00')
            return 0;
        const parts = timeleft.split(':').map(Number);
        if (parts.length === 3) {
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
        return 0;
    }
    async pause(id) {
        const response = await this.client.get('/api', {
            params: {
                mode: 'queue',
                name: 'pause',
                value: id,
                apikey: this.settings.apiKey,
                output: 'json'
            }
        });
        return response.data && response.data.status === true;
    }
    async delete(id, _removeFiles) {
        const response = await this.client.get('/api', {
            params: {
                mode: 'queue',
                name: 'delete',
                value: id,
                apikey: this.settings.apiKey,
                output: 'json'
            }
        });
        return response.data && response.data.status === true;
    }
}
export class NZBGetClient extends BaseNewsreaderClient {
    async rpc(method, params = []) {
        // NZBGet uses http://user:pass@host:port/jsonrpc or http://host:port/user/pass/jsonrpc
        // We'll use the user/pass/jsonrpc format as it's common for NZBGet
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        // const authPath = this.settings.username && this.settings.password 
        //   ? `${encodeURIComponent(this.settings.username)}:${encodeURIComponent(this.settings.password)}/`
        //   : this.settings.apiKey ? `${this.settings.apiKey}/` : '';
        const url = `/jsonrpc`;
        // Since baseURL is set, we just need to append the auth path if we want, 
        // but axios auth is cleaner.
        const response = await this.client.post(url, {
            method,
            params,
            id: 1
        }, {
            auth: this.settings.username ? {
                username: this.settings.username,
                password: this.settings.password || ''
            } : undefined,
            // If no username, try to use apiKey in URL path if needed, 
            // but NZBGet usually uses Basic Auth or a path-based auth.
            // Let's assume Basic Auth first.
        });
        if (response.data.error) {
            throw new Error(`NZBGet RPC Error: ${response.data.error.message}`);
        }
        return response.data.result;
    }
    async addNzb(content, filename, category, _downloadPath, _autoExtract) {
        const result = await this.rpc('append', [
            filename,
            content.toString('base64'),
            category,
            0, // Priority
            false, // AddToTop
            false, // AddPaused
            '', // DupeKey
            0, // DupeScore
            'FORCE' // DupeMode
        ]);
        return result.toString();
    }
    async getStatus(ids) {
        const groups = await this.rpc('listgroups');
        const status = await this.rpc('status');
        return groups
            .filter((group) => ids.includes(group.NZBID.toString()))
            .map((group) => {
            const totalSize = (group.FileSizeHi * 4294967296) + group.FileSizeLo;
            const remainingSize = (group.RemainingSizeHi * 4294967296) + group.RemainingSizeLo;
            const progress = totalSize > 0 ? ((totalSize - remainingSize) / totalSize) * 100 : 0;
            return {
                id: group.NZBID.toString(),
                name: group.NZBName,
                size: totalSize,
                remainingSize: remainingSize,
                progress: progress,
                status: this.mapStatus(group.Status),
                speed: status.DownloadRate,
                eta: 0, // NZBGet doesn't provide per-group ETA easily in listgroups
                category: group.Category
            };
        });
    }
    mapStatus(status) {
        const s = status.toUpperCase();
        if (s.includes('DOWNLOADING'))
            return 'Downloading';
        if (s.includes('PAUSED'))
            return 'Paused';
        if (s.includes('QUEUED'))
            return 'Queued';
        if (s.includes('CHECKING'))
            return 'Checking';
        if (s.includes('REPAIRING'))
            return 'Repairing';
        if (s.includes('EXTRACTING'))
            return 'Extracting';
        if (s.includes('FAILURE'))
            return 'Failed';
        if (s.includes('SUCCESS'))
            return 'Completed';
        return 'Queued';
    }
    async pause(id) {
        await this.rpc('editqueue', ['GroupPause', 0, '', [parseInt(id, 10)]]);
        return true;
    }
    async delete(id, _removeFiles) {
        await this.rpc('editqueue', ['GroupDelete', 0, '', [parseInt(id, 10)]]);
        return true;
    }
}

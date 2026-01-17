import * as fs from 'fs';
class NodeFileHandle {
    handle;
    constructor(handle) {
        this.handle = handle;
    }
    async write(data, offset, length, position) {
        return await this.handle.write(data, offset, length, position);
    }
    async close() {
        await this.handle.close();
    }
}
export class NodeFSAdapter {
    writeStream(path) {
        return fs.createWriteStream(path);
    }
    async readFile(path) {
        return await fs.promises.readFile(path);
    }
    async exists(path) {
        try {
            await fs.promises.access(path);
            return true;
        }
        catch {
            return false;
        }
    }
    async mkdir(path) {
        await fs.promises.mkdir(path, { recursive: true });
    }
    async unlink(path) {
        await fs.promises.unlink(path);
    }
    async writeFile(path, data) {
        await fs.promises.writeFile(path, data);
    }
    async open(path, flags) {
        const handle = await fs.promises.open(path, flags);
        return new NodeFileHandle(handle);
    }
    async readdir(path) {
        const entries = await fs.promises.readdir(path, { withFileTypes: true });
        return entries.map(entry => ({
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file'
        }));
    }
}

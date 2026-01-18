package com.dan.generic_nzb_downloader.nntp;

import java.io.IOException;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

public class NntpConnectionPool {
    private final BlockingQueue<NntpConnection> pool;
    private final int size;
    private final String host;
    private final int port;
    private final boolean ssl;
    private final String user;
    private final String pass;

    public NntpConnectionPool(int size, String host, int port, boolean ssl, String user, String pass) {
        this.size = size;
        this.host = host;
        this.port = port;
        this.ssl = ssl;
        this.user = user;
        this.pass = pass;
        this.pool = new LinkedBlockingQueue<>(size);
    }

    /**
     * Initializes the pool by creating and connecting the specified number of connections.
     * @throws IOException If any connection fails to connect.
     */
    public void initialize() throws IOException {
        for (int i = 0; i < size; i++) {
            pool.add(createAndConnect());
        }
    }

    private NntpConnection createAndConnect() throws IOException {
        NntpConnection conn = new NntpConnection();
        conn.connect(host, port, ssl, user, pass);
        return conn;
    }

    /**
     * Borrows a connection from the pool. Blocks until one is available.
     * @return An NntpConnection.
     * @throws InterruptedException If the thread is interrupted while waiting.
     */
    public NntpConnection borrowConnection() throws InterruptedException {
        return pool.take();
    }

    /**
     * Invalidates a connection that is known to be broken.
     * Closes the connection and attempts to create a replacement.
     * @param conn The broken connection.
     */
    public void invalidateConnection(NntpConnection conn) {
        if (conn == null) return;
        
        conn.close();
        // Start a thread to replace the dead connection
        new Thread(() -> {
            while (true) {
                try {
                    pool.offer(createAndConnect());
                    break;
                } catch (IOException e) {
                    // Wait a bit before retrying to reconnect
                    try {
                        Thread.sleep(5000);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
            }
        }).start();
    }

    /**
     * Returns a connection to the pool. If the connection is no longer connected,
     * it attempts to replace it with a new one in a background thread.
     * @param conn The connection to return.
     */
    public void returnConnection(NntpConnection conn) {
        if (conn == null) return;

        if (conn.isConnected()) {
            pool.offer(conn);
        } else {
            invalidateConnection(conn);
        }
    }

    /**
     * Shuts down the pool, closing all connections.
     */
    public void shutdown() {
        NntpConnection conn;
        while ((conn = pool.poll()) != null) {
            conn.disconnect();
        }
    }
}

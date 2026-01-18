package com.dan.generic_nzb_downloader.nntp;

import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import java.io.*;
import java.net.Socket;

public class NntpConnection {
    private Socket socket;
    private InputStream in;
    private OutputStream out;

    public void connect(String host, int port, boolean ssl, String user, String pass) throws IOException {
        if (ssl) {
            SSLSocketFactory factory = (SSLSocketFactory) SSLSocketFactory.getDefault();
            SSLSocket sslSocket = (SSLSocket) factory.createSocket(host, port);
            sslSocket.startHandshake();
            socket = sslSocket;
        } else {
            socket = new Socket(host, port);
        }

        in = new BufferedInputStream(socket.getInputStream(), 65536);
        out = new BufferedOutputStream(socket.getOutputStream(), 65536);

        String response = readLine();
        if (response == null || (!response.startsWith("200") && !response.startsWith("201"))) {
            throw new IOException("Connection failed: " + response);
        }

        if (user != null && !user.isEmpty()) {
            sendCommand("AUTHINFO USER " + user);
            response = readLine();
            if (response != null && response.startsWith("381")) {
                sendCommand("AUTHINFO PASS " + (pass != null ? pass : ""));
                response = readLine();
            }
            if (response == null || !response.startsWith("281")) {
                throw new IOException("Authentication failed: " + response);
            }
        }
    }

    public YEncDecoder.DecodeResult downloadSegment(String messageId, OutputStream outStream) throws IOException {
        if (!messageId.startsWith("<")) {
            messageId = "<" + messageId + ">";
        }
        sendCommand("BODY " + messageId);
        String response = readLine();
        if (response == null) {
            throw new IOException("No response from server");
        }
        if (response.startsWith("430")) {
            throw new IOException("No such article: " + messageId);
        }
        if (!response.startsWith("222") && !response.startsWith("220")) {
            throw new IOException("BODY command failed: " + response);
        }

        return YEncDecoder.decode(in, outStream);
    }

    private void sendCommand(String cmd) throws IOException {
        out.write((cmd + "\r\n").getBytes("UTF-8"));
        out.flush();
    }

    private String readLine() throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        int b;
        while ((b = in.read()) != -1) {
            if (b == '\r') {
                int next = in.read();
                if (next == '\n') break;
                baos.write(b);
                if (next != -1) baos.write(next);
            } else if (b == '\n') {
                break;
            } else {
                baos.write(b);
            }
        }
        if (baos.size() == 0 && b == -1) return null;
        return baos.toString("UTF-8");
    }

    public void disconnect() {
        try {
            if (isConnected()) {
                sendCommand("QUIT");
            }
        } catch (IOException ignored) {
        } finally {
            close();
        }
    }

    public void close() {
        try {
            if (socket != null) {
                socket.close();
            }
        } catch (IOException ignored) {
        }
    }

    public boolean isConnected() {
        return socket != null && socket.isConnected() && !socket.isClosed();
    }
}

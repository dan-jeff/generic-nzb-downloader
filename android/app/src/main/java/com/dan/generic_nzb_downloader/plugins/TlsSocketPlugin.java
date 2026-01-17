package com.dan.generic_nzb_downloader.plugins;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.JSObject;
import android.util.Base64;
import java.io.InputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

@CapacitorPlugin(name = "TlsSocketPlugin")
public class TlsSocketPlugin extends Plugin {
    private SSLSocket socket = null;
    private ExecutorService executor = Executors.newSingleThreadExecutor();

    @Override
    public void load() {
        super.load();
        android.util.Log.i("TlsSocketPlugin", "Native TlsSocketPlugin loaded and initialized");
    }

    @PluginMethod
    public void connect(PluginCall call) {
        final String host = call.getString("host");
        final Integer port = call.getInt("port");
        final Boolean useSSL = call.getBoolean("useSSL", true);

        android.util.Log.i("TlsSocketPlugin", "connect() called: " + host + ":" + port + ", SSL: " + useSSL);

        executor.execute(() -> {
            try {
                JSObject ret = new JSObject();
                
                if (useSSL) {
                    android.util.Log.i("TlsSocketPlugin", "Creating SSL context");
                    SSLContext sslContext = SSLContext.getInstance("TLS");
                    sslContext.init(null, null, null);
                    SSLSocketFactory factory = sslContext.getSocketFactory();
                    
                    android.util.Log.i("TlsSocketPlugin", "Creating and connecting SSL socket to " + host + ":" + port);
                    socket = (SSLSocket) factory.createSocket();
                    socket.connect(new InetSocketAddress(host, port), 30000); // 30 second timeout
                    
                    android.util.Log.i("TlsSocketPlugin", "Starting SSL handshake");
                    socket.startHandshake();
                    android.util.Log.i("TlsSocketPlugin", "SSL handshake completed");
                } else {
                    throw new IOException("Non-SSL connections not supported yet. Use SSL-enabled connection.");
                }
                
                ret.put("success", true);
                call.resolve(ret);

                android.util.Log.i("TlsSocketPlugin", "Starting read thread");
                new Thread(() -> {
                    try {
                        InputStream inputStream = socket.getInputStream();
                        byte[] buffer = new byte[4096];
                        int bytesRead;
                        while ((bytesRead = inputStream.read(buffer)) != -1) {
                            android.util.Log.d("TlsSocketPlugin", "Read " + bytesRead + " bytes");
                            String encodedData = Base64.encodeToString(buffer, 0, bytesRead, Base64.NO_WRAP);
                            JSObject dataRet = new JSObject();
                            dataRet.put("data", encodedData);
                            notifyListeners("data", dataRet);
                        }
                        android.util.Log.i("TlsSocketPlugin", "Stream closed, notifying listeners");
                        notifyListeners("close", new JSObject());
                    } catch (IOException e) {
                        android.util.Log.e("TlsSocketPlugin", "Error reading from socket: " + e.getMessage());
                        JSObject errorRet = new JSObject();
                        errorRet.put("error", e.getMessage());
                        notifyListeners("error", errorRet);
                        notifyListeners("close", new JSObject());
                    }
                }).start();
            } catch (Exception e) {
                android.util.Log.e("TlsSocketPlugin", "Connection error: " + e.getMessage(), e);
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", e.getMessage());
                call.resolve(ret);
            }
        });
    }

    @PluginMethod
    public void write(PluginCall call) {
        final String data = call.getString("data");
        
        executor.execute(() -> {
            try {
                if (socket != null && socket.isConnected()) {
                    OutputStream out = socket.getOutputStream();
                    out.write(data.getBytes());
                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    call.resolve(ret);
                } else {
                    JSObject ret = new JSObject();
                    ret.put("success", false);
                    ret.put("error", "Socket not connected");
                    call.resolve(ret);
                }
            } catch (Exception e) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", e.getMessage());
                call.resolve(ret);
            }
        });
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        executor.execute(() -> {
            try {
                if (socket != null) {
                    socket.close();
                }
                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            } catch (Exception e) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", e.getMessage());
                call.resolve(ret);
            }
        });
    }

    public void cleanup() {
        if (socket != null) {
            try {
                socket.close();
            } catch (Exception e) {
                // Ignore
            }
        }
        executor.shutdown();
    }
}

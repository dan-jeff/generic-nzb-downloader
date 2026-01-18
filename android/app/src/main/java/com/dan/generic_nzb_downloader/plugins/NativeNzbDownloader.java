package com.dan.generic_nzb_downloader.plugins;

import com.dan.generic_nzb_downloader.nntp.DownloadJob;
import com.dan.generic_nzb_downloader.nntp.NntpConnection;
import com.dan.generic_nzb_downloader.nntp.NntpConnectionPool;
import com.dan.generic_nzb_downloader.nntp.Segment;
import com.dan.generic_nzb_downloader.nntp.YEncDecoder;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import android.os.Environment;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Future;
import java.util.Map;

@CapacitorPlugin(name = "NativeNzbDownloader")
public class NativeNzbDownloader extends Plugin {
    private ExecutorService executorService;
    private Map<String, Thread> activeThreads = new ConcurrentHashMap<>();
    private Map<String, NntpConnectionPool> activePools = new ConcurrentHashMap<>();

    private Map<String, Long> lastProgressTime = new ConcurrentHashMap<>();
    
    @Override
    public void load() {
        executorService = Executors.newFixedThreadPool(Runtime.getRuntime().availableProcessors() * 2);
    }

    @PluginMethod
    public void cancelJob(PluginCall call) {
        String jobId = call.getString("jobId");
        if (jobId == null) {
            call.reject("Missing jobId");
            return;
        }

        android.util.Log.d("NativeNzbDownloader", "Cancelling job: " + jobId);

        Thread thread = activeThreads.remove(jobId);
        if (thread != null) {
            thread.interrupt();
        }

        NntpConnectionPool pool = activePools.remove(jobId);
        if (pool != null) {
            pool.shutdown();
        }

        call.resolve();
    }

    @PluginMethod
    public void addJob(PluginCall call) {
        try {
            String id = call.getString("id");
            String filename = call.getString("filename");
            String downloadPath = call.getString("downloadPath");
            JSArray segmentsArray = call.getArray("segments");
            JSObject serverObj = call.getObject("server");

            if (id == null || filename == null || downloadPath == null || segmentsArray == null || serverObj == null) {
                call.reject("Missing required parameters");
                return;
            }

            DownloadJob.ServerInfo serverInfo = new DownloadJob.ServerInfo();
            serverInfo.host = serverObj.getString("host");
            Integer port = serverObj.getInteger("port");
            
            if (serverInfo.host == null || port == null) {
                call.reject("Missing required server configuration (host or port)");
                return;
            }
            serverInfo.port = port;
            
            serverInfo.ssl = serverObj.getBoolean("ssl", true);
            // Handle optional fields safely
            serverInfo.user = serverObj.has("user") ? serverObj.getString("user") : null;
            serverInfo.pass = serverObj.has("pass") ? serverObj.getString("pass") : null;
            serverInfo.connections = serverObj.has("connections") ? serverObj.getInteger("connections") : 1;

            // Removed invalid duplicate check that caused compilation error
            
            boolean hasOffsets = true;
            List<Segment> segments = new ArrayList<>();
            for (int i = 0; i < segmentsArray.length(); i++) {
                JSObject segObj = JSObject.fromJSONObject(segmentsArray.getJSONObject(i));
                if (!segObj.has("begin")) {
                    hasOffsets = false;
                }
                
                String messageId = segObj.getString("messageId");
                Integer number = segObj.getInteger("number", 0);
                // Use optLong for fields that might be missing
                Long bytes = segObj.has("bytes") ? segObj.getLong("bytes") : 0L;
                Long begin = segObj.has("begin") ? segObj.getLong("begin") : -1L;
                
                segments.add(new Segment(
                        messageId,
                        number != null ? number : 0,
                        bytes,
                        begin
                ));
            }

            DownloadJob job = new DownloadJob(id, filename, downloadPath, segments, serverInfo);
            if (hasOffsets) {
                startParallelDownload(job);
            } else {
                startSequentialDownload(job);
            }

            call.resolve();
        } catch (Exception e) {
            e.printStackTrace();
            android.util.Log.e("NativeNzbDownloader", "Failed to add job", e);
            call.reject("Failed to add job: " + (e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
        }
    }

    // Custom stream to avoid memory copy
    private static class DirectByteArrayOutputStream extends ByteArrayOutputStream {
        public DirectByteArrayOutputStream(int size) {
            super(size);
        }
        
        public byte[] getBuffer() {
            return buf;
        }
        
        public int getCount() {
            return count;
        }
    }

    private File resolveDownloadDir(DownloadJob job) {
        File dir;
        if (job.downloadPath.startsWith("/")) {
            dir = new File(job.downloadPath);
        } else {
            File publicDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            dir = new File(publicDir, job.downloadPath);
            
            if (!dir.exists()) {
                if (!dir.mkdirs()) {
                    android.util.Log.w("NativeNzbDownloader", "Failed to create public dir: " + dir.getAbsolutePath() + ". Falling back to app-private storage.");
                    
                    File baseDir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (baseDir == null) {
                         baseDir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS);
                    }
                    if (baseDir == null) {
                        baseDir = new File(getContext().getFilesDir(), "Documents");
                    }
                    dir = new File(baseDir, job.downloadPath);
                }
            }
        }

        if (!dir.exists()) {
            dir.mkdirs();
        }

        return dir;
    }

    private void startParallelDownload(DownloadJob job) {
        Thread thread = new Thread(() -> {
            NntpConnectionPool pool = new NntpConnectionPool(
                    job.server.connections,
                    job.server.host,
                    job.server.port,
                    job.server.ssl,
                    job.server.user,
                    job.server.pass
            );
            activePools.put(job.id, pool);

            try {
                pool.initialize();
                
                File dir = resolveDownloadDir(job);
                File outFile = new File(dir, job.filename);
                android.util.Log.i("NativeNzbDownloader", "Job " + job.id + ": Starting download to " + outFile.getAbsolutePath());

                File segmentsDir = new File(dir, ".segments");
                if (!segmentsDir.exists()) {
                    segmentsDir.mkdirs();
                }
                
                AtomicInteger completedSegments = new AtomicInteger(0);
                AtomicInteger finishedSegments = new AtomicInteger(0);
                AtomicLong totalBytesDecoded = new AtomicLong(0);
                int totalSegments = job.segments.size();

                for (Segment segment : job.segments) {
                    executorService.submit(() -> {
                        try {
                            int retries = 3;
                            while (retries > 0) {
                                try {
                                    NntpConnection conn = pool.borrowConnection();
                                    boolean success = false;
                                    File segmentFile = new File(segmentsDir, job.filename + "." + segment.number + ".tmp");
                                    try (FileOutputStream segmentOut = new FileOutputStream(segmentFile)) {
                                        YEncDecoder.DecodeResult result = conn.downloadSegment(segment.messageId, segmentOut);
                                        int bytesDecoded = result.decodedBytes;
                                        totalBytesDecoded.addAndGet(bytesDecoded);
                                        
                                        int completed = completedSegments.incrementAndGet();
                                        
                                        long now = System.currentTimeMillis();
                                        Long lastTime = lastProgressTime.get(job.id);
                                        if (lastTime == null || (now - lastTime) > 100 || completed == totalSegments) {
                                            lastProgressTime.put(job.id, now);
                                            notifyProgress(job.id, completed, totalSegments, totalBytesDecoded.get());
                                        }
                                        
                                        success = true;
                                        break; // Success
                                    } finally {
                                        if (success) {
                                            pool.returnConnection(conn);
                                        } else {
                                            android.util.Log.w("NativeNzbDownloader", "Invalidating connection due to error");
                                            pool.invalidateConnection(conn);
                                        }
                                    }
                                } catch (Exception e) {
                                    retries--;
                                    if (retries == 0) {
                                        e.printStackTrace();
                                        notifyError(job.id, "Failed segment " + segment.number + ": " + e.getMessage());
                                    } else {
                                        try { Thread.sleep(1000); } catch (InterruptedException ignored) {}
                                    }
                                }
                            }
                        } finally {
                            if (finishedSegments.incrementAndGet() == totalSegments) {
                                try {
                                    assembleSegments(outFile, segmentsDir, job.segments);
                                } catch (IOException e) {
                                    e.printStackTrace();
                                    notifyError(job.id, "Failed to assemble file: " + e.getMessage());
                                }
                                pool.shutdown();
                            }
                        }
                    });
                }
            } catch (Exception e) {
                if (e instanceof InterruptedException) {
                    android.util.Log.d("NativeNzbDownloader", "Job " + job.id + " interrupted (cancelled)");
                } else {
                    e.printStackTrace();
                    notifyError(job.id, e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
                }
            } finally {
                activePools.remove(job.id);
                activeThreads.remove(job.id);
                lastProgressTime.remove(job.id);
            }
        });
        activeThreads.put(job.id, thread);
        thread.start();
    }

    private void assembleSegments(File outFile, File segmentsDir, List<Segment> segments) throws IOException {
        List<Segment> orderedSegments = new ArrayList<>(segments);
        orderedSegments.sort((a, b) -> Integer.compare(a.number, b.number));

        try (FileOutputStream fileOut = new FileOutputStream(outFile)) {
            byte[] buffer = new byte[65536];
            for (Segment segment : orderedSegments) {
                File segmentFile = new File(segmentsDir, outFile.getName() + "." + segment.number + ".tmp");
                try (java.io.FileInputStream segmentIn = new java.io.FileInputStream(segmentFile)) {
                    int read;
                    while ((read = segmentIn.read(buffer)) != -1) {
                        fileOut.write(buffer, 0, read);
                    }
                }
                segmentFile.delete();
            }
        }

        // Try to delete segments directory if empty
        File[] remaining = segmentsDir.listFiles();
        if (remaining != null && remaining.length == 0) {
            segmentsDir.delete();
        }
    }

    private void startSequentialDownload(DownloadJob job) {
        Thread thread = new Thread(() -> {
            NntpConnectionPool pool = new NntpConnectionPool(
                    1, // Use 1 connection for sequential
                    job.server.host,
                    job.server.port,
                    job.server.ssl,
                    job.server.user,
                    job.server.pass
            );
            activePools.put(job.id, pool);

            try {
                pool.initialize();
                
                File dir = resolveDownloadDir(job);
                File outFile = new File(dir, job.filename);
                android.util.Log.d("NativeNzbDownloader", "Sequential Download: Output file: " + outFile.getAbsolutePath());

                File segmentsDir = new File(dir, ".segments");
                if (!segmentsDir.exists()) {
                    segmentsDir.mkdirs();
                }

                int completed = 0;
                long totalBytesDecoded = 0;
                int totalSegments = job.segments.size();

                for (Segment segment : job.segments) {
                    int retries = 3;
                    while (retries > 0) {
                        try {
                            NntpConnection conn = pool.borrowConnection();
                            boolean success = false;
                            File segmentFile = new File(segmentsDir, job.filename + "." + segment.number + ".tmp");
                            try (FileOutputStream segmentOut = new FileOutputStream(segmentFile)) {
                                YEncDecoder.DecodeResult result = conn.downloadSegment(segment.messageId, segmentOut);
                                totalBytesDecoded += result.decodedBytes;
                                completed++;
                                
                                if (completed == 1) {
                                    android.util.Log.d("NativeNzbDownloader", "Sequential Download: First segment written. Bytes: " + totalBytesDecoded);
                                }
                                
                                long now = System.currentTimeMillis();
                                Long lastTime = lastProgressTime.get(job.id);
                                if (lastTime == null || (now - lastTime) > 100 || completed == totalSegments) {
                                    lastProgressTime.put(job.id, now);
                                    notifyProgress(job.id, completed, totalSegments, totalBytesDecoded);
                                }
                                
                                success = true;
                                break; // Success
                            } finally {
                                if (success) {
                                    pool.returnConnection(conn);
                                } else {
                                    pool.invalidateConnection(conn);
                                }
                            }
                        } catch (Exception e) {
                            retries--;
                            if (retries == 0) {
                                e.printStackTrace();
                                notifyError(job.id, "Failed segment " + segment.number + ": " + e.getMessage());
                                return; // Stop job on fatal error
                            } else {
                                try { Thread.sleep(1000); } catch (InterruptedException ignored) {}
                            }
                        }
                    }
                }

                assembleSegments(outFile, segmentsDir, job.segments);
            } catch (Exception e) {
                if (e instanceof InterruptedException) {
                    android.util.Log.d("NativeNzbDownloader", "Job " + job.id + " interrupted (cancelled)");
                } else {
                    e.printStackTrace();
                    notifyError(job.id, e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
                }
            } finally {
                pool.shutdown();
                activePools.remove(job.id);
                activeThreads.remove(job.id);
                lastProgressTime.remove(job.id);
            }
        });
        activeThreads.put(job.id, thread);
        thread.start();
    }

    private void notifyProgress(String jobId, int completed, int total, long bytes) {
        JSObject ret = new JSObject();
        ret.put("jobId", jobId);
        ret.put("completed", completed);
        ret.put("total", total);
        ret.put("bytes", bytes);
        ret.put("progress", (double) completed / total);
        notifyListeners("progress", ret);
    }

    private void notifyError(String jobId, String error) {
        JSObject ret = new JSObject();
        ret.put("jobId", jobId);
        ret.put("message", error != null ? error : "Unknown native error");
        notifyListeners("error", ret);
    }
}

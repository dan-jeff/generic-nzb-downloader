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

import android.content.ContentResolver;
import android.content.ContentUris;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
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
    public void cleanupPar2Files(PluginCall call) {
        String downloadPath = call.getString("downloadPath");
        if (downloadPath == null) {
            call.reject("Missing downloadPath");
            return;
        }

        try {
            File baseDir = resolvePath(downloadPath);
            android.util.Log.i("NativeNzbDownloader", "cleanupPar2Files baseDir: " + baseDir.getAbsolutePath());
            logFileInfo("cleanupPar2Files baseDir", baseDir);

            List<File> candidateDirs = new ArrayList<>();
            candidateDirs.add(baseDir);
            File legacyDir = new File(baseDir.getParentFile(), "Download/" + baseDir.getName());
            if (!legacyDir.getAbsolutePath().equals(baseDir.getAbsolutePath())) {
                candidateDirs.add(legacyDir);
            }

            boolean deletedAny = false;
            for (File dir : candidateDirs) {
                logFileInfo("cleanupPar2Files candidate", dir);
                if (!dir.exists()) {
                    continue;
                }

                File[] files = dir.listFiles();
                if (files != null) {
                    android.util.Log.i("NativeNzbDownloader", "cleanupPar2Files entries: " + files.length + " in " + dir.getAbsolutePath());
                    for (File file : files) {
                        if (file.isFile() && file.getName().toLowerCase().endsWith(".par2")) {
                            boolean deleted = file.delete();
                            if (!deleted && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                                String relativePath = file.getParentFile().getAbsolutePath().replace("/storage/emulated/0/", "");
                                if (!relativePath.endsWith("/")) {
                                    relativePath += "/";
                                }
                                deleted = deleteViaMediaStore(relativePath, file.getName()) > 0;
                            }
                            if (!deleted) {
                                android.util.Log.w("NativeNzbDownloader", "Failed to delete PAR2 file: " + file.getAbsolutePath());
                            } else {
                                deletedAny = true;
                                android.util.Log.i("NativeNzbDownloader", "Deleted PAR2 file: " + file.getAbsolutePath());
                            }
                        }
                    }
                } else {
                    android.util.Log.w("NativeNzbDownloader", "cleanupPar2Files listFiles returned null: " + dir.getAbsolutePath());
                }

                File filesDir = new File(dir, "Files");
                logFileInfo("cleanupPar2Files Files dir", filesDir);
                if (filesDir.exists() && filesDir.isDirectory()) {
                    File[] subFiles = filesDir.listFiles();
                    if (subFiles != null) {
                        android.util.Log.i("NativeNzbDownloader", "cleanupPar2Files Files entries: " + subFiles.length);
                        for (File file : subFiles) {
                            if (file.isFile() && file.getName().toLowerCase().endsWith(".par2")) {
                                boolean deleted = file.delete();
                                if (!deleted && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                                    String relativePath = file.getParentFile().getAbsolutePath().replace("/storage/emulated/0/", "");
                                    if (!relativePath.endsWith("/")) {
                                        relativePath += "/";
                                    }
                                    deleted = deleteViaMediaStore(relativePath, file.getName()) > 0;
                                }
                                if (!deleted) {
                                    android.util.Log.w("NativeNzbDownloader", "Failed to delete PAR2 file: " + file.getAbsolutePath());
                                } else {
                                    deletedAny = true;
                                    android.util.Log.i("NativeNzbDownloader", "Deleted PAR2 file: " + file.getAbsolutePath());
                                }
                            }
                        }
                    } else {
                        android.util.Log.w("NativeNzbDownloader", "cleanupPar2Files Files listFiles returned null: " + filesDir.getAbsolutePath());
                    }
                } else {
                    android.util.Log.i("NativeNzbDownloader", "cleanupPar2Files Files dir missing: " + filesDir.getAbsolutePath());
                }
            }

            if (!deletedAny && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                String relativePath = baseDir.getAbsolutePath().replace("/storage/emulated/0/", "");
                if (!relativePath.endsWith("/")) {
                    relativePath += "/";
                }
                int deleted = deleteViaMediaStorePattern(relativePath, "%.par2");
                if (deleted > 0) {
                    deletedAny = true;
                } else {
                    int fallbackDeleted = deleteViaMediaStorePattern("Download/" + relativePath, "%.par2");
                    if (fallbackDeleted > 0) {
                        deletedAny = true;
                    }
                }

                if (!deletedAny) {
                    int relaxedDeleted = deleteViaMediaStorePattern(relativePath, "%par2%");
                    if (relaxedDeleted > 0) {
                        deletedAny = true;
                    }
                }
            }

            if (!deletedAny) {
                android.util.Log.w("NativeNzbDownloader", "cleanupPar2Files did not delete any PAR2 files");
            }

            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to cleanup PAR2 files: " + (e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
        }
    }

    @PluginMethod
    public void deletePath(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("Missing path");
            return;
        }

        try {
            File target = resolvePath(path);
            android.util.Log.i("NativeNzbDownloader", "deletePath target: " + target.getAbsolutePath());
            logFileInfo("deletePath target", target);

            List<File> candidateTargets = new ArrayList<>();
            candidateTargets.add(target);
            File legacyTarget = new File(target.getParentFile(), "Download/" + target.getName());
            if (!legacyTarget.getAbsolutePath().equals(target.getAbsolutePath())) {
                candidateTargets.add(legacyTarget);
            }

            boolean deletedAny = false;
            for (File candidate : candidateTargets) {
                logFileInfo("deletePath candidate", candidate);
                if (!candidate.exists()) {
                    continue;
                }

                if (deleteWithMediaStoreFallback(candidate)) {
                    deletedAny = true;
                }
            }

            if (!deletedAny && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                String relativePath = target.getAbsolutePath().replace("/storage/emulated/0/", "");
                if (!relativePath.endsWith("/")) {
                    relativePath += "/";
                }
                int deleted = deleteViaMediaStoreRelativePathAll(relativePath);
                if (deleted > 0) {
                    deletedAny = true;
                } else {
                    int fallbackDeleted = deleteViaMediaStoreRelativePathAll("Download/" + relativePath);
                    if (fallbackDeleted > 0) {
                        deletedAny = true;
                    }
                }
            }

            if (deletedAny) {
                deleteEmptyDir(target);
                deleteEmptyDir(target.getParentFile());
            } else {
                android.util.Log.w("NativeNzbDownloader", "deletePath no candidates existed");
            }

            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to delete path: " + (e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
        }
    }

    private File resolvePath(String path) {
        android.util.Log.i("NativeNzbDownloader", "Resolving path: " + path);
        if (path.startsWith("/")) {
            File resolved = new File(path);
            android.util.Log.i("NativeNzbDownloader", "Resolved absolute path: " + resolved.getAbsolutePath());
            return resolved;
        }
        File publicDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        File resolved = new File(publicDir, path);
        android.util.Log.i("NativeNzbDownloader", "Resolved public path: " + resolved.getAbsolutePath());
        return resolved;
    }

    private void logFileInfo(String prefix, File file) {
        android.util.Log.i("NativeNzbDownloader", prefix + " path=" + file.getAbsolutePath()
                + " exists=" + file.exists()
                + " isDir=" + file.isDirectory()
                + " isFile=" + file.isFile()
                + " canRead=" + file.canRead()
                + " canWrite=" + file.canWrite()
                + " length=" + file.length());
    }

    private int deleteViaMediaStore(String relativePath, String displayName) {
        try {
            ContentResolver resolver = getContext().getContentResolver();
            Uri collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL);

            String selection = MediaStore.MediaColumns.RELATIVE_PATH + "=? AND " + MediaStore.MediaColumns.DISPLAY_NAME + "=?";
            String[] selectionArgs = new String[] { relativePath, displayName };

            try (Cursor cursor = resolver.query(collection, new String[] { MediaStore.MediaColumns._ID }, selection, selectionArgs, null)) {
                if (cursor == null) {
                    android.util.Log.w("NativeNzbDownloader", "MediaStore query returned null for " + relativePath + displayName);
                    return 0;
                }
                if (!cursor.moveToFirst()) {
                    android.util.Log.w("NativeNzbDownloader", "MediaStore entry not found for " + relativePath + displayName);
                    return 0;
                }

                long id = cursor.getLong(0);
                Uri contentUri = ContentUris.withAppendedId(collection, id);
                int deleted = resolver.delete(contentUri, null, null);
                if (deleted > 0) {
                    android.util.Log.i("NativeNzbDownloader", "Deleted via MediaStore: " + contentUri);
                } else {
                    android.util.Log.w("NativeNzbDownloader", "MediaStore delete returned 0 for " + contentUri);
                }
                return deleted;
            }
        } catch (Exception e) {
            android.util.Log.w("NativeNzbDownloader", "MediaStore delete failed for " + relativePath + displayName + ": " + e.getMessage());
            return 0;
        }
    }

    private int deleteViaMediaStorePattern(String relativePath, String namePattern) {
        int totalDeleted = 0;
        try {
            ContentResolver resolver = getContext().getContentResolver();
            Uri downloads = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL);

            String selection = MediaStore.MediaColumns.RELATIVE_PATH + "=? AND " + MediaStore.MediaColumns.DISPLAY_NAME + " LIKE ?";
            String[] selectionArgs = new String[] { relativePath, namePattern };

            try (Cursor cursor = resolver.query(downloads, new String[] { MediaStore.MediaColumns._ID }, selection, selectionArgs, null)) {
                if (cursor == null) {
                    android.util.Log.w("NativeNzbDownloader", "MediaStore pattern query returned null for " + relativePath + namePattern);
                } else {
                    while (cursor.moveToNext()) {
                        long id = cursor.getLong(0);
                        Uri contentUri = ContentUris.withAppendedId(downloads, id);
                        int deleted = resolver.delete(contentUri, null, null);
                        if (deleted > 0) {
                            totalDeleted += deleted;
                            android.util.Log.i("NativeNzbDownloader", "Deleted via MediaStore: " + contentUri);
                        } else {
                            android.util.Log.w("NativeNzbDownloader", "MediaStore delete returned 0 for " + contentUri);
                        }
                    }
                }
            }

            String absoluteBase = "/storage/emulated/0/" + relativePath;
            if (!absoluteBase.endsWith("/")) {
                absoluteBase += "/";
            }
            String dataPattern = absoluteBase + namePattern;

            Uri filesCollection = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL);
            String filesSelection = MediaStore.MediaColumns.DATA + " LIKE ?";
            String[] filesArgs = new String[] { dataPattern };

            try (Cursor cursor = resolver.query(filesCollection, new String[] { MediaStore.MediaColumns._ID }, filesSelection, filesArgs, null)) {
                if (cursor == null) {
                    android.util.Log.w("NativeNzbDownloader", "MediaStore files pattern query returned null for " + dataPattern);
                } else {
                    while (cursor.moveToNext()) {
                        long id = cursor.getLong(0);
                        Uri contentUri = ContentUris.withAppendedId(filesCollection, id);
                        int deleted = resolver.delete(contentUri, null, null);
                        if (deleted > 0) {
                            totalDeleted += deleted;
                            android.util.Log.i("NativeNzbDownloader", "Deleted via MediaStore (files): " + contentUri);
                        } else {
                            android.util.Log.w("NativeNzbDownloader", "MediaStore delete returned 0 for " + contentUri);
                        }
                    }
                }
            }
        } catch (Exception e) {
            android.util.Log.w("NativeNzbDownloader", "MediaStore pattern delete failed for " + relativePath + namePattern + ": " + e.getMessage());
        }
        return totalDeleted;
    }

    private int deleteViaMediaStoreRelativePathAll(String relativePath) {
        int totalDeleted = 0;
        try {
            ContentResolver resolver = getContext().getContentResolver();
            Uri downloads = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL);

            String selection = MediaStore.MediaColumns.RELATIVE_PATH + "=?";
            String[] selectionArgs = new String[] { relativePath };

            try (Cursor cursor = resolver.query(downloads, new String[] { MediaStore.MediaColumns._ID }, selection, selectionArgs, null)) {
                if (cursor == null) {
                    android.util.Log.w("NativeNzbDownloader", "MediaStore relative query returned null for " + relativePath);
                } else {
                    while (cursor.moveToNext()) {
                        long id = cursor.getLong(0);
                        Uri contentUri = ContentUris.withAppendedId(downloads, id);
                        int deleted = resolver.delete(contentUri, null, null);
                        if (deleted > 0) {
                            totalDeleted += deleted;
                            android.util.Log.i("NativeNzbDownloader", "Deleted via MediaStore: " + contentUri);
                        } else {
                            android.util.Log.w("NativeNzbDownloader", "MediaStore delete returned 0 for " + contentUri);
                        }
                    }
                }
            }

            String absoluteBase = "/storage/emulated/0/" + relativePath;
            if (!absoluteBase.endsWith("/")) {
                absoluteBase += "/";
            }
            Uri filesCollection = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL);
            String filesSelection = MediaStore.MediaColumns.DATA + " LIKE ?";
            String[] filesArgs = new String[] { absoluteBase + "%" };

            try (Cursor cursor = resolver.query(filesCollection, new String[] { MediaStore.MediaColumns._ID }, filesSelection, filesArgs, null)) {
                if (cursor == null) {
                    android.util.Log.w("NativeNzbDownloader", "MediaStore files relative query returned null for " + absoluteBase);
                } else {
                    while (cursor.moveToNext()) {
                        long id = cursor.getLong(0);
                        Uri contentUri = ContentUris.withAppendedId(filesCollection, id);
                        int deleted = resolver.delete(contentUri, null, null);
                        if (deleted > 0) {
                            totalDeleted += deleted;
                            android.util.Log.i("NativeNzbDownloader", "Deleted via MediaStore (files): " + contentUri);
                        } else {
                            android.util.Log.w("NativeNzbDownloader", "MediaStore delete returned 0 for " + contentUri);
                        }
                    }
                }
            }
        } catch (Exception e) {
            android.util.Log.w("NativeNzbDownloader", "MediaStore relative delete failed for " + relativePath + ": " + e.getMessage());
        }
        return totalDeleted;
    }

    private void deleteEmptyDir(File dir) {
        if (dir == null) {
            return;
        }
        if (dir.exists() && dir.isDirectory()) {
            File[] children = dir.listFiles();
            if (children != null && children.length == 0) {
                if (!dir.delete()) {
                    android.util.Log.w("NativeNzbDownloader", "Failed to delete empty dir: " + dir.getAbsolutePath());
                } else {
                    android.util.Log.i("NativeNzbDownloader", "Deleted empty dir: " + dir.getAbsolutePath());
                }
            }
        }
    }

    private boolean deleteWithMediaStoreFallback(File file) {
        logFileInfo("deleteRecursively", file);
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                android.util.Log.i("NativeNzbDownloader", "deleteRecursively children count: " + children.length);
                for (File child : children) {
                    deleteWithMediaStoreFallback(child);
                }
            } else {
                android.util.Log.w("NativeNzbDownloader", "deleteRecursively children list null for: " + file.getAbsolutePath());
            }
        }

        if (file.isFile() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            String relativePath = file.getParentFile().getAbsolutePath().replace("/storage/emulated/0/", "");
            if (!relativePath.endsWith("/")) {
                relativePath += "/";
            }
            if (deleteViaMediaStore(relativePath, file.getName()) > 0) {
                return true;
            }
        }

        if (!file.delete()) {
            android.util.Log.w("NativeNzbDownloader", "Failed to delete path: " + file.getAbsolutePath());
            return false;
        } else {
            android.util.Log.i("NativeNzbDownloader", "Deleted path: " + file.getAbsolutePath());
            return true;
        }
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

    @PluginMethod
    public void fetchNzbContent(PluginCall call) {
        String url = call.getString("url");
        if (url == null) {
            call.reject("Missing url");
            return;
        }

        try {
            android.net.Uri uri = android.net.Uri.parse(url);
            java.io.InputStream inputStream;

            if ("content".equalsIgnoreCase(uri.getScheme())) {
                inputStream = getContext().getContentResolver().openInputStream(uri);
            } else if ("file".equalsIgnoreCase(uri.getScheme())) {
                inputStream = new java.io.FileInputStream(new File(uri.getPath()));
            } else {
                call.reject("Unsupported URI scheme: " + uri.getScheme());
                return;
            }

            if (inputStream == null) {
                call.reject("Failed to open input stream for URI: " + url);
                return;
            }

            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            int nRead;
            byte[] data = new byte[16384];

            while ((nRead = inputStream.read(data, 0, data.length)) != -1) {
                buffer.write(data, 0, nRead);
            }

            buffer.flush();
            byte[] bytes = buffer.toByteArray();
            
            String base64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP);
            
            JSObject ret = new JSObject();
            ret.put("data", base64);
            call.resolve(ret);
            
            inputStream.close();
        } catch (Exception e) {
            e.printStackTrace();
            call.reject("Failed to read NZB content: " + e.getMessage());
        }
    }
}

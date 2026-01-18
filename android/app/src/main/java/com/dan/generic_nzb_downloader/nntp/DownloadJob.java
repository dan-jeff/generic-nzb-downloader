package com.dan.generic_nzb_downloader.nntp;

import java.util.List;

public class DownloadJob {
    public String id;
    public String filename;
    public String downloadPath;
    public List<Segment> segments;
    public ServerInfo server;

    public static class ServerInfo {
        public String host;
        public int port;
        public boolean ssl;
        public String user;
        public String pass;
        public int connections;
    }

    public DownloadJob(String id, String filename, String downloadPath, List<Segment> segments, ServerInfo server) {
        this.id = id;
        this.filename = filename;
        this.downloadPath = downloadPath;
        this.segments = segments;
        this.server = server;
    }
}

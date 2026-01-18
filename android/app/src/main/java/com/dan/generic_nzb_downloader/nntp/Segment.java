package com.dan.generic_nzb_downloader.nntp;

public class Segment {
    public String messageId;
    public int number;
    public long bytes;
    public long begin;

    public Segment(String messageId, int number, long bytes, long begin) {
        this.messageId = messageId;
        this.number = number;
        this.bytes = bytes;
        this.begin = begin;
    }
}

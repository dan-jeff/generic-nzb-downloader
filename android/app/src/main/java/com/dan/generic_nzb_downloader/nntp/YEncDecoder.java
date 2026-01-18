package com.dan.generic_nzb_downloader.nntp;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

public class YEncDecoder {
    public static class DecodeResult {
        public int decodedBytes;
        public long begin;
        public long end;
        
        public DecodeResult(int decodedBytes, long begin, long end) {
            this.decodedBytes = decodedBytes;
            this.begin = begin;
            this.end = end;
        }
    }

    /**
     * Decodes yEnc encoded data from an InputStream and writes it to an OutputStream.
     * Handles NNTP dot-unstuffing and the \r\n.\r\n terminator.
     * Also skips =ybegin and =yend header/footer lines.
     * Extracts offset from =ypart header.
     *
     * @param in  The InputStream to read from (NNTP stream)
     * @param out The OutputStream to write decoded bytes to
     * @return DecodeResult containing bytes written and offsets
     * @throws IOException If an I/O error occurs
     */
    public static DecodeResult decode(InputStream in, OutputStream out) throws IOException {
        int totalWritten = 0;
        long partBegin = -1;
        long partEnd = -1;
        boolean escaped = false;
        boolean bol = true;
        byte[] outBuffer = new byte[65536];
        int outIdx = 0;
        int pending = -1;

        int b;
        while (true) {
            if (pending != -1) {
                b = pending;
                pending = -1;
            } else {
                b = in.read();
            }

            if (b == -1) {
                break;
            }

            if (bol) {
                if (b == '.') {
                    int next = in.read();
                    if (next == -1) {
                        break;
                    }
                    if (next == '\r') {
                        // Potential terminator. Check for \n.
                        int next2 = in.read();
                        if (next2 == '\n') {
                            break; // End of NNTP body
                        }
                        // Not a terminator; treat as dot-stuffed data
                        pending = next2;
                        b = '.';
                    } else if (next == '.') {
                        // Dot-unstuffing
                        b = '.';
                    } else {
                        // Dot-stuffed single leading dot
                        pending = next;
                        b = '.';
                    }
                } else if (b == '=') {
                    // Check for =ybegin or =yend
                    int next = in.read();
                    if (next == 'y') {
                        // Read the rest of the line to parse headers
                        StringBuilder line = new StringBuilder("=y");
                        while (next != -1 && next != '\n') {
                            next = in.read();
                            if (next != -1 && next != '\r' && next != '\n') {
                                line.append((char)next);
                            }
                        }
                        String headerLine = line.toString();
                        
                        if (headerLine.startsWith("=ypart")) {
                            // Parse begin offset
                            // Example: =ypart begin=12345 end=23456
                            String[] parts = headerLine.split(" ");
                            for (String part : parts) {
                                if (part.startsWith("begin=")) {
                                    try {
                                        partBegin = Long.parseLong(part.substring(6));
                                    } catch (NumberFormatException ignored) {}
                                }
                                if (part.startsWith("end=")) {
                                    try {
                                        partEnd = Long.parseLong(part.substring(4));
                                    } catch (NumberFormatException ignored) {}
                                }
                            }
                        }
                        
                        bol = true;
                        continue;
                    } else {
                        // Not a header line, treat '=' as data and keep next byte for decoding
                        pending = next;
                        b = '=';
                    }
                }
            }

            if (b == '\r' || b == '\n') {
                bol = true;
                continue;
            }
            bol = false;

            if (b == '=') {
                if (!escaped) {
                    escaped = true;
                    continue;
                }
            }

            int decoded;
            if (escaped) {
                decoded = (b - 64 - 42) & 0xFF;
                escaped = false;
            } else {
                decoded = (b - 42) & 0xFF;
            }

            outBuffer[outIdx++] = (byte) decoded;
            if (outIdx == outBuffer.length) {
                out.write(outBuffer);
                totalWritten += outIdx;
                outIdx = 0;
            }
        }

        if (outIdx > 0) {
            out.write(outBuffer, 0, outIdx);
            totalWritten += outIdx;
        }

        return new DecodeResult(totalWritten, partBegin, partEnd);
    }
}

# Performance Optimization - Segment Concurrency

## Summary of Changes

This optimization addresses a significant download speed regression where throughput dropped from approximately 56 Mbps to 10 Mbps after segment-based downloading was introduced. The root cause was improper handling of parallel segment downloads.

**Key Changes:**
- Introduced separate `segmentConcurrency` setting to control parallel segment downloads independently of NNTP connections
- Removed hard cap of 4 on `maxConnections` that was artificially limiting throughput
- Added `getSegmentConcurrency()` helper method with sanity limit at 100
- Updated `downloadSegments()` to use `segmentConcurrency` for parallel downloads
- Added UI field for "Segment Concurrency" in SettingsPanel
- Changed defaults: `maxConnections=10`, `segmentConcurrency=10`

## Technical Details

### maxConnections vs segmentConcurrency

These two settings serve different purposes:

**maxConnections**
- Controls the number of concurrent NNTP connections to your Usenet provider
- Limited by your provider's connection limit (typically 10-50)
- Directly correlates with resource usage on both client and server
- Should be set based on your provider's allowance

**segmentConcurrency**
- Controls the number of segments downloaded in parallel per connection
- Implements pipelining to keep connections busy
- Can be significantly higher than maxConnections
- Capped at 100 to prevent resource exhaustion

### What Controls Download Speed

Download speed is determined by:
1. **Bandwidth utilization** - More segments in parallel = better pipeline efficiency
2. **Connection overhead** - Each segment requires a request/response cycle
3. **Provider bandwidth cap** - Your plan's maximum throughput
4. **Network latency** - Pipelining mitigates this by keeping connections busy

With segment-based downloading, we can pipeline multiple segment requests over a single connection. This keeps the connection saturated instead of waiting idle between requests.

### The Removed Cap of 4

The previous implementation hard-coded a maximum of 4 connections in `getMaxConnections()`. This was overly conservative and prevented users from fully utilizing their provider's connection allowance, regardless of their plan's actual limit.

This cap has been removed. Users can now set `maxConnections` up to their provider's actual limit (typically 10, 20, 30, or 50 connections).

## Configuration Guide

### Setting maxConnections

Check your Usenet provider's documentation or control panel for your connection limit:

**Common Provider Limits:**
- Basic plans: 5-10 connections
- Standard plans: 10-20 connections  
- Premium plans: 20-50 connections

**Best Practice:**
- Set `maxConnections` to match or slightly below your provider's limit
- Going too high may cause provider to throttle or block connections
- Going too low wastes available bandwidth

### Setting segmentConcurrency

This setting can be higher than `maxConnections` to enable effective pipelining:

**Recommended Approach:**
- Start with `segmentConcurrency = maxConnections * 2`
- For users with high-speed connections (>50 Mbps), try `segmentConcurrency = maxConnections * 3`
- Maximum of 100 (enforced by application)

**Why Higher Values Work:**
- Segments are small (typically 500KB-2MB)
- Multiple segments can be requested per connection before first completes
- Reduces idle time between segment downloads
- Better utilization of connection bandwidth

### Recommended Starting Values

| Connection Speed | Provider Limit | Recommended maxConnections | Recommended segmentConcurrency |
|-----------------|----------------|--------------------------|-------------------------------|
| < 25 Mbps | 10 | 8-10 | 15-20 |
| 25-50 Mbps | 10-20 | 10-15 | 20-30 |
| 50-100 Mbps | 20-30 | 15-20 | 30-40 |
| > 100 Mbps | 30-50 | 20-30 | 40-50 |

## Testing Procedure

### Before Test - Baseline Performance

1. Open SettingsPanel
2. Set **maxConnections = 2**
3. Set **segmentConcurrency = 2**
4. Start a test download (preferably a large NZB with multiple segments)
5. Monitor download speed in the UI for 2-3 minutes
6. Record average speed (should be approximately 10 Mbps based on regression)

### After Test - Optimized Performance

1. Open SettingsPanel
2. Set **maxConnections = 10** (or your provider's limit)
3. Set **segmentConcurrency = 10** (or recommended value from table above)
4. Start the same test download
5. Monitor download speed in the UI for 2-3 minutes
6. Record average speed

### How to Monitor Speed

The UI displays real-time download metrics:
- **Current Speed** - Instantaneous download rate
- **Average Speed** - Rolling average over last 30 seconds
- **Downloaded** - Total bytes downloaded
- **Time Remaining** - Estimated completion time

Look for the speed indicator in the main download view or status bar.

### Expected Results

With proper configuration:
- **Before (baseline):** ~10 Mbps
- **After (optimized):** ~50-56 Mbps (returning to pre-regression levels)
- **Improvement:** 5-6x increase in download speed

If you don't achieve expected speeds, see troubleshooting section below.

## Troubleshooting

### Check Provider Connection Limits

If speeds don't improve after increasing settings:

1. **Verify your plan's connection limit**
   - Check provider's website or account dashboard
   - Contact support if unsure

2. **Look for error messages**
   - "Too many connections" indicates exceeding provider limit
   - Reduce `maxConnections` and try again

3. **Test with conservative values first**
   - Start with `maxConnections = provider limit - 2`
   - Gradually increase while monitoring speed

### Network Bottlenecks

If speeds plateau below expected levels:

1. **Check local network**
   - Ensure wired connection if possible (WiFi can be unreliable)
   - Verify no other devices consuming bandwidth
   - Test with speedtest.net to confirm ISP bandwidth

2. **Monitor CPU usage**
   - High CPU usage (>80%) may indicate decoding bottleneck
   - Reduce `segmentConcurrency` if CPU is saturated

3. **Check disk I/O**
   - Ensure sufficient disk space
   - Fast SSD/NVMe recommended for high-speed downloads
   - Avoid downloading to external USB drives

### Resource Exhaustion Signs

If system becomes unresponsive:

**Symptoms:**
- UI becomes sluggish
- High memory usage
- Connection failures
- "Out of memory" errors

**Solutions:**
1. Reduce `segmentConcurrency` (try half current value)
2. Reduce `maxConnections` if using very high values
3. Check for memory leaks in application logs
4. Close other applications consuming resources

### Additional Diagnostic Steps

1. **Enable debug logging** (if available)
   - Look for warnings about connection pool exhaustion
   - Check for timeouts or retry attempts

2. **Test different NZB files**
   - Some files may have suboptimal segment sizes
   - Very large files (50GB+) may have different performance characteristics

3. **Compare to alternative clients**
   - Test with other Usenet clients using same provider
   - If others achieve full speed, issue may be client-specific

4. **Contact provider support**
   - Some providers throttle specific types of traffic
   - Verify no account-specific limitations

## Developer Notes

### Implementation Files

- `src/types/NewsreaderSettings.ts` - Interface definitions
- `electron/types/NewsreaderSettings.ts` - Electron-specific types
- `src/services/Newsreader.ts` - `getMaxConnections()`, `getSegmentConcurrency()`, `downloadSegments()`
- `src/components/SettingsPanel.tsx` - UI configuration fields

### Key Methods

**getMaxConnections()**
- Returns `maxConnections` setting value
- No longer caps at 4
- Validates against provider limits (if known)

**getSegmentConcurrency()**
- Returns `segmentConcurrency` setting value
- Capped at 100 to prevent resource exhaustion
- Allows pipelining of multiple segments per connection

**downloadSegments()**
- Now uses `segmentConcurrency` for parallel downloads
- Distributes segments across available connections
- Implements proper connection pooling

### Future Enhancements

Potential areas for further optimization:
- Automatic tuning based on measured throughput
- Dynamic adjustment during download
- Connection-specific segment queuing
- Better error handling for provider throttling
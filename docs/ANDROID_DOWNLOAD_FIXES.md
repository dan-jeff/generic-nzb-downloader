# Android Download Fixes

Fixed NZB downloads and newsreader submissions failing on Android due to network/CORS issues

## Problem Description

Users couldn't download NZB files or send to newsreader from search results on Android. The original error message was:

```
Failed to start download: Network Error - AxiosError: ERR_NETWORK
```

Root cause: `axios.get()` fetching from webview on Android failed due to CORS/network restrictions.

## Changes Made

### NZB Fetching with CapacitorHttp

- **Modified:** `src/core/download/DownloadManager.ts`
- **Changed:** Use `CapacitorHttp.get()` for Android platform instead of `axios.get()`
- **Benefit:** Native HTTP avoids webview CORS/network limitations

### Local NZB Persistence on Android

- **Modified:** `src/core/download/DownloadManager.ts`
- **Added:** Actual file download and save to device storage
- **Default path:** `Downloads/` within app Documents directory
- **Benefit:** "Download NZB" now saves files to device

### Direct Usenet Path Validation

- **Modified:** `src/core/nntp/NewsreaderClient.ts` and `src/core/download/DownloadManager.ts`
- **Added:** Early validation for missing download path
- **Error message:** "Download path not configured. Please configure a download path in Settings > Newsreaders > [name] before downloading with Direct Usenet."
- **Benefit:** Users get actionable error when download path not set

### UI Error Feedback

- **Modified:** `src/components/SearchPanel.tsx`
- **Added:** Snackbar for download success/error notifications
- **Success message:** "Started download: [filename]" (green)
- **Error message:** "Download failed: [error]" (red)
- **Benefit:** Users see immediate feedback instead of silent failure

## Validation Steps

### Test Search Results Display

- Build/run Android app
- Navigate to Search panel
- Search for content (e.g., "test")
- Verify results display correctly

### Test "Download NZB" Button

- Tap "Download NZB" on a search result
- Verify: Green snackbar appears "Started download: [filename]"
- Verify: File is saved to app's Downloads directory
- Verify: History shows download as "completed"

### Test "Send to Newsreader" Button

- Ensure a newsreader is configured in Settings
- Tap "Send to Newsreader" on a search result
- Verify: Green snackbar appears "Started download: [filename]"
- Verify: Download appears in newsreader queue

### Test Error Handling - Missing Download Path

- Configure Direct Usenet newsreader WITHOUT setting download path
- Tap "Send to Newsreader" on a search result
- Verify: Red snackbar appears "Download failed: Download path not configured..."
- Verify: Error message guides user to Settings

### Test Error Handling - Network Failure

- Temporarily disable network connection
- Tap "Download NZB" or "Send to Newsreader"
- Verify: Red snackbar appears with network error message
- Verify: Console logs error details

### Cross-Platform Verification

- Run desktop/Electron version
- Tap download buttons
- Verify: Desktop behavior unchanged (uses Electron APIs)

## Platform-Specific Behavior

- **Android:** Uses CapacitorHttp, downloads to device storage
- **Desktop/Electron:** Uses existing Electron APIs, unchanged
- **Web/Other:** Uses axios for NZB fetching (unchanged)

## Related Files

- `src/core/download/DownloadManager.ts` - NZB fetching and local download implementation
- `src/core/nntp/NewsreaderClient.ts` - Direct Usenet validation
- `src/components/SearchPanel.tsx` - UI feedback notifications

## Notes

- Requires `@capacitor/core` and `@capacitor/filesystem` plugins
- Default download path is app's Documents/Downloads/ folder
- Downloads are tracked in history with completed status
- Errors are both logged to console and shown to users

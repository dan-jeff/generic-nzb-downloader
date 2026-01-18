package com.dan.generic_nzb_downloader;

import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import com.dan.generic_nzb_downloader.plugins.TlsSocketPlugin;
import com.dan.generic_nzb_downloader.plugins.NativeNzbDownloader;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "GenericDownloader";
    
    @Override
    public void onCreate(Bundle savedInstanceState) {
        Log.i(TAG, "onCreate called - BEFORE super.onCreate()");
        
        // Register plugin BEFORE calling super.onCreate()
        // This ensures the plugin is registered before the bridge initializes
        registerPlugin(TlsSocketPlugin.class);
        registerPlugin(NativeNzbDownloader.class);
        Log.i(TAG, "TlsSocketPlugin registered BEFORE super.onCreate()");
        
        super.onCreate(savedInstanceState);
        Log.i(TAG, "onCreate complete");
    }
    
    @Override
    public void onResume() {
        super.onResume();
        Log.i(TAG, "onResume");
    }
}

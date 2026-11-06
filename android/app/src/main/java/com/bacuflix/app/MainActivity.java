package com.bacuflix.app;

import android.os.Bundle;

import com.bacuflix.app.media.MediaSessionPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ScreenModePlugin.class);
        registerPlugin(MediaSessionPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

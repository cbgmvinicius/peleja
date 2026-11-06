package io.github.cbgmvinicius.peleja;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PelejaTimerPlugin.class);
        super.onCreate(savedInstanceState);
        TimerService.channels(this);
        // Android 13+: the timer notification needs this permission; asked once, at the first open.
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            && !getPreferences(MODE_PRIVATE).getBoolean("askedNotify", false)) {
            getPreferences(MODE_PRIVATE).edit().putBoolean("askedNotify", true).apply();
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7);
        }
    }

    @Override public void onResume() {
        super.onResume();
        TimerService.appVisible = true;
        // the page is on screen and shows the phase itself: the last phase notice can go
        androidx.core.app.NotificationManagerCompat.from(this).cancel(TimerService.ID_ALERT);
    }
    @Override public void onPause() { TimerService.appVisible = false; super.onPause(); }
}

package io.github.cbgmvinicius.peleja;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.Process;
import android.os.SystemClock;
import android.provider.Settings;
import android.telecom.TelecomManager;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.Chronometer;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/**
 * Blocks other apps while a focus phase is running (the member's choice in Configurações › Pomodoro):
 * about once a second it looks at the app in front (usage access) and, if it is not on the member's list,
 * covers it with a Peleja screen ("Volta pro foco") until they leave it. Breaks and Pausar free everything.
 * The Peleja itself, the home screen, the phone app, keyboards, system UI and Settings are never blocked.
 */
class AppBlocker {
    private final TimerService svc;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Set<String> allow = new HashSet<>();
    private Set<String> always;
    private boolean active;
    private long endAt, startAt;
    private boolean overtime;
    private String task = "", front;
    private View overlay;

    AppBlocker(TimerService svc) { this.svc = svc; }

    // ---------- permissions (also used by the plugin) ----------
    static boolean hasUsage(Context c) {
        AppOpsManager ops = (AppOpsManager) c.getSystemService(Context.APP_OPS_SERVICE);
        int mode = Build.VERSION.SDK_INT >= 29
            ? ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.getPackageName())
            : ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.getPackageName());
        if (mode == AppOpsManager.MODE_DEFAULT)
            return c.checkCallingOrSelfPermission(android.Manifest.permission.PACKAGE_USAGE_STATS) == PackageManager.PERMISSION_GRANTED;
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    static boolean hasOverlay(Context c) { return Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(c); }

    // ---------- state from the timer ----------
    /** Called by the service whenever the timer changes; seg == null means no session. */
    void update(JSONObject plan, JSONObject seg, boolean paused, long segStart, long dur) {
        JSONObject block = plan == null ? null : plan.optJSONObject("block");
        boolean on = block != null && block.optBoolean("on") && seg != null && "focus".equals(seg.optString("mode")) && !paused
            && hasUsage(svc) && hasOverlay(svc);
        if (!on) { stop(); return; }
        allow.clear();
        JSONArray list = block.optJSONArray("allow");
        if (list != null) for (int i = 0; i < list.length(); i++) allow.add(list.optString(i));
        task = plan.optString("task");
        startAt = segStart; endAt = segStart + dur;
        overtime = seg.optBoolean("open") && System.currentTimeMillis() >= endAt;
        if (overlay != null) fillClock();
        // starting (or back from a pause) with an app already open: look further back to know which one
        if (!active) { active = true; front = foreground(6 * 3600_000L); handler.post(tick); }
    }

    void stop() {
        active = false;
        handler.removeCallbacks(tick);
        hide();
    }

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (!active) return;
            PowerManager pm = (PowerManager) svc.getSystemService(Context.POWER_SERVICE);
            if (pm.isInteractive()) {
                String now = foreground(10_000);
                if (now != null) front = now;
                if (front != null && !allowed(front)) show(); else hide();
            }
            handler.postDelayed(this, 1000);
        }
    };

    /** The last app that came to the front in the last seconds (null if nothing changed). */
    private String foreground(long back) {
        UsageStatsManager um = (UsageStatsManager) svc.getSystemService(Context.USAGE_STATS_SERVICE);
        long now = System.currentTimeMillis();
        UsageEvents events = um.queryEvents(now - back, now);
        UsageEvents.Event e = new UsageEvents.Event();
        String pkg = null;
        while (events.hasNextEvent()) {
            events.getNextEvent(e);
            if (e.getEventType() == UsageEvents.Event.MOVE_TO_FOREGROUND) pkg = e.getPackageName();
        }
        return pkg;
    }

    private boolean allowed(String pkg) {
        if (always == null) always = alwaysAllowed(svc);
        return always.contains(pkg) || allow.contains(pkg);
    }

    /** Never blocked: the Peleja, home screens, the phone app, keyboards, system UI, Settings and permission screens. */
    static Set<String> alwaysAllowed(Context c) {
        Set<String> s = new HashSet<>();
        PackageManager pm = c.getPackageManager();
        s.add(c.getPackageName());
        s.add("android"); s.add("com.android.systemui");
        s.add("com.android.permissioncontroller"); s.add("com.google.android.permissioncontroller");
        s.add("com.android.packageinstaller"); s.add("com.google.android.packageinstaller");
        s.add("com.android.emergency"); s.add("com.android.settings");
        for (ResolveInfo r : pm.queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), 0))
            s.add(r.activityInfo.packageName);
        ResolveInfo settings = pm.resolveActivity(new Intent(Settings.ACTION_SETTINGS), 0);
        if (settings != null) s.add(settings.activityInfo.packageName);
        try {
            TelecomManager tm = (TelecomManager) c.getSystemService(Context.TELECOM_SERVICE);
            if (tm != null && tm.getDefaultDialerPackage() != null) s.add(tm.getDefaultDialerPackage());
        } catch (RuntimeException ignored) { }
        InputMethodManager im = (InputMethodManager) c.getSystemService(Context.INPUT_METHOD_SERVICE);
        if (im != null) for (InputMethodInfo i : im.getEnabledInputMethodList()) s.add(i.getPackageName());
        return s;
    }

    // ---------- the block screen ----------
    private Chronometer clock;

    private void show() {
        if (overlay != null || !hasOverlay(svc)) return;
        Context c = svc;
        LinearLayout box = new LinearLayout(c);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setBackgroundColor(0xFFF3DFC1);
        int pad = dp(32);
        box.setPadding(pad, pad, pad, pad);

        ImageView cactus = new ImageView(c);
        cactus.setImageResource(R.drawable.splash_icon);
        box.addView(cactus, new LinearLayout.LayoutParams(dp(96), dp(96)));

        TextView title = text(c, "Volta pro foco", 28, true, 0xFF2F3A2B);
        title.setPadding(0, dp(20), 0, dp(4));
        box.addView(title);
        box.addView(text(c, task.isEmpty() ? "Esse app fica para a pausa." : task, 16, false, 0xFF5C5248));

        clock = new Chronometer(c);
        clock.setTextSize(TypedValue.COMPLEX_UNIT_SP, 56);
        clock.setTextColor(0xFF2F3A2B);
        clock.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        clock.setGravity(Gravity.CENTER);
        clock.setPadding(0, dp(18), 0, dp(26));
        fillClock();
        box.addView(clock);

        Button back = new Button(c);
        back.setText("Voltar ao Peleja");
        back.setAllCaps(false);
        back.setTextColor(Color.WHITE);
        back.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xFF506747); bg.setCornerRadius(dp(28));
        back.setBackground(bg);
        back.setPadding(dp(28), dp(14), dp(28), dp(14));
        back.setOnClickListener(v -> {
            hide();
            Intent i = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            c.startActivity(i);
        });
        box.addView(back, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        Button pause = new Button(c);
        pause.setText("Pausar o foco");
        pause.setAllCaps(false);
        pause.setTextColor(0xFF506747);
        pause.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        pause.setBackgroundColor(Color.TRANSPARENT);
        pause.setOnClickListener(v -> svc.pressFromBlocker("toggle"));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(8);
        box.addView(pause, lp);

        WindowManager.LayoutParams p = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
            Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN, PixelFormat.OPAQUE);
        try {
            ((WindowManager) c.getSystemService(Context.WINDOW_SERVICE)).addView(box, p);
            overlay = box;
        } catch (RuntimeException e) { overlay = null; }
    }

    private void fillClock() {
        if (clock == null) return;
        long now = System.currentTimeMillis();
        if (overtime) { clock.setCountDown(false); clock.setBase(SystemClock.elapsedRealtime() - (now - startAt)); }
        else { clock.setCountDown(true); clock.setBase(SystemClock.elapsedRealtime() + Math.max(0, endAt - now)); }
        clock.start();
    }

    private void hide() {
        if (overlay == null) return;
        try { ((WindowManager) svc.getSystemService(Context.WINDOW_SERVICE)).removeView(overlay); } catch (RuntimeException ignored) { }
        if (clock != null) clock.stop();
        overlay = null; clock = null;
    }

    private int dp(int v) { return Math.round(v * svc.getResources().getDisplayMetrics().density); }

    private static TextView text(Context c, String s, int sp, boolean bold, int color) {
        TextView t = new TextView(c);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setGravity(Gravity.CENTER);
        if (bold) t.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        return t;
    }
}

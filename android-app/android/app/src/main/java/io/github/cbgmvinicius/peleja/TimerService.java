package io.github.cbgmvinicius.peleja;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Locale;

/**
 * The Pomodoro timer while the phone is in the pocket: a foreground service with a notification that
 * counts down for real, has Pausar/Continuar, Pular and Concluir, and moves to the next phase on time
 * (exact alarms) even if the app was closed.
 *
 * The page stays in charge: it sends the plan of the session (the phases ahead, from its own state) and
 * this service only follows it. Buttons pressed here change the plan locally right away and are queued
 * with their time; the page replays them (drain) when it runs again, so both end up in the same place.
 */
public class TimerService extends Service {
    static final String ACTION_UPDATE = "peleja.timer.UPDATE";
    static final String ACTION_TICK = "peleja.timer.TICK";
    static final String ACTION_BUTTON = "peleja.timer.BUTTON";
    static final String CH_TIMER = "pomodoro_timer", CH_FOCUS = "pomodoro_focus", CH_BREAK = "pomodoro_break";
    static final int ID_TIMER = 41, ID_ALERT = 42;
    static final String PREFS = "peleja_timer";
    static final Object LOCK = new Object();

    static volatile TimerService instance;
    static volatile boolean appVisible;

    // The plan (from the page) and where we are in it.
    private JSONObject plan;
    private JSONArray segments;
    private int idx;
    private long segStart, pausedElapsed;
    private boolean paused, flowNotified;
    private AppBlocker blocker;

    // ---------- called from the plugin ----------
    static void apply(Context ctx, String planJson) {
        new Handler(Looper.getMainLooper()).post(() -> {
            TimerService s = instance;
            if (s != null) { s.load(planJson); s.refresh(); return; }
            Intent i = new Intent(ctx, TimerService.class).setAction(ACTION_UPDATE).putExtra("plan", planJson);
            try { ContextCompat.startForegroundService(ctx, i); } catch (RuntimeException ignored) { }
        });
    }

    static void stopTimer(Context ctx) {
        new Handler(Looper.getMainLooper()).post(() -> {
            TimerService s = instance;
            if (s != null) s.finishLocal();
            else { prefs(ctx).edit().remove("state").apply(); NotificationManagerCompat.from(ctx).cancel(ID_TIMER); }
        });
    }

    /** Buttons pressed here that the page has not applied yet, oldest first; clears the queue. */
    static JSONArray drain(Context ctx) {
        synchronized (LOCK) {
            SharedPreferences p = prefs(ctx);
            JSONArray q;
            try { q = new JSONArray(p.getString("queue", "[]")); } catch (JSONException e) { q = new JSONArray(); }
            p.edit().remove("queue").commit();
            return q;
        }
    }

    static SharedPreferences prefs(Context ctx) { return ctx.getSharedPreferences(PREFS, MODE_PRIVATE); }

    static void channels(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        NotificationChannel timer = new NotificationChannel(CH_TIMER, "Timer do Pomodoro", NotificationManager.IMPORTANCE_LOW);
        timer.setDescription("O tempo da fase atual, com Pausar, Pular e Concluir");
        timer.setShowBadge(false);
        nm.createNotificationChannel(timer);
        nm.createNotificationChannel(alertChannel(ctx, CH_FOCUS, "Começo do foco", R.raw.session_start));
        nm.createNotificationChannel(alertChannel(ctx, CH_BREAK, "Começo da pausa e fim da sessão", R.raw.session_end));
    }

    private static NotificationChannel alertChannel(Context ctx, String id, String name, int sound) {
        NotificationChannel c = new NotificationChannel(id, name, NotificationManager.IMPORTANCE_HIGH);
        c.setSound(Uri.parse("android.resource://" + ctx.getPackageName() + "/" + sound),
            new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        c.enableVibration(true);
        return c;
    }

    // ---------- lifecycle ----------
    @Override public void onCreate() { super.onCreate(); instance = this; channels(this); blocker = new AppBlocker(this); }
    @Override public void onDestroy() { blocker.stop(); if (instance == this) instance = null; super.onDestroy(); }
    @Override public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_UPDATE.equals(action)) load(intent.getStringExtra("plan"));
        else if (plan == null) restore();
        if (plan == null) { quit(); return START_NOT_STICKY; }
        // Every start must reach startForeground in time, whatever comes next.
        try {
            ServiceCompat.startForeground(this, ID_TIMER, build(),
                Build.VERSION.SDK_INT >= 34 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE : 0);
        } catch (RuntimeException e) { quit(); return START_NOT_STICKY; }
        if (ACTION_BUTTON.equals(action)) press(intent.getStringExtra("action"));
        refresh();
        return START_STICKY;
    }

    // ---------- state ----------
    private void load(String json) {
        try {
            plan = new JSONObject(json);
            segments = plan.getJSONArray("segments");
            idx = 0;
            paused = plan.optBoolean("paused");
            flowNotified = plan.optBoolean("flowNotified");
            long elapsed = plan.optLong("elapsedMs");
            if (paused) pausedElapsed = elapsed; else segStart = plan.optLong("at", System.currentTimeMillis()) - elapsed;
            persist();
        } catch (JSONException e) { plan = null; }
    }

    private void restore() {
        try {
            JSONObject s = new JSONObject(prefs(this).getString("state", ""));
            plan = s.getJSONObject("plan");
            segments = plan.getJSONArray("segments");
            idx = s.getInt("idx"); segStart = s.getLong("segStart"); pausedElapsed = s.getLong("pausedElapsed");
            paused = s.getBoolean("paused"); flowNotified = s.getBoolean("flowNotified");
        } catch (JSONException e) { plan = null; }
    }

    private void persist() {
        if (plan == null) return;
        try {
            JSONObject s = new JSONObject().put("plan", plan).put("idx", idx).put("segStart", segStart)
                .put("pausedElapsed", pausedElapsed).put("paused", paused).put("flowNotified", flowNotified);
            prefs(this).edit().putString("state", s.toString()).apply();
        } catch (JSONException ignored) { }
    }

    private JSONObject seg() { return segments.optJSONObject(idx); }
    private long dur() { return seg().optLong("durMs"); }

    /** Moves through the phases whose time is up (each one starting where the last ended). */
    private void step() {
        if (plan == null || paused) return;
        long now = System.currentTimeMillis();
        for (int guard = 0; guard < 60 && idx < segments.length(); guard++) {
            long end = segStart + dur();
            if (now < end) return;
            if (seg().optBoolean("open")) { // flow: the focus goes on past the minimum until Pular
                if (!flowNotified) { flowNotified = true; alert(CH_FOCUS, plan.optString("flowText")); }
                return;
            }
            segStart = end; idx++; flowNotified = false;
            if (idx >= segments.length()) { alert(CH_BREAK, plan.optString("endText")); finishLocal(); return; }
            alert("focus".equals(seg().optString("mode")) ? CH_FOCUS : CH_BREAK, seg().optString("startText"));
        }
    }

    private void press(String action) {
        if (plan == null || action == null) return;
        step();
        if (plan == null) return;
        long now = System.currentTimeMillis();
        synchronized (LOCK) {
            try {
                JSONArray q = new JSONArray(prefs(this).getString("queue", "[]"));
                q.put(new JSONObject().put("action", action).put("at", now));
                prefs(this).edit().putString("queue", q.toString()).commit();
            } catch (JSONException ignored) { }
        }
        switch (action) {
            case "toggle":
                if (paused) { segStart = now - pausedElapsed; paused = false; }
                else { pausedElapsed = now - segStart; paused = true; }
                break;
            case "skip":
                if (paused) paused = false;
                idx++; segStart = now; flowNotified = false;
                if (idx >= segments.length()) finishLocal();
                break;
            case "finish":
                finishLocal();
                break;
        }
        PelejaTimerPlugin.emit();
    }

    private void refresh() {
        step();
        if (plan == null) return;
        persist();
        NotificationManagerCompat nm = NotificationManagerCompat.from(this);
        if (canNotify()) nm.notify(ID_TIMER, build());
        schedule();
        blocker.update(plan, seg(), paused, segStart, dur());
    }

    /** "Pausar o foco" on the block screen: the same as the notification's button. */
    void pressFromBlocker(String action) { press(action); refresh(); }

    private void finishLocal() {
        if (blocker != null) blocker.stop();
        plan = null; segments = null;
        prefs(this).edit().remove("state").apply();
        alarms().cancel(tick());
        quit();
    }

    private void quit() {
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        NotificationManagerCompat.from(this).cancel(ID_TIMER);
        stopSelf();
    }

    // ---------- alarms ----------
    private AlarmManager alarms() { return (AlarmManager) getSystemService(ALARM_SERVICE); }

    private PendingIntent tick() {
        Intent i = new Intent(this, TimerService.class).setAction(ACTION_TICK);
        int f = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
        return Build.VERSION.SDK_INT >= 26 ? PendingIntent.getForegroundService(this, 1, i, f) : PendingIntent.getService(this, 1, i, f);
    }

    private void schedule() {
        AlarmManager am = alarms();
        if (paused || idx >= segments.length() || (seg().optBoolean("open") && flowNotified)) { am.cancel(tick()); return; }
        long at = segStart + dur();
        boolean exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
        if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, tick());
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, tick());
    }

    // ---------- notifications ----------
    private boolean canNotify() {
        return Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    private PendingIntent button(String action, int code) {
        Intent i = new Intent(this, TimerService.class).setAction(ACTION_BUTTON).putExtra("action", action);
        int f = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
        return Build.VERSION.SDK_INT >= 26 ? PendingIntent.getForegroundService(this, 10 + code, i, f) : PendingIntent.getService(this, 10 + code, i, f);
    }

    private PendingIntent openApp() {
        Intent i = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(this, 2, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private Notification build() {
        JSONObject s = seg();
        String task = plan.optString("task");
        String mode = s.optString("mode");
        String label = "focus".equals(mode) ? "Foco" : "long".equals(mode) ? "Pausa longa" : "Pausa curta";
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CH_TIMER)
            .setSmallIcon(R.drawable.ic_stat_peleja)
            .setColor(0xFF506747)
            .setContentTitle(s.optString("title"))
            .setContentIntent(openApp())
            .setOngoing(true).setOnlyAlertOnce(true).setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE);
        long now = System.currentTimeMillis();
        String text;
        if (paused) {
            text = "Pausado · " + fmt(dur() - pausedElapsed) + " restantes";
            b.setShowWhen(false).setUsesChronometer(false);
        } else if (s.optBoolean("open") && now >= segStart + dur()) {
            text = "Flow · tempo mínimo cumprido";
            b.setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(false).setWhen(segStart);
        } else {
            text = label;
            b.setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(true).setWhen(segStart + dur());
        }
        if (!task.isEmpty()) text += " · " + task;
        b.setContentText(text);
        b.addAction(0, paused ? "Continuar" : "Pausar", button("toggle", 0));
        b.addAction(0, "Pular", button("skip", 1));
        b.addAction(0, "Concluir", button("finish", 2));
        return b.build();
    }

    /** A short notice with sound when a phase starts; only when the app is not on screen (the page chimes then). */
    private void alert(String channel, String text) {
        if (appVisible || text == null || text.isEmpty() || !canNotify()) return;
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, channel)
            .setSmallIcon(R.drawable.ic_stat_peleja).setColor(0xFF506747)
            .setContentTitle("Peleja · Pomodoro").setContentText(text)
            .setContentIntent(openApp()).setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setTimeoutAfter(5 * 60 * 1000);
        if (!plan.optBoolean("effects", true)) b.setSilent(true);
        NotificationManagerCompat.from(this).notify(ID_ALERT, b.build());
    }

    private static String fmt(long ms) {
        long t = Math.max(0, ms / 1000), h = t / 3600, m = (t / 60) % 60, sec = t % 60;
        return h > 0 ? String.format(Locale.ROOT, "%d:%02d:%02d", h, m, sec) : String.format(Locale.ROOT, "%02d:%02d", m, sec);
    }
}

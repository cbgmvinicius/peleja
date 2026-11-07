package io.github.cbgmvinicius.peleja;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.provider.Settings;
import android.util.Base64;

import org.json.JSONException;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** The page's side of the native timer (next/directions/pomodoro.js): update the plan, stop, and drain the buttons. */
@CapacitorPlugin(name = "PelejaTimer")
public class PelejaTimerPlugin extends Plugin {
    private static volatile PelejaTimerPlugin current;

    @Override public void load() { current = this; }
    @Override protected void handleOnDestroy() { if (current == this) current = null; }

    @PluginMethod
    public void update(PluginCall call) {
        TimerService.apply(getContext(), call.getData().toString());
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        TimerService.stopTimer(getContext());
        call.resolve();
    }

    @PluginMethod
    public void drain(PluginCall call) {
        JSObject r = new JSObject();
        try { r.put("actions", new JSArray(TimerService.drain(getContext()).toString())); }
        catch (JSONException e) { r.put("actions", new JSArray()); }
        call.resolve(r);
    }

    // ---------- blocking other apps during focus (AppBlocker) ----------
    @PluginMethod
    public void blockStatus(PluginCall call) {
        JSObject r = new JSObject();
        r.put("usage", AppBlocker.hasUsage(getContext()));
        r.put("overlay", AppBlocker.hasOverlay(getContext()));
        call.resolve(r);
    }

    /** Opens the system screen where the member grants "usage access" or "display over other apps". */
    @PluginMethod
    public void openBlockSettings(PluginCall call) {
        boolean usage = "usage".equals(call.getString("which"));
        Uri pkg = Uri.parse("package:" + getContext().getPackageName());
        Intent i = new Intent(usage ? Settings.ACTION_USAGE_ACCESS_SETTINGS : Settings.ACTION_MANAGE_OVERLAY_PERMISSION, pkg).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { getContext().startActivity(i); }
        catch (RuntimeException e) {
            // some phones only open the general list
            try { getContext().startActivity(new Intent(usage ? Settings.ACTION_USAGE_ACCESS_SETTINGS : Settings.ACTION_MANAGE_OVERLAY_PERMISSION).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
            catch (RuntimeException ignored) { call.reject("Não deu para abrir as configurações"); return; }
        }
        call.resolve();
    }

    /** Apps the member can pick as allowed: everything with an icon in the app drawer, minus the Peleja and the always-allowed ones. */
    @PluginMethod
    public void listApps(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        Set<String> always = AppBlocker.alwaysAllowed(getContext()), seen = new HashSet<>();
        List<JSObject> apps = new ArrayList<>();
        for (ResolveInfo r : pm.queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0)) {
            String id = r.activityInfo.packageName;
            if (always.contains(id) || !seen.add(id)) continue;
            JSObject a = new JSObject();
            a.put("id", id);
            a.put("label", String.valueOf(r.loadLabel(pm)));
            a.put("icon", icon(r.loadIcon(pm)));
            apps.add(a);
        }
        apps.sort((x, y) -> x.getString("label", "").compareToIgnoreCase(y.getString("label", "")));
        JSObject res = new JSObject();
        res.put("apps", new JSArray(apps));
        call.resolve(res);
    }

    private static String icon(Drawable d) {
        try {
            Bitmap b = Bitmap.createBitmap(48, 48, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(b);
            d.setBounds(0, 0, 48, 48);
            d.draw(c);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            b.compress(Bitmap.CompressFormat.PNG, 100, out);
            return "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        } catch (RuntimeException e) { return ""; }
    }

    /** A button was pressed on the notification: the page drains the queue if it is running. */
    static void emit() {
        PelejaTimerPlugin p = current;
        if (p != null) p.notifyListeners("action", new JSObject());
    }
}

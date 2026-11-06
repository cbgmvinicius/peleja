package io.github.cbgmvinicius.peleja;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

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

    /** A button was pressed on the notification: the page drains the queue if it is running. */
    static void emit() {
        PelejaTimerPlugin p = current;
        if (p != null) p.notifyListeners("action", new JSObject());
    }
}

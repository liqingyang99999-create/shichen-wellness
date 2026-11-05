package cn.shichen.wellness;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Receives only app-owned immutable alarm intents; schedules are revalidated on delivery. */
public final class ReminderReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent) {
        try { new NotificationCoordinator(context).deliver(intent); }
        catch(Exception ignored) { /* Never invent a successful delivery or health event. */ }
    }
}

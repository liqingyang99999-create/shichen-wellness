package cn.shichen.wellness;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class ReminderRestoreReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent) {
        String action=intent.getAction();
        if(!Intent.ACTION_BOOT_COMPLETED.equals(action) && !Intent.ACTION_TIME_CHANGED.equals(action)
            && !Intent.ACTION_TIMEZONE_CHANGED.equals(action) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
            && !android.app.AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED.equals(action))return;
        try { new NotificationCoordinator(context).restore(); } catch(Exception ignored) { }
    }
}

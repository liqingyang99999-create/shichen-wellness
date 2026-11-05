package cn.shichen.wellness;

import android.Manifest;
import android.app.AlarmManager;
import android.app.ActivityManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.Instant;
import java.util.HashSet;
import java.util.UUID;

/** Persisted local system alarms. No background health queries or continuously running service. */
final class NotificationCoordinator {
    private static final Object LOCK=new Object();
    private static final String DAILY="shichen_daily_v1", MEDICINE="shichen_medicine_v1", QUIET="shichen_quiet_v1";
    private final Context context;
    private final SharedPreferences prefs;
    private final NotificationManager manager;
    private final AlarmManager alarms;
    NotificationCoordinator(Context context) {
        this.context=context.getApplicationContext();
        prefs=this.context.getSharedPreferences("shichen-reminders-v1",Context.MODE_PRIVATE);
        manager=this.context.getSystemService(NotificationManager.class);
        alarms=this.context.getSystemService(AlarmManager.class);
        if(manager!=null) {
            manager.createNotificationChannel(new NotificationChannel(DAILY,"日常养生提醒",NotificationManager.IMPORTANCE_DEFAULT));
            manager.createNotificationChannel(new NotificationChannel(MEDICINE,"自设用药提醒",NotificationManager.IMPORTANCE_DEFAULT));
            NotificationChannel quiet=new NotificationChannel(QUIET,"静音提醒",NotificationManager.IMPORTANCE_LOW);
            quiet.setSound(null,null);quiet.enableVibration(false);manager.createNotificationChannel(quiet);
        }
    }
    void markPermissionAsked(){prefs.edit().putBoolean("permissionAsked",true).apply();}
    String permission() {
        if(Build.VERSION.SDK_INT<33 || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED)return "granted";
        return prefs.getBoolean("permissionAsked",false)?"denied":"prompt";
    }
    private boolean enabled(String channel) {
        if(manager==null || !"granted".equals(permission()) || !manager.areNotificationsEnabled())return false;
        NotificationChannel config=manager.getNotificationChannel(channel);
        return config!=null && config.getImportance()!=NotificationManager.IMPORTANCE_NONE;
    }
    private boolean canNotifyPlan(JSONObject plan) throws Exception {
        if(manager==null||!"granted".equals(permission())||!manager.areNotificationsEnabled())return false;
        JSONArray list=items(plan);
        for(int i=0;i<list.length();i++) {
            JSONObject item=list.getJSONObject(i);String kind=item.getString("kind");java.time.LocalTime time=ReminderPolicy.time(item.getString("time"));
            if(!ReminderPolicy.eligible(kind,time,plan.optBoolean("nightMedicationSilent")))continue;
            String channel=ReminderPolicy.quiet(time)?QUIET:("medicine".equals(kind)?MEDICINE:DAILY);
            if(!enabled(channel))return false;
            NotificationChannel config=manager.getNotificationChannel(channel);
            if(QUIET.equals(channel)&&(config.getSound()!=null||config.shouldVibrate()||config.getImportance()>NotificationManager.IMPORTANCE_LOW))return false;
        }
        return true;
    }
    JSONObject status() throws Exception {
        JSONObject channels=new JSONObject().put("card",enabled(DAILY)).put("medicine",enabled(MEDICINE)).put("silent",enabled(QUIET));
        PowerManager power=context.getSystemService(PowerManager.class);ActivityManager activity=context.getSystemService(ActivityManager.class);
        JSONObject schedule=scheduleStatus();boolean exact=exactAvailable();
        return new JSONObject().put("permission",permission()).put("enabled",manager!=null&&manager.areNotificationsEnabled())
            .put("canNotify",enabled(DAILY)||enabled(MEDICINE)||enabled(QUIET)).put("channels",channels)
            .put("exact",exact).put("exactPermission",Build.VERSION.SDK_INT<31?"not_required":exact?"granted":"denied")
            .put("scheduleMode",exact?"exact":"inexact").put("backgroundSupported",alarms!=null)
            .put("batteryOptimizationIgnored",power!=null&&power.isIgnoringBatteryOptimizations(context.getPackageName()))
            .put("batterySaver",power!=null&&power.isPowerSaveMode()).put("backgroundRestricted",activity!=null&&activity.isBackgroundRestricted())
            .put("scheduled",schedule.getInt("scheduled")).put("nextAt",schedule.opt("nextAt"))
            .put("lastScheduledAt",prefs.getLong("lastScheduledAt",0)>0?prefs.getLong("lastScheduledAt",0):JSONObject.NULL)
            .put("lastDelivery",readObject("lastDelivery")).put("timezone",ReminderPolicy.ZONE.toString()).put("recent",recent())
            .put("message","提醒已交给安卓系统，普通退后台无需网页常开；强制停止后须重新打开。省电、勿扰及卓易通宿主仍可能限制送达。");
    }
    private Object readObject(String key){try{String value=prefs.getString(key,null);return value==null?JSONObject.NULL:new JSONObject(value);}catch(Exception ignored){return JSONObject.NULL;}}
    private boolean exactAvailable(){return alarms!=null&&(Build.VERSION.SDK_INT<31||alarms.canScheduleExactAlarms());}
    private JSONObject scheduleStatus() throws Exception {
        int count=0;long next=Long.MAX_VALUE;
        for(String mode:new String[]{"personal","competition"}){
            JSONObject p=plan(mode);if(!p.optBoolean("enabled"))continue;JSONArray list=items(p);
            for(int i=0;i<list.length();i++){JSONObject item=list.getJSONObject(i);
                if(!ReminderPolicy.eligible(item.getString("kind"),ReminderPolicy.time(item.getString("time")),p.optBoolean("nightMedicationSilent")))continue;
                long at=prefs.getLong("next-"+alarmUri(p,item),0);if(at>0){count++;next=Math.min(next,at);}
            }
        }
        return new JSONObject().put("scheduled",count).put("nextAt",next==Long.MAX_VALUE?JSONObject.NULL:next);
    }
    private boolean arm(long at,PendingIntent pending) {
        if(alarms==null)throw new IllegalStateException("此安卓环境未提供系统提醒服务。");
        long trigger=Math.max(System.currentTimeMillis()+1000,at);
        if(exactAvailable())try{alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,trigger,pending);return true;}catch(SecurityException ignored){/* Permission changed between check and registration. */}
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,trigger,pending);return false;
    }
    private void rememberArm(Uri uri,long at,boolean exact){prefs.edit().putLong("next-"+uri,at).putBoolean("exact-"+uri,exact).putLong("lastScheduledAt",System.currentTimeMillis()).apply();}
    private void receipt(String outcome,long expected) {try{prefs.edit().putString("lastDelivery",new JSONObject().put("at",System.currentTimeMillis()).put("expectedAt",expected).put("outcome",outcome).toString()).apply();}catch(Exception ignored){}}
    private JSONArray recent(){try{return new JSONArray(prefs.getString("recent","[]"));}catch(Exception ignored){return new JSONArray();}}
    private JSONObject plan(String mode){try{return new JSONObject(prefs.getString("plan-"+mode,"{}"));}catch(Exception ignored){return new JSONObject();}}
    private JSONArray items(JSONObject plan){JSONArray list=plan.optJSONArray("reminders");return list==null?new JSONArray():list;}
    private String tag(String mode,String kind,String id){return "shichen:"+mode+":"+kind+":"+id;}
    private Uri alarmUri(JSONObject plan,JSONObject item) {
        return new Uri.Builder().scheme("shichen-reminder").authority("local").appendPath(plan.optString("mode"))
            .appendPath(item.optString("kind")).appendPath(item.optString("id")).appendQueryParameter("token",plan.optString("token")).build();
    }
    private PendingIntent alarmIntent(JSONObject plan,JSONObject item,long at,int extraFlags) {
        Intent intent=new Intent(context,ReminderReceiver.class).setData(alarmUri(plan,item)).putExtra("expectedAt",at);
        return PendingIntent.getBroadcast(context,0,intent,PendingIntent.FLAG_IMMUTABLE|extraFlags);
    }
    private void cancelAlarms(JSONObject plan) {
        SharedPreferences.Editor cleanup=prefs.edit();
        JSONArray list=items(plan);
        for(int i=0;i<list.length();i++) {
            JSONObject item=list.optJSONObject(i);if(item==null)continue;
            PendingIntent pending=alarmIntent(plan,item,0,PendingIntent.FLAG_NO_CREATE);
            if(pending!=null){if(alarms!=null)alarms.cancel(pending);pending.cancel();}
            cleanup.remove("delivered-"+alarmUri(plan,item).toString());
            cleanup.remove("next-"+alarmUri(plan,item).toString()).remove("exact-"+alarmUri(plan,item).toString());
        }
        cleanup.apply();
    }
    private int schedule(JSONObject plan) throws Exception {
        if(!plan.optBoolean("enabled") || alarms==null)return 0;
        JSONArray list=items(plan);int count=0;
        for(int i=0;i<list.length();i++) {
            JSONObject item=list.getJSONObject(i);String kind=item.getString("kind"),time=item.getString("time");
            if(!ReminderPolicy.eligible(kind,ReminderPolicy.time(time),plan.optBoolean("nightMedicationSilent")))continue;
            Uri uri=alarmUri(plan,item);long at=ReminderPolicy.restoreTime(time,System.currentTimeMillis(),prefs.getLong("next-"+uri,0),prefs.getLong("delivered-"+uri,0));
            boolean exact=arm(at,alarmIntent(plan,item,at,PendingIntent.FLAG_UPDATE_CURRENT));rememberArm(uri,at,exact);count++;
        }
        return count;
    }
    JSONObject sync(JSONObject input) throws Exception {
        String mode=ReminderPolicy.mode(input.getString("mode"));
        if(!input.has("enabled") || !(input.get("enabled") instanceof Boolean))throw new IllegalArgumentException("请明确开启或关闭提醒。");
        JSONObject quiet=input.optJSONObject("quietHours");
        if(quiet==null || !"23:00".equals(quiet.optString("start")) || !"05:00".equals(quiet.optString("end")))throw new IllegalArgumentException("夜间静默时段应为 23:00–05:00。");
        JSONArray incoming=input.optJSONArray("reminders");
        if(incoming==null || incoming.length()>96)throw new IllegalArgumentException("提醒列表无效或过长。");
        JSONArray cleaned=new JSONArray();HashSet<String> ids=new HashSet<>();int cardCount=0,skipped=0;
        boolean night=input.optBoolean("nightMedicationSilent",false);
        for(int i=0;i<incoming.length();i++) {
            JSONObject item=incoming.getJSONObject(i);
            String id=ReminderPolicy.id(item.getString("id")),kind=ReminderPolicy.kind(item.getString("kind")),time=item.getString("time");ReminderPolicy.time(time);
            if(!ids.add(kind+":"+id))throw new IllegalArgumentException("提醒标识重复。");
            if(!item.optBoolean("enabled",true))continue;
            if("card".equals(kind))ReminderPolicy.checkRoutineCount(++cardCount);
            if(!ReminderPolicy.eligible(kind,ReminderPolicy.time(time),night))skipped++;
            cleaned.put(new JSONObject().put("id",id).put("kind",kind).put("time",time));
        }
        JSONObject next=new JSONObject().put("mode",mode).put("enabled",input.getBoolean("enabled"))
            .put("nightMedicationSilent",night).put("reminders",cleaned).put("token",UUID.randomUUID().toString());
        synchronized(LOCK) {
            JSONObject old=plan(mode);
            boolean identical=old.optBoolean("enabled")==next.optBoolean("enabled")&&old.optBoolean("nightMedicationSilent")==night&&items(old).toString().equals(cleaned.toString())&&!old.optString("token").isEmpty();
            if(identical)next.put("token",old.getString("token"));
            if(!prefs.edit().putString("plan-"+mode,next.toString()).commit())throw new IllegalStateException("提醒未能保存，请重试。");
            if(!identical)cancelAlarms(old);
            int scheduled=schedule(next);
            return new JSONObject().put("scheduled",scheduled).put("skippedNight",skipped).put("exact",exactAvailable()).put("scheduleMode",exactAvailable()?"exact":"inexact").put("nextAt",scheduleStatus().opt("nextAt")).put("permission",permission()).put("canNotify",canNotifyPlan(next))
                .put("message",!"granted".equals(permission())?"日程已保存；请允许系统通知后才能显示。":exactAvailable()?"已登记系统定时提醒，退出应用后仍由安卓调度。":"已登记系统弹性提醒，可开启精确提醒授权；省电与勿扰可能影响送达。");
        }
    }
    JSONObject cancel(String mode) throws Exception {
        ReminderPolicy.mode(mode);
        synchronized(LOCK) {
            JSONObject old=plan(mode);int count=items(old).length();
            if(!prefs.edit().remove("plan-"+mode).commit())throw new IllegalStateException("未能取消提醒，请重试。");
            cancelAlarms(old);
            if(manager!=null)for(int i=0;i<recent().length();i++){
                JSONObject item=recent().optJSONObject(i);if(item!=null&&mode.equals(item.optString("mode")))manager.cancel(tag(mode,item.optString("kind"),item.optString("id")),1);
            }
            return new JSONObject().put("cancelled",count).put("mode",mode);
        }
    }
    void restore() throws Exception { synchronized(LOCK) {schedule(plan("personal"));schedule(plan("competition"));} }
    JSONObject scheduleTest(JSONObject input) throws Exception {
        String mode=ReminderPolicy.mode(input.optString("mode","personal"));
        boolean night=ReminderPolicy.quiet(Instant.ofEpochMilli(System.currentTimeMillis()+60000).atZone(ReminderPolicy.ZONE).toLocalTime());
        if(!enabled(night?QUIET:DAILY))throw new IllegalStateException("请先开启系统通知和对应通知类别，再测试后台提醒。");
        NotificationChannel channel=manager.getNotificationChannel(night?QUIET:DAILY);
        if(night&&(channel.getSound()!=null||channel.shouldVibrate()||channel.getImportance()>NotificationManager.IMPORTANCE_LOW))throw new IllegalStateException("夜间测试需要静音提醒渠道，请先在系统通知设置中将它设为静音。");
        String token=UUID.randomUUID().toString();long at=System.currentTimeMillis()+60000;
        Uri uri=new Uri.Builder().scheme("shichen-test").authority("local").appendPath(mode).appendQueryParameter("token",token).build();
        synchronized(LOCK){
            String old=prefs.getString("testUri",null);if(old!=null){PendingIntent previous=PendingIntent.getBroadcast(context,1,new Intent(context,ReminderReceiver.class).setData(Uri.parse(old)),PendingIntent.FLAG_NO_CREATE|PendingIntent.FLAG_IMMUTABLE);if(previous!=null){alarms.cancel(previous);previous.cancel();}}
            PendingIntent pending=PendingIntent.getBroadcast(context,1,new Intent(context,ReminderReceiver.class).setData(uri).putExtra("expectedAt",at),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
            boolean exact=arm(at,pending);
            if(!prefs.edit().putString("testUri",uri.toString()).putLong("testAt",at).commit()){alarms.cancel(pending);pending.cancel();throw new IllegalStateException("后台测试未能登记，请重试。");}
            return new JSONObject().put("scheduled",true).put("scheduledAt",at).put("exact",exact).put("scheduleMode",exact?"exact":"inexact");
        }
    }
    JSONObject show(JSONObject input) throws Exception {
        String mode=ReminderPolicy.mode(input.getString("mode")),kind=ReminderPolicy.kind(input.getString("kind")),id=ReminderPolicy.id(input.getString("id"));
        // A bridge request cannot opt itself into night medication: only the persisted explicit setting can.
        return post(mode,kind,id,input.optBoolean("test",false),input.optBoolean("silent",false),plan(mode).optBoolean("nightMedicationSilent"));
    }
    private JSONObject post(String mode,String kind,String id,boolean test,boolean requestedSilent,boolean nightMedicine) throws Exception {
        long now=System.currentTimeMillis();boolean night=ReminderPolicy.quiet(Instant.ofEpochMilli(now).atZone(ReminderPolicy.ZONE).toLocalTime());
        if(!ReminderPolicy.mayDeliver(kind,now,nightMedicine,test))return new JSONObject().put("shown",false).put("suppressed","quiet_hours");
        boolean silent=requestedSilent||night;
        String channel=silent?QUIET:("medicine".equals(kind)?MEDICINE:DAILY);
        if(!enabled(channel))throw new IllegalStateException("系统通知或此通知类别未开启，请在系统通知设置中检查。");
        NotificationChannel config=manager.getNotificationChannel(channel);
        if(silent && (config.getSound()!=null || config.shouldVibrate() || config.getImportance()>NotificationManager.IMPORTANCE_LOW))
            throw new IllegalStateException("静音通知渠道被改为有声，请在系统设置中将“静音提醒”设为静音后重试。");
        String title=test?"时辰心管家 · 测试通知":"时辰心管家";
        String body=test?"系统通知已提交，点击返回应用。":("medicine".equals(kind)?"你有一项自设提醒，点此查看。":"到了你设定的提醒时间，点此看看现在适合的小行动。");
        Uri route=new Uri.Builder().scheme("https").authority("shichen-wellness.pages.dev").appendPath("")
            .appendQueryParameter("mode",mode).appendQueryParameter("panel","notifications").appendQueryParameter("notice",id)
            .appendQueryParameter("nativeKind",test?"test":kind).appendQueryParameter("nativeAt",Long.toString(now)).build();
        Intent intent=new Intent(context,MainActivity.class).setData(route).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap=PendingIntent.getActivity(context,0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder=new Notification.Builder(context,channel).setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title).setContentText(body).setContentIntent(tap).setAutoCancel(true).setShowWhen(true).setWhen(now)
            .setVisibility(Notification.VISIBILITY_PRIVATE).setCategory(Notification.CATEGORY_REMINDER);
        if(silent)builder.setSound(null).setVibrate(new long[0]).setGroup("shichen-silent").setGroupAlertBehavior(Notification.GROUP_ALERT_SUMMARY);
        manager.notify(tag(mode,kind,id),1,builder.build());
        synchronized(LOCK) {
            JSONArray previous=recent(),next=new JSONArray();
            next.put(new JSONObject().put("id",id).put("kind",kind).put("mode",mode).put("at",now).put("test",test));
            for(int i=0;i<Math.min(29,previous.length());i++)next.put(previous.get(i));
            prefs.edit().putString("recent",next.toString()).apply();
        }
        return new JSONObject().put("shown",true).put("silent",silent);
    }
    void deliver(Intent intent) throws Exception {
        Uri uri=intent.getData();
        if(uri!=null&&"shichen-test".equals(uri.getScheme())){
            synchronized(LOCK){
                if(!uri.toString().equals(prefs.getString("testUri",null)))return;
                long expected=prefs.getLong("testAt",0);prefs.edit().remove("testUri").remove("testAt").commit();
                if(!ReminderPolicy.deliverable(expected,System.currentTimeMillis(),0)){receipt("test_expired",expected);return;}
                try{post(ReminderPolicy.mode(uri.getPathSegments().get(0)),"card","background-test",true,false,false);receipt("posted",expected);}catch(Exception error){receipt("blocked_or_failed",expected);throw error;}
            }return;
        }
        if(uri==null||!"shichen-reminder".equals(uri.getScheme())||!"local".equals(uri.getHost())||uri.getPathSegments().size()!=3)return;
        synchronized(LOCK) {
            String mode=ReminderPolicy.mode(uri.getPathSegments().get(0));JSONObject plan=plan(mode);
            if(!plan.optBoolean("enabled")||!plan.optString("token").equals(uri.getQueryParameter("token")))return;
            JSONArray list=items(plan);
            for(int i=0;i<list.length();i++){
                JSONObject item=list.getJSONObject(i);
                if(!alarmUri(plan,item).equals(uri))continue;
                long now=System.currentTimeMillis(),expected=intent.getLongExtra("expectedAt",0);
                // Re-arm independently of permission/quiet status. Old or duplicate broadcasts cannot post twice.
                long next=ReminderPolicy.next(item.getString("time"),now);
                boolean exact=arm(next,alarmIntent(plan,item,next,PendingIntent.FLAG_UPDATE_CURRENT));rememberArm(uri,next,exact);
                String delivered="delivered-"+uri.toString();
                if(!ReminderPolicy.deliverable(expected,now,prefs.getLong(delivered,0))){receipt("expired_or_duplicate",expected);return;}
                if(!prefs.edit().putLong(delivered,expected).commit())return;
                try{JSONObject result=post(mode,item.getString("kind"),item.getString("id"),false,false,plan.optBoolean("nightMedicationSilent"));receipt(result.optBoolean("shown")?"posted":"suppressed_quiet",expected);}catch(Exception error){receipt("blocked_or_failed",expected);throw error;}return;
            }
        }
    }
    static String launchUrl(Intent intent) {
        Uri uri=intent==null?null:intent.getData();
        if(uri==null||!"https".equals(uri.getScheme())||!"shichen-wellness.pages.dev".equals(uri.getHost())||uri.getPort()!=-1
            ||uri.getUserInfo()!=null||!"/".equals(uri.getPath())||!"notifications".equals(uri.getQueryParameter("panel")))return MainActivity.START_URL;
        try {
            String mode=ReminderPolicy.mode(uri.getQueryParameter("mode"));String id=ReminderPolicy.id(uri.getQueryParameter("notice"));
            String kind=uri.getQueryParameter("nativeKind");if(!"test".equals(kind))ReminderPolicy.kind(kind);
            long at=Long.parseLong(uri.getQueryParameter("nativeAt"));if(at<=0)return MainActivity.START_URL;
            return new Uri.Builder().scheme("https").authority("shichen-wellness.pages.dev").appendPath("")
                .appendQueryParameter("mode",mode).appendQueryParameter("panel","notifications").appendQueryParameter("notice",id)
                .appendQueryParameter("nativeKind",kind).appendQueryParameter("nativeAt",Long.toString(at)).build().toString();
        }catch(Exception ignored){return MainActivity.START_URL;}
    }
}

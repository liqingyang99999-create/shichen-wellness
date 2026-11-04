package cn.shichen.wellness;

import android.Manifest;
import android.app.Activity;
import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import java.util.Calendar;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;

/** Android shell: trusted-origin web UI, optional on-device capabilities, no API keys. */
public final class MainActivity extends Activity implements SensorEventListener {
    static final String ORIGIN = "https://shichen-wellness.pages.dev";
    static final String START_URL = ORIGIN + "/?mode=app";
    private static final int LOCATION = 41, ACTIVITY = 42;
    private WebView web;
    private LinearLayout errorView;
    private ProgressBar progress;
    private SensorManager sensors;
    private volatile Sensor counter, detector;
    private volatile Sensor activeStepSensor;
    private volatile boolean resumed, listenerRegistered;
    private volatile String stepRegistrationReason="paused";
    private final StepSessionAccumulator stepSession = new StepSessionAccumulator();
    private final ExecutorService metricWorker = Executors.newSingleThreadExecutor();
    private final AtomicLong usageGeneration = new AtomicLong();
    private long usageCacheAt = 0, usageCacheDay = -1;
    private long usageCacheGeneration=-1;
    private JSONObject usageCache;
    private JavaScriptReplyProxy pendingReply;
    private String pendingId;
    private GeolocationPermissions.Callback geoCallback;
    private String geoOrigin;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        sensors = (SensorManager) getSystemService(SENSOR_SERVICE);
        discoverStepSensors();
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(241,245,240));
        // Android 15's enforced edge-to-edge must still reserve status, navigation and keyboard insets.
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(241,245,240));
        root.addView(web, new FrameLayout.LayoutParams(-1,-1));
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        FrameLayout.LayoutParams pp = new FrameLayout.LayoutParams(-1, 6, Gravity.TOP);
        root.addView(progress, pp);
        errorView = new LinearLayout(this);
        errorView.setOrientation(LinearLayout.VERTICAL);
        errorView.setGravity(Gravity.CENTER);
        errorView.setPadding(40,40,40,40);
        errorView.setBackgroundColor(Color.rgb(241,245,240));
        TextView error = new TextView(this);
        error.setText("暂时连接不上\n请检查网络后重试。卡片与聊天需要联网。");
        error.setTextSize(18); error.setGravity(Gravity.CENTER);
        errorView.addView(error);
        Button retry = new Button(this); retry.setText("重新连接");
        retry.setOnClickListener(v -> web.loadUrl(START_URL));
        errorView.addView(retry);
        Button browser = new Button(this); browser.setText("在浏览器打开");
        browser.setOnClickListener(v -> openExternal(Uri.parse(START_URL)));
        errorView.addView(browser);
        errorView.setVisibility(View.GONE);
        root.addView(errorView, new FrameLayout.LayoutParams(-1,-1));
        setContentView(root);

        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setAllowFileAccess(false);
        ws.setAllowContentAccess(false);
        ws.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        ws.setSupportMultipleWindows(false);
        ws.setJavaScriptCanOpenWindowsAutomatically(false);
        ws.setMediaPlaybackRequiresUserGesture(true);
        ws.setGeolocationEnabled(true);
        ws.setSafeBrowsingEnabled(true);
        ws.setUserAgentString(ws.getUserAgentString() + " ShichenWellness/0.3.0");
        WebView.setWebContentsDebuggingEnabled(false);

        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web,"ShichenNative",Collections.singleton(ORIGIN),
                (view, message, origin, mainFrame, reply) -> {
                    if (!mainFrame || !trusted(origin) || !trusted(Uri.parse(web.getUrl() == null ? "" : web.getUrl()))) return;
                    handleMessage(message.getData(), reply);
                });
        }
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (trusted(uri)) return false;
                if (request.isForMainFrame() && request.hasGesture()) openExternal(uri);
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                errorView.setVisibility(View.GONE); progress.setVisibility(View.VISIBLE);
            }
            @Override public void onPageFinished(WebView view, String url) { progress.setVisibility(View.GONE); }
            @Override public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError e) {
                if (req.isForMainFrame()) { errorView.setVisibility(View.VISIBLE); progress.setVisibility(View.GONE); }
            }
            @Override public void onReceivedHttpError(WebView v, WebResourceRequest req, WebResourceResponse response) {
                if (req.isForMainFrame() && response.getStatusCode() >= 400) { errorView.setVisibility(View.VISIBLE); progress.setVisibility(View.GONE); }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView v, int value) { progress.setProgress(value); }
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (!trusted(Uri.parse(origin))) { callback.invoke(origin,false,false); return; }
                if (locationAllowed()) { callback.invoke(origin,true,false); return; }
                if (geoCallback != null || pendingReply != null) { callback.invoke(origin,false,false); return; }
                geoCallback = callback; geoOrigin = origin;
                requestPermissions(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION,Manifest.permission.ACCESS_FINE_LOCATION}, LOCATION);
            }
            @Override public void onGeolocationPermissionsHidePrompt() { clearGeolocation(false); }
        });
        web.loadUrl(START_URL);
    }

    private static boolean trusted(Uri uri) {
        return "https".equals(uri.getScheme()) && "shichen-wellness.pages.dev".equals(uri.getHost())
            && (uri.getPort() == -1 || uri.getPort() == 443) && uri.getUserInfo() == null;
    }
    private void openExternal(Uri uri) {
        if (!"https".equals(uri.getScheme())) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
    }
    private boolean locationAllowed() {
        return checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }
    private boolean activityAllowed() {
        return Build.VERSION.SDK_INT < 29 || checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED;
    }
    private boolean usageAllowed() {
        AppOpsManager ops = (AppOpsManager) getSystemService(APP_OPS_SERVICE);
        try { return ops!=null && ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(),getPackageName()) == AppOpsManager.MODE_ALLOWED; }
        catch(RuntimeException ignored) {return false;}
    }
    private void handleMessage(String raw, JavaScriptReplyProxy reply) {
        String id = "";
        try {
            if (raw == null || raw.length() > 1024) throw new IllegalArgumentException("请求无效。");
            JSONObject request = new JSONObject(raw);
            id = request.getString("id");
            if (id.length() > 80) throw new IllegalArgumentException("请求无效。");
            String method = request.getString("method");
            switch (method) {
                case "getCapabilities": startSteps(); sendCapabilities(reply,id); return;
                case "openUsageSettings":
                    try { startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS,Uri.parse("package:"+getPackageName()))); }
                    catch (Exception e) { startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)); }
                    sendCapabilities(reply,id); return;
                case "openAppSettings":
                    startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getPackageName())));
                    sendCapabilities(reply,id); return;
                case "requestLocation":
                    if (locationAllowed()) { sendCapabilities(reply,id); return; }
                    if (pendingReply != null || geoCallback != null) throw new IllegalArgumentException("请先完成当前授权。");
                    pendingReply=reply; pendingId=id;
                    requestPermissions(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION,Manifest.permission.ACCESS_FINE_LOCATION},LOCATION); return;
                case "requestActivity":
                    if (activityAllowed()) { startSteps(); sendCapabilities(reply,id); return; }
                    if (pendingReply != null || geoCallback != null) throw new IllegalArgumentException("请先完成当前授权。");
                    pendingReply=reply; pendingId=id;
                    requestPermissions(new String[]{Manifest.permission.ACTIVITY_RECOGNITION},ACTIVITY); return;
                default: throw new IllegalArgumentException("不支持这项设备操作。");
            }
        } catch (Exception e) { respond(reply,id,null,e.getMessage() == null ? "设备功能暂不可用。" : e.getMessage()); }
    }
    private void sendCapabilities(JavaScriptReplyProxy reply,String id) {
        metricWorker.execute(() -> {
            try { respond(reply,id,capabilities(),null); }
            catch(Exception e) { respond(reply,id,null,"暂时无法读取设备状态。"); }
        });
    }
    private void respond(JavaScriptReplyProxy reply,String id,JSONObject data,String error) {
        try { JSONObject result = new JSONObject().put("id",id).put("ok",error == null);
            if (error == null) result.put("data",data); else result.put("error",error);
            runOnUiThread(() -> {
                if (!isDestroyed() && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
                    try { reply.postMessage(result.toString()); } catch(Exception ignored) { }
                }
            });
        } catch (Exception ignored) { }
    }
    private JSONObject capabilities() throws Exception {
        boolean usagePermission = usageAllowed();
        if(!usagePermission){usageCacheAt=0;usageCache=null;}
        JSONObject usage=usagePermission ? screenMetrics() : emptyUsage("permission_required","usage_permission_missing");
        usage.put("permission",usagePermission?"granted":"denied");
        StepSessionAccumulator.Snapshot steps=stepSession.snapshot();
        boolean movementAllowed=activityAllowed();
        String stepStatus=!movementAllowed?"permission_required":counter==null&&detector==null?"unsupported":
            !resumed?"paused":!listenerRegistered?"registration_failed":steps.segmentHasReading?"available":"waiting_for_sensor";
        String stepReason="available".equals(stepStatus)?"foreground_steps_observed":
            "permission_required".equals(stepStatus)?"activity_permission_missing":
            "unsupported".equals(stepStatus)?"no_step_sensor":
            "waiting_for_sensor".equals(stepStatus)?"awaiting_first_event":
            "paused".equals(stepStatus)?"app_background":stepRegistrationReason;
        Sensor selected=activeStepSensor;
        String stepSource=selected==null?"none":selected.getType()==Sensor.TYPE_STEP_COUNTER?"step-counter":"step-detector";
        return new JSONObject().put("platform","android").put("appVersion","0.3.0-preview").put("apiLevel",Build.VERSION.SDK_INT)
            .put("location",new JSONObject().put("permission",locationAllowed()?"granted":"denied"))
            .put("usage",usage)
            .put("steps",new JSONObject().put("permission",movementAllowed?"granted":"denied").put("available",counter!=null||detector!=null)
                .put("status",stepStatus).put("reason",stepReason)
                .put("sessionSteps",nullable(steps.steps)).put("source",stepSource)
                .put("counterAvailable",counter!=null).put("detectorAvailable",detector!=null)
                .put("listenerRegistered",listenerRegistered).put("lastSensorAt",nullable(steps.lastAt))
                .put("observedFrom",nullable(steps.firstAt)).put("eventsCount",steps.eventsCount)
                .put("scope","本次打开累计前台监测步数；不含后台及未接入的华为健康数据"))
            .put("health",new JSONObject().put("available",false).put("status","not_integrated").put("reason","not-connected"));
    }
    private static Object nullable(Object value) {return value==null?JSONObject.NULL:value;}
    private JSONObject emptyUsage(String status,String reason) throws Exception {
        return new JSONObject().put("status",status).put("reason",reason)
            .put("screenMinutesToday",JSONObject.NULL).put("observedMinutes",JSONObject.NULL)
            .put("windowStart",JSONObject.NULL).put("windowEnd",JSONObject.NULL).put("coveredMinutes",JSONObject.NULL)
            .put("source","android-screen-events").put("scope","当前安卓环境的亮屏事件；非连续看屏或鸿蒙全机统计");
    }
    /** Screen-interactive events, not sum of application foreground times (which may overlap). */
    private JSONObject screenMetrics() throws Exception {
        try {
            long end = System.currentTimeMillis();
            long generation=usageGeneration.get();
            Calendar c=Calendar.getInstance(); c.set(Calendar.HOUR_OF_DAY,0);c.set(Calendar.MINUTE,0);c.set(Calendar.SECOND,0);c.set(Calendar.MILLISECOND,0);
            long start=c.getTimeInMillis();
            if(usageCache!=null&&usageCacheGeneration==generation&&usageCacheDay==start&&end>=usageCacheAt&&end-usageCacheAt<5000)
                return new JSONObject(usageCache.toString());
            UsageStatsManager manager=(UsageStatsManager)getSystemService(USAGE_STATS_SERVICE);
            if(manager==null)return emptyUsage("error","query_unavailable");
            // A monotonic current-boot boundary also protects API 28, which lacks reboot events.
            long bootAt=end-SystemClock.elapsedRealtime();
            UsageEvents events=manager.queryEvents(Math.max(start-7L*86400000,bootAt),end);
            if(events==null)return emptyUsage("error","query_unavailable");
            UsageEvents.Event event=new UsageEvents.Event();
            ScreenTimeAccumulator accumulator = new ScreenTimeAccumulator(start,end);
            if(bootAt>start)accumulator.accept(bootAt,ScreenTimeAccumulator.Kind.RESTART);
            while(events.hasNextEvent()) {
                events.getNextEvent(event);
                int type=event.getEventType();
                if(type==UsageEvents.Event.DEVICE_SHUTDOWN||type==UsageEvents.Event.DEVICE_STARTUP)
                    accumulator.accept(event.getTimeStamp(),ScreenTimeAccumulator.Kind.RESTART);
                else if(type==UsageEvents.Event.SCREEN_INTERACTIVE)
                    accumulator.accept(event.getTimeStamp(),ScreenTimeAccumulator.Kind.ON);
                else if(type==UsageEvents.Event.SCREEN_NON_INTERACTIVE)
                    accumulator.accept(event.getTimeStamp(),ScreenTimeAccumulator.Kind.OFF);
            }
            ScreenTimeAccumulator.Result result=accumulator.result();
            JSONObject data=emptyUsage(result.status,result.reason)
                .put("screenMinutesToday",nullable(result.fullDayMinutes)).put("observedMinutes",nullable(result.observedMinutes))
                .put("windowStart",nullable(result.windowStart)).put("windowEnd",nullable(result.windowEnd))
                .put("coveredMinutes",nullable(result.coveredMinutes));
            usageCache=new JSONObject(data.toString());usageCacheDay=start;usageCacheAt=end;usageCacheGeneration=generation;
            return data;
        }catch(SecurityException ignored){return emptyUsage("error","query_unavailable");}
        catch(Exception ignored){return emptyUsage("error","query_failed");}
    }
    private void startSteps() {
        if(!resumed)return;
        if(!activityAllowed()) {stopSteps();stepRegistrationReason="activity_permission_missing";return;}
        if(listenerRegistered)return;
        // Some compatibility environments reveal sensors only after permission is granted.
        discoverStepSensors();
        if(sensors==null||counter==null&&detector==null){stepRegistrationReason="no_step_sensor";return;}
        if(registerStepSensor(counter,StepSessionAccumulator.Mode.COUNTER))return;
        if(registerStepSensor(detector,StepSessionAccumulator.Mode.DETECTOR))return;
        stepRegistrationReason="sensor_registration_failed";
    }
    private void discoverStepSensors() {
        if(sensors==null)return;
        try {if(counter==null)counter=sensors.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);}
        catch(RuntimeException ignored) { /* Keep unavailable until a later authorized refresh. */ }
        try {if(detector==null)detector=sensors.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR);}
        catch(RuntimeException ignored) { /* Permission and sensor availability remain separate. */ }
    }
    private boolean registerStepSensor(Sensor sensor,StepSessionAccumulator.Mode mode) {
        if(sensor==null)return false;
        try {
            long started=SystemClock.elapsedRealtimeNanos();
            if(!sensors.registerListener(this,sensor,SensorManager.SENSOR_DELAY_NORMAL))return false;
            stepSession.start(mode,started);activeStepSensor=sensor;listenerRegistered=true;
            stepRegistrationReason="awaiting_first_event";return true;
        }catch(RuntimeException ignored){return false;}
    }
    private void stopSteps() {
        if(sensors!=null)sensors.unregisterListener(this);
        listenerRegistered=false;stepSession.pause();
    }
    @Override public void onSensorChanged(SensorEvent event) {
        if(!resumed||!listenerRegistered||event.sensor!=activeStepSensor||event.values.length==0)return;
        long nowNanos=SystemClock.elapsedRealtimeNanos();
        if(event.timestamp>nowNanos)return;
        long eventAt=System.currentTimeMillis()-(nowNanos-event.timestamp)/1000000;
        stepSession.accept(event.values[0],event.timestamp,eventAt);
    }
    @Override public void onAccuracyChanged(Sensor sensor,int accuracy) { }
    @Override protected void onResume(){
        super.onResume();resumed=true;usageGeneration.incrementAndGet();
        if(web!=null){
            web.onResume();
            if(trusted(Uri.parse(web.getUrl()==null?"":web.getUrl())))
                web.evaluateJavascript("window.dispatchEvent(new Event('shichen-native-resume'))",null);
        }
        startSteps();
    }
    @Override protected void onPause(){resumed=false;stopSteps();if(web!=null)web.onPause();super.onPause();}
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] grants){
        super.onRequestPermissionsResult(request,permissions,grants);
        if(request==LOCATION)clearGeolocation(locationAllowed());
        if(request==ACTIVITY)startSteps();
        if(pendingReply!=null){JavaScriptReplyProxy reply=pendingReply;String id=pendingId;pendingReply=null;pendingId=null;sendCapabilities(reply,id);}
    }
    private void clearGeolocation(boolean granted){
        if(geoCallback!=null){geoCallback.invoke(geoOrigin,granted,false);geoCallback=null;geoOrigin=null;}
    }
    @Override public void onBackPressed(){
        if(web.canGoBack())web.goBack();else super.onBackPressed();
    }
    @Override protected void onDestroy(){clearGeolocation(false);metricWorker.shutdownNow();stopSteps();if(web!=null)web.destroy();super.onDestroy();}
}

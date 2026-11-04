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
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.speech.RecognizerIntent;
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
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;

/** Android shell: trusted-origin web UI, optional on-device capabilities, no API keys. */
public final class MainActivity extends Activity implements SensorEventListener {
    static final String ORIGIN = "https://shichen-wellness.pages.dev";
    static final String START_URL = ORIGIN + "/?mode=app";
    private static final int LOCATION = 41, ACTIVITY = 42, SPEECH = 43;
    private WebView web;
    private LinearLayout errorView;
    private ProgressBar progress;
    private SensorManager sensors;
    private volatile Sensor counter, detector;
    private volatile Sensor activeStepSensor;
    private volatile boolean resumed, listenerRegistered;
    private volatile boolean stepFallbackAttempted;
    private volatile String stepFallbackReason;
    private volatile Long stepListenerRegisteredAt;
    private volatile String stepRegistrationReason="paused";
    private final StepSessionAccumulator stepSession = new StepSessionAccumulator();
    private final Handler stepHandler = new Handler(Looper.getMainLooper());
    private final Runnable stepWatchdog = new Runnable() {
        @Override public void run() {
            if(!resumed)return;
            if(!activityAllowed()){stopSteps();stepRegistrationReason="activity_permission_missing";return;}
            tryDetectorFallback();
            scheduleStepWatchdog();
        }
    };
    private final ExecutorService metricWorker = Executors.newSingleThreadExecutor();
    private final AtomicLong usageGeneration = new AtomicLong();
    private long usageCacheAt = 0, usageCacheDay = -1;
    private long usageCacheGeneration=-1;
    private JSONObject usageCache;
    private JavaScriptReplyProxy pendingReply;
    private String pendingId;
    private boolean permissionRequestInFlight, speechInFlight;
    private JavaScriptReplyProxy pendingSpeechReply;
    private String pendingSpeechId;
    private long documentGeneration, pendingSpeechGeneration;
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
        ws.setUserAgentString(ws.getUserAgentString() + " ShichenWellness/0.5.0");
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
                if (NativeActionPolicy.isVersionedApk(uri.toString())) {
                    if (request.isForMainFrame() && request.hasGesture()) openExternal(uri);
                    return true;
                }
                if (trusted(uri)) return false;
                if (request.isForMainFrame() && request.hasGesture()) openExternal(uri);
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                documentGeneration++;
                // An OS activity may outlive its document; never deliver its result to a new page.
                pendingReply=null; pendingId=null;
                pendingSpeechReply=null; pendingSpeechId=null;
                clearGeolocation(false);
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
        web.setDownloadListener((url, userAgent, disposition, mimeType, length) -> {
            if (currentDocumentTrusted() && NativeActionPolicy.isVersionedApk(url)) openExternal(Uri.parse(url));
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView v, int value) { progress.setProgress(value); }
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (!trusted(Uri.parse(origin))) { callback.invoke(origin,false,false); return; }
                if (locationAllowed()) { callback.invoke(origin,true,false); return; }
                if (permissionRequestInFlight || speechInFlight || geoCallback != null) { callback.invoke(origin,false,false); return; }
                geoCallback = callback; geoOrigin = origin;
                permissionRequestInFlight=true;
                try { requestPermissions(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION,Manifest.permission.ACCESS_FINE_LOCATION}, LOCATION); }
                catch (RuntimeException ignored) { permissionRequestInFlight=false; clearGeolocation(false); }
            }
            @Override public void onGeolocationPermissionsHidePrompt() { clearGeolocation(false); }
        });
        web.loadUrl(START_URL);
    }

    private static boolean trusted(Uri uri) {
        return "https".equals(uri.getScheme()) && "shichen-wellness.pages.dev".equals(uri.getHost())
            && (uri.getPort() == -1 || uri.getPort() == 443) && uri.getUserInfo() == null;
    }
    private boolean currentDocumentTrusted() {
        return web!=null && trusted(Uri.parse(web.getUrl()==null?"":web.getUrl()));
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
                case "startSpeechRecognition": startSpeechRecognition(reply,id); return;
                case "openUsageSettings":
                    ensureNoActivePrompt();
                    try { startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS,Uri.parse("package:"+getPackageName()))); }
                    catch (Exception e) { startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)); }
                    sendCapabilities(reply,id); return;
                case "openAppSettings":
                    ensureNoActivePrompt();
                    startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getPackageName())));
                    sendCapabilities(reply,id); return;
                case "requestLocation":
                    if (locationAllowed()) { sendCapabilities(reply,id); return; }
                    requestDevicePermission(reply,id,new String[]{Manifest.permission.ACCESS_COARSE_LOCATION,Manifest.permission.ACCESS_FINE_LOCATION},LOCATION); return;
                case "requestActivity":
                    if (activityAllowed()) {
                        ensureNoActivePrompt();
                        if(!resumed)throw new IllegalArgumentException("请回到应用前台后重试计步。");
                        stopSteps();startSteps();sendCapabilities(reply,id,activityFeedback());return;
                    }
                    requestDevicePermission(reply,id,new String[]{Manifest.permission.ACTIVITY_RECOGNITION},ACTIVITY); return;
                default: throw new IllegalArgumentException("不支持这项设备操作。");
            }
        } catch (Exception e) { respond(reply,id,null,e.getMessage() == null ? "设备功能暂不可用。" : e.getMessage()); }
    }
    private void ensureNoActivePrompt() {
        if (permissionRequestInFlight || speechInFlight || geoCallback!=null)
            throw new IllegalArgumentException("请先完成或取消当前系统操作。");
    }
    private void requestDevicePermission(JavaScriptReplyProxy reply,String id,String[] permissions,int code) {
        ensureNoActivePrompt();
        pendingReply=reply; pendingId=id; permissionRequestInFlight=true;
        try { requestPermissions(permissions,code); }
        catch (RuntimeException e) { pendingReply=null;pendingId=null;permissionRequestInFlight=false;throw e; }
    }
    private Intent speechIntent() {
        return new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE,"zh-CN")
            .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS,1)
            .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE,true)
            .putExtra(RecognizerIntent.EXTRA_PROMPT,"说说你现在的状态");
    }
    private boolean speechAvailable() {
        try { return speechIntent().resolveActivity(getPackageManager())!=null; }
        catch (RuntimeException ignored) { return false; }
    }
    private void startSpeechRecognition(JavaScriptReplyProxy reply,String id) {
        ensureNoActivePrompt();
        if (!resumed) throw new IllegalArgumentException("请回到应用前台后再使用语音输入。");
        if (!speechAvailable()) throw new IllegalArgumentException("当前环境没有可用的系统语音识别服务，请使用输入法的麦克风输入。");
        pendingSpeechReply=reply;pendingSpeechId=id;pendingSpeechGeneration=documentGeneration;speechInFlight=true;
        try { startActivityForResult(speechIntent(),SPEECH); }
        catch (RuntimeException e) {
            clearSpeech();
            throw new IllegalArgumentException("无法打开系统语音识别，请使用输入法的麦克风输入。");
        }
    }
    private void clearSpeech() {
        pendingSpeechReply=null;pendingSpeechId=null;speechInFlight=false;
    }
    @Override protected void onActivityResult(int request,int result,Intent data) {
        super.onActivityResult(request,result,data);
        if (request!=SPEECH) return;
        JavaScriptReplyProxy reply=pendingSpeechReply;String id=pendingSpeechId;long generation=pendingSpeechGeneration;
        clearSpeech();
        if (reply==null || generation!=documentGeneration || !currentDocumentTrusted()) return;
        try {
            if (result==RESULT_CANCELED) { respond(reply,id,new JSONObject().put("cancelled",true),null,generation);return; }
            if (result!=RESULT_OK) { respond(reply,id,null,"语音识别未完成，请重试或使用键盘输入。",generation);return; }
            ArrayList<String> matches=data==null?null:data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            String text=NativeActionPolicy.speechText(matches==null||matches.isEmpty()?null:matches.get(0));
            if (text.isEmpty()) { respond(reply,id,null,"没有识别到文字，请重试或使用键盘输入。",generation);return; }
            respond(reply,id,new JSONObject().put("text",text),null,generation);
        } catch (Exception ignored) { respond(reply,id,null,"暂时无法读取语音结果，请重试。",generation); }
    }
    private void sendCapabilities(JavaScriptReplyProxy reply,String id) {
        sendCapabilities(reply,id,null);
    }
    private void sendCapabilities(JavaScriptReplyProxy reply,String id,JSONObject feedback) {
        long generation=documentGeneration;
        metricWorker.execute(() -> {
            try {
                JSONObject data=capabilities();
                if(feedback!=null)data.put("actionFeedback",feedback);
                respond(reply,id,data,null,generation);
            }
            catch(Exception e) { respond(reply,id,null,"暂时无法读取设备状态。",generation); }
        });
    }
    private void respond(JavaScriptReplyProxy reply,String id,JSONObject data,String error) {
        respond(reply,id,data,error,documentGeneration);
    }
    private void respond(JavaScriptReplyProxy reply,String id,JSONObject data,String error,long generation) {
        try { JSONObject result = new JSONObject().put("id",id).put("ok",error == null);
            if (error == null) result.put("data",data); else result.put("error",error);
            runOnUiThread(() -> {
                if (isDestroyed() || generation!=documentGeneration || !currentDocumentTrusted()) return;
                if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
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
        StepSessionAccumulator.Observation stepObservation=stepSession.observation(SystemClock.elapsedRealtimeNanos());
        boolean movementAllowed=activityAllowed();
        String stepStatus=!movementAllowed?"permission_required":counter==null&&detector==null?"unsupported":
            !resumed?"paused":!listenerRegistered?"registration_failed":stepObservation.status;
        String stepReason="available".equals(stepStatus)?"foreground_steps_observed":
            "permission_required".equals(stepStatus)?"activity_permission_missing":
            "unsupported".equals(stepStatus)?"no_step_sensor":
            "paused".equals(stepStatus)?"app_background":
            listenerRegistered?stepObservation.reason:stepRegistrationReason;
        Sensor selected=activeStepSensor;
        String stepSource=selected==null?"none":selected.getType()==Sensor.TYPE_STEP_COUNTER?"step-counter":"step-detector";
        boolean voiceAvailable=speechAvailable();
        return new JSONObject().put("platform","android").put("appVersion","0.5.0-preview").put("versionCode",5).put("apiLevel",Build.VERSION.SDK_INT)
            .put("speech",new JSONObject().put("available",voiceAvailable).put("status",voiceAvailable?"available":"unsupported")
                .put("source","system-recognition-activity").put("language","zh-CN")
                .put("preferOffline",true).put("offlineGuaranteed",false))
            .put("location",new JSONObject().put("permission",locationAllowed()?"granted":"denied"))
            .put("usage",usage)
            .put("steps",new JSONObject().put("permission",movementAllowed?"granted":"denied").put("available",counter!=null||detector!=null)
                .put("status",stepStatus).put("reason",stepReason)
                .put("sessionSteps",nullable(steps.steps)).put("source",stepSource)
                .put("counterAvailable",counter!=null).put("detectorAvailable",detector!=null)
                .put("listenerRegistered",listenerRegistered).put("lastSensorAt",nullable(steps.lastAt))
                .put("observedFrom",nullable(steps.firstAt)).put("eventsCount",steps.eventsCount)
                .put("baselineEstablished",steps.baselineEstablished).put("segmentHasIncrement",steps.segmentHasIncrement)
                .put("lastIncrementAt",nullable(steps.lastIncrementAt)).put("listenerRegisteredAt",nullable(stepListenerRegisteredAt))
                .put("fallbackAttempted",stepFallbackAttempted).put("fallbackReason",nullable(stepFallbackReason))
                .put("observationTimeoutSeconds",StepSessionAccumulator.OBSERVATION_TIMEOUT_NANOS/1_000_000_000L)
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
        stepFallbackAttempted=false;stepFallbackReason=null;
        // Some compatibility environments reveal sensors only after permission is granted.
        discoverStepSensors();
        if(sensors==null||counter==null&&detector==null){stepRegistrationReason="no_step_sensor";return;}
        if(registerStepSensor(counter,StepSessionAccumulator.Mode.COUNTER))return;
        if(counter!=null&&detector!=null){stepFallbackAttempted=true;stepFallbackReason="counter_registration_failed";}
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
            stepListenerRegisteredAt=System.currentTimeMillis();
            scheduleStepWatchdog();
            stepRegistrationReason="awaiting_first_event";return true;
        }catch(RuntimeException ignored){return false;}
    }
    private void stopSteps() {
        stepHandler.removeCallbacks(stepWatchdog);
        if(sensors!=null)try{sensors.unregisterListener(this);}catch(RuntimeException ignored){ }
        listenerRegistered=false;activeStepSensor=null;stepListenerRegisteredAt=null;stepSession.pause();
    }
    private void scheduleStepWatchdog() {
        stepHandler.removeCallbacks(stepWatchdog);
        if(resumed&&listenerRegistered)stepHandler.postDelayed(stepWatchdog,5000);
    }
    private void tryDetectorFallback() {
        if(!resumed||!listenerRegistered||activeStepSensor!=counter||stepFallbackAttempted)return;
        // Sensor discovery can change after a permission grant in compatibility environments.
        discoverStepSensors();
        if(detector==null)return;
        String reason=stepSession.detectorFallbackReason(SystemClock.elapsedRealtimeNanos());
        if(reason==null)return;
        stepFallbackAttempted=true;stepFallbackReason=reason;
        // Never listen to both streams together. A new monotonic boundary rejects
        // queued readings from the retired stream; already counted steps remain.
        stopSteps();
        if(registerStepSensor(detector,StepSessionAccumulator.Mode.DETECTOR))return;
        if(registerStepSensor(counter,StepSessionAccumulator.Mode.COUNTER))return;
        stepRegistrationReason="sensor_registration_failed";
    }
    private JSONObject activityFeedback() throws Exception {
        if(!activityAllowed())return new JSONObject().put("action","retry_activity").put("status","unavailable")
            .put("message","尚未授予活动权限，可在应用权限设置中检查；聊天功能仍可使用。");
        if(!resumed)return new JSONObject().put("action","retry_activity").put("status","unavailable")
            .put("message","活动权限已开启；回到应用前台后会开始监听，也可点击重新检测计步。");
        if(counter==null&&detector==null)return new JSONObject().put("action","retry_activity").put("status","unavailable")
            .put("message","已重新检测，但当前安卓环境未提供步数传感器；这不能说明鸿蒙宿主没有计步功能。");
        if(!listenerRegistered)return new JSONObject().put("action","retry_activity").put("status","failed")
            .put("message","活动权限已开启，但本次无法注册计步监听；可管理应用权限或稍后重试。");
        return new JSONObject().put("action","retry_activity").put("status","restarted")
            .put("message","已重新启动前台计步监听，并保留此前已观测的步数。请保持应用在前台，在安全位置正常走动后查看；"
                +(activeStepSensor==counter?"计数器首次读数仅用于建立基线。":"检测器每个有效事件记为一步。"));
    }
    @Override public void onSensorChanged(SensorEvent event) {
        if(!resumed||!listenerRegistered||event.sensor!=activeStepSensor||event.values.length==0)return;
        long nowNanos=SystemClock.elapsedRealtimeNanos();
        if(event.timestamp>nowNanos)return;
        long eventAt=System.currentTimeMillis()-(nowNanos-event.timestamp)/1000000;
        stepSession.accept(event.sensor.getType()==Sensor.TYPE_STEP_COUNTER?StepSessionAccumulator.Mode.COUNTER:StepSessionAccumulator.Mode.DETECTOR,event.values[0],event.timestamp,eventAt);
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
        if(request!=LOCATION && request!=ACTIVITY)return;
        permissionRequestInFlight=false;
        if(request==LOCATION)clearGeolocation(locationAllowed());
        if(request==ACTIVITY)startSteps();
        if(pendingReply!=null){
            JavaScriptReplyProxy reply=pendingReply;String id=pendingId;pendingReply=null;pendingId=null;
            try{sendCapabilities(reply,id,request==ACTIVITY?activityFeedback():null);}
            catch(Exception ignored){respond(reply,id,null,"权限操作已结束，请刷新设备状态。");}
        }
    }
    private void clearGeolocation(boolean granted){
        if(geoCallback!=null){geoCallback.invoke(geoOrigin,granted,false);geoCallback=null;geoOrigin=null;}
    }
    @Override public void onBackPressed(){
        if(web.canGoBack())web.goBack();else super.onBackPressed();
    }
    @Override protected void onDestroy(){
        documentGeneration++;clearSpeech();pendingReply=null;pendingId=null;permissionRequestInFlight=false;
        clearGeolocation(false);metricWorker.shutdownNow();stopSteps();if(web!=null)web.destroy();super.onDestroy();
    }
}

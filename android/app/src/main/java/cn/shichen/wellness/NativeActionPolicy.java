package cn.shichen.wellness;

import java.net.URI;

/** Small allowlists for data returned from or opened by external system activities. */
final class NativeActionPolicy {
    private NativeActionPolicy() { }

    static boolean isEmergencyDial(String url, boolean mainFrame, boolean userGesture) {
        return mainFrame && userGesture && "tel:120".equals(url);
    }

    static boolean isVersionedApk(String url) {
        if (url==null) return false;
        try {
            URI uri=new URI(url);
            return "https".equals(uri.getScheme()) && "shichen-wellness.pages.dev".equals(uri.getHost())
                && (uri.getPort()==-1 || uri.getPort()==443) && uri.getRawUserInfo()==null
                && uri.getRawQuery()==null && uri.getRawFragment()==null
                && uri.getRawPath()!=null
                && uri.getRawPath().matches("/download/shichen-wellness-[0-9]+\\.[0-9]+\\.[0-9]+(?:-preview)?\\.apk");
        } catch (Exception ignored) { return false; }
    }

    static String speechText(String value) {
        if (value==null) return "";
        String text=value.trim();
        int end=Math.min(text.length(),1200);
        // Do not leave an unpaired surrogate when shortening recognition output.
        if (end<text.length() && end>0 && Character.isHighSurrogate(text.charAt(end-1))) end--;
        return text.substring(0,end);
    }
}

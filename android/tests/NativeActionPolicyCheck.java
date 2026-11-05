package cn.shichen.wellness;

public final class NativeActionPolicyCheck {
    private static int checks;
    private static void check(Object actual,Object expected,String name) {
        checks++;
        if (!java.util.Objects.equals(actual,expected)) throw new AssertionError(name+": "+actual+" != "+expected);
    }
    public static void main(String[] args) {
        check(NativeActionPolicy.isEmergencyDial("tel:120",true,true),true,"explicit user tap opens dialer");
        check(NativeActionPolicy.isEmergencyDial("tel:120",false,true),false,"no iframe dialing");
        check(NativeActionPolicy.isEmergencyDial("tel:120",true,false),false,"no automatic dialing");
        for (String url:new String[]{null,"tel:121","tel:120?x=1","tel:120#x","tel:%31%32%30","TEL:120","https://example.com/tel:120"})
            check(NativeActionPolicy.isEmergencyDial(url,true,true),false,"reject altered dial link");
        String path="/download/shichen-wellness-0.4.0-preview.apk";
        check(NativeActionPolicy.isVersionedApk("https://shichen-wellness.pages.dev"+path),true,"current release download");
        check(NativeActionPolicy.isVersionedApk("https://shichen-wellness.pages.dev/download/shichen-wellness-1.0.0.apk"),true,"1.0 versioned download retains strict host allowlist");
        check(NativeActionPolicy.isVersionedApk("https://shichen-wellness.pages.dev:443/download/shichen-wellness-10.12.3-preview.apk"),true,"future version and standard HTTPS port");
        String[] rejected={null,"", "https://evil.example"+path,
            "http://shichen-wellness.pages.dev"+path,"https://shichen-wellness.pages.dev:8443"+path,
            "https://shichen-wellness.pages.dev.evil.example"+path,
            "https://evil.example@shichen-wellness.pages.dev"+path,
            "https://shichen-wellness.pages.dev/download/../download/shichen-wellness-0.4.0-preview.apk",
            "https://shichen-wellness.pages.dev/download/%73hichen-wellness-0.4.0-preview.apk",
            "https://shichen-wellness.pages.dev/download/unrelated.apk",
            "https://shichen-wellness.pages.dev"+path+"?redirect=https://evil.example",
            "https://shichen-wellness.pages.dev"+path+"#fragment",
            "https://shichen-wellness.pages.dev"+path+"/other.apk",
            "javascript:alert(1)","file:///download/shichen-wellness-0.4.0-preview.apk"};
        for (String url:rejected) check(NativeActionPolicy.isVersionedApk(url),false,"reject unsafe download: "+url);
        check(NativeActionPolicy.speechText(null),"","no recognition result");
        check(NativeActionPolicy.speechText("   \n"),"","blank recognition result");
        check(NativeActionPolicy.speechText("  刚吃过午饭  "),"刚吃过午饭","Chinese text retained");
        check(NativeActionPolicy.speechText("字".repeat(1300)).length(),1200,"recognition output capped");
        String emojiAtBoundary="字".repeat(1199)+"\uD83C\uDF3F"+"字";
        check(NativeActionPolicy.speechText(emojiAtBoundary).length(),1199,"no split surrogate at cap");
        System.out.println(checks+" native action policy checks passed");
    }
}

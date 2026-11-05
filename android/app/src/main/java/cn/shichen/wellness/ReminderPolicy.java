package cn.shichen.wellness;

import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;

/** Deterministic local schedule rules, independent of Android or health data. */
final class ReminderPolicy {
    static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    static final int MAX_ROUTINE_REMINDERS=18;
    static final long MAX_LATENESS_MS=2*60*60*1000L;
    static boolean deliverable(long expected,long now,long delivered){return expected>0&&expected<=now&&now-expected<=MAX_LATENESS_MS&&delivered<expected;}
    static long restoreTime(String time,long now,long registered,long delivered){
        // Reopening the app must not postpone a registered-but-not-yet-delivered
        // reminder to tomorrow. A short system delay can still be delivered once.
        if(registered>0&&delivered<registered&&(registered>now||now-registered<=MAX_LATENESS_MS))return registered;
        return next(time,now);
    }
    static void checkRoutineCount(int count) {
        if(count<0||count>MAX_ROUTINE_REMINDERS)throw new IllegalArgumentException("日常自动提醒每天最多18个时点。");
    }
    static String mode(String value) {
        if (!"personal".equals(value) && !"competition".equals(value)) throw new IllegalArgumentException("提醒模式无效。");
        return value;
    }
    static String kind(String value) {
        if (!"card".equals(value) && !"medicine".equals(value)) throw new IllegalArgumentException("提醒类别无效。");
        return value;
    }
    static String id(String value) {
        if (value == null || value.isEmpty() || value.length()>160 || value.chars().anyMatch(c -> c<32 || c==127))
            throw new IllegalArgumentException("提醒标识无效。");
        return value;
    }
    static LocalTime time(String value) {
        if (value == null || !value.matches("(?:[01][0-9]|2[0-3]):[0-5][0-9]")) throw new IllegalArgumentException("提醒时间应为 HH:mm。");
        return LocalTime.parse(value);
    }
    static boolean quiet(LocalTime time) { return time.getHour()>=23 || time.getHour()<5; }
    static boolean eligible(String kind, LocalTime time, boolean nightMedicine) {
        return !quiet(time) || ("medicine".equals(kind) && nightMedicine);
    }
    static boolean mayDeliver(String kind,long at,boolean nightMedicine,boolean test) {
        return test || eligible(kind,Instant.ofEpochMilli(at).atZone(ZONE).toLocalTime(),nightMedicine);
    }
    static long next(String time,long now) {
        ZonedDateTime current=Instant.ofEpochMilli(now).atZone(ZONE);
        ZonedDateTime target=current.toLocalDate().atTime(time(time)).atZone(ZONE);
        if(!target.toInstant().isAfter(current.toInstant()))target=target.plusDays(1);
        return target.toInstant().toEpochMilli();
    }
}

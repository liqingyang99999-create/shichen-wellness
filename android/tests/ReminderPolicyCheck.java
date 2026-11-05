package cn.shichen.wellness;

import java.time.Instant;
import java.time.LocalTime;

public final class ReminderPolicyCheck {
    private static int checks;
    private static void equal(Object actual,Object expected,String name){checks++;if(!java.util.Objects.equals(actual,expected))throw new AssertionError(name+": "+actual+" != "+expected);}
    private static void rejects(Runnable action,String name){checks++;try{action.run();}catch(IllegalArgumentException expected){return;}throw new AssertionError(name);}
    public static void main(String[] args){
        long due=Instant.parse("2026-11-05T07:00:00Z").toEpochMilli();
        equal(ReminderPolicy.restoreTime("15:00",due+30000,due,0),due,"resume preserves delayed reminder rather than skipping tomorrow");
        equal(ReminderPolicy.restoreTime("15:00",due+30000,due,due),due+86400000,"delivered reminder rolls forward");
        equal(ReminderPolicy.restoreTime("15:00",due+ReminderPolicy.MAX_LATENESS_MS+1,due,0),due+86400000,"stale reminders not replayed");
        equal(ReminderPolicy.restoreTime("15:00",due-30000,due,0),due,"future registered deadline stable on reopen");
        equal(ReminderPolicy.deliverable(due,due,0),true,"due delivery accepted");
        equal(ReminderPolicy.deliverable(due,due-1,0),false,"never early");
        equal(ReminderPolicy.deliverable(due,due+1,due),false,"no duplicate");
        equal(ReminderPolicy.deliverable(due,due+ReminderPolicy.MAX_LATENESS_MS+1,0),false,"no overdue replay");
        ReminderPolicy.checkRoutineCount(18);equal(ReminderPolicy.MAX_ROUTINE_REMINDERS,18,"18 routine times accepted");
        rejects(()->ReminderPolicy.checkRoutineCount(19),"19 routine times rejected");
        rejects(()->ReminderPolicy.checkRoutineCount(-1),"invalid negative count");
        equal(ReminderPolicy.mode("personal"),"personal","personal mode");equal(ReminderPolicy.mode("competition"),"competition","competition mode");
        for(String value:new String[]{null,"","daily","personal&mode=competition"})rejects(()->ReminderPolicy.mode(value),"invalid mode");
        for(String value:new String[]{"card","medicine"})equal(ReminderPolicy.kind(value),value,"valid kind");
        for(String value:new String[]{null,"sleep","medication"})rejects(()->ReminderPolicy.kind(value),"unknown kind");
        for(String value:new String[]{null,"","a\nsecret","x".repeat(161)})rejects(()->ReminderPolicy.id(value),"bad id");
        equal(ReminderPolicy.id("personal-med-abc:08:00"),"personal-med-abc:08:00","opaque id");
        for(String value:new String[]{"24:00","9:00","08:60","08:00:00","08:00\n",null})rejects(()->ReminderPolicy.time(value),"invalid HH:mm");
        for(String value:new String[]{"00:00","04:59","23:00","23:59"}){
            equal(ReminderPolicy.quiet(LocalTime.parse(value)),true,"night "+value);
            equal(ReminderPolicy.eligible("card",LocalTime.parse(value),true),false,"cards never at night");
            equal(ReminderPolicy.eligible("medicine",LocalTime.parse(value),false),false,"night medicine default off");
            equal(ReminderPolicy.eligible("medicine",LocalTime.parse(value),true),true,"explicit night medicine opt in");
        }
        for(String value:new String[]{"05:00","07:00","12:00","22:59"})equal(ReminderPolicy.eligible("card",LocalTime.parse(value),false),true,"daytime "+value);
        long now=Instant.parse("2026-11-05T00:00:00Z").toEpochMilli();
        equal(ReminderPolicy.next("09:00",now),Instant.parse("2026-11-05T01:00:00Z").toEpochMilli(),"next today Shanghai");
        equal(ReminderPolicy.next("08:00",now),Instant.parse("2026-11-06T00:00:00Z").toEpochMilli(),"exact now does not duplicate");
        equal(ReminderPolicy.next("07:00",now),Instant.parse("2026-11-05T23:00:00Z").toEpochMilli(),"past time next day no time rewriting");
        long night=Instant.parse("2026-11-05T15:01:00Z").toEpochMilli();
        equal(ReminderPolicy.mayDeliver("card",night,false,false),false,"late delivery quiet check");
        equal(ReminderPolicy.mayDeliver("medicine",night,false,false),false,"night medication not shifted");
        equal(ReminderPolicy.mayDeliver("medicine",night,true,false),true,"opted silent medicine");
        equal(ReminderPolicy.mayDeliver("card",night,false,true),true,"explicit test exception");
        long boundary=Instant.parse("2026-11-04T21:00:00Z").toEpochMilli();
        equal(ReminderPolicy.mayDeliver("card",boundary,false,false),true,"05 boundary eligible");
        System.out.println("ReminderPolicy: "+checks+" checks passed");
    }
}

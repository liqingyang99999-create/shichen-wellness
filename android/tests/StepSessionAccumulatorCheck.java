package cn.shichen.wellness;
import static cn.shichen.wellness.StepSessionAccumulator.Mode.*;
public class StepSessionAccumulatorCheck {
    static int checks;
    static void check(Object actual,Object expected,String name) {
        if(!java.util.Objects.equals(actual,expected))throw new AssertionError(name+": "+actual+" != "+expected);
        checks++;
    }
    public static void main(String[] args) {
        StepSessionAccumulator a=new StepSessionAccumulator();
        check(a.snapshot().steps,null,"no sensor event is unknown");
        a.start(COUNTER,100);a.accept(500,90,1000);
        check(a.snapshot().steps,null,"old cached event rejected");
        a.accept(503,110,1010);check(a.snapshot().steps,null,"first counter event is baseline only, not measured zero");
        check(a.snapshot().baselineEstablished,true,"baseline is separately observable");
        check(a.snapshot().segmentHasIncrement,false,"baseline does not prove an increment");
        check(a.observation(111).status,"baseline_only","baseline never reports available");
        a.accept(508,120,1020);check(a.snapshot().steps,5L,"counter delta counted");
        a.accept(508,120,1020);check(a.snapshot().eventsCount,2,"duplicate timestamp ignored");
        a.pause();a.accept(520,130,1030);check(a.snapshot().steps,5L,"paused event ignored");
        a.start(COUNTER,140);a.accept(550,150,1050);a.accept(553,160,1060);
        check(a.snapshot().steps,8L,"background steps excluded while foreground segments retained");
        a.accept(2,170,1070);a.accept(4,180,1080);
        check(a.snapshot().steps,10L,"counter reset starts fresh baseline");
        a.accept(Float.NaN,190,1090);a.accept(-1,200,1100);a.accept(Float.POSITIVE_INFINITY,210,1110);
        check(a.snapshot().steps,10L,"invalid readings never change count");
        check(a.snapshot().firstAt,1010L,"observation begins at valid first reading");
        check(a.snapshot().lastAt,1080L,"last reading reports accepted sensor time");
        check(a.snapshot().lastIncrementAt,1080L,"last positive increment is separately dated");
        a.pause();a.start(DETECTOR,220);check(a.snapshot().segmentHasReading,false,"resume awaits a new reading");
        a.accept(1,230,1130);a.accept(1,240,1140);check(a.snapshot().steps,12L,"detector counts real first step");
        a.accept(2,250,1150);check(a.snapshot().steps,12L,"unexpected detector value rejected");
        a=new StepSessionAccumulator();a.start(DETECTOR,0);a.accept(1,1,1);
        check(a.snapshot().steps,1L,"detector-only hardware counts first event");
        check(a.snapshot().baselineEstablished,false,"detector does not invent a counter baseline");
        check(a.observation(2).status,"available","first detector event is a genuine step");

        long wait=StepSessionAccumulator.OBSERVATION_TIMEOUT_NANOS;
        a=new StepSessionAccumulator();a.start(COUNTER,100);
        check(a.observation(100).status,"waiting_for_sensor","new listener waits for first event");
        check(a.detectorFallbackReason(100+wait-1),null,"counter is given the full observation window");
        check(a.observation(100+wait).status,"no_events","long silence describes absence of events");
        check(a.detectorFallbackReason(100+wait),"counter_no_events","silent counter can try available detector");
        a.accept(0,100+wait+1,2000);
        a.accept(0,100+wait+2,2001);
        check(a.snapshot().steps,null,"repeated zero counter values do not become measured zero");
        check(a.snapshot().eventsCount,2,"valid repeated baseline events still count as messages");
        check(a.observation(100+wait+3).status,"baseline_only","frequent baseline messages still await an increment");
        check(a.detectorFallbackReason(100+wait+3),"counter_no_increment","baseline-only fallback does not claim missing messages");
        a.accept(1,100+wait+4,2002);
        check(a.snapshot().steps,1L,"positive counter delta establishes measured steps");
        check(a.snapshot().segmentHasIncrement,true,"increment is distinguished from first baseline");
        check(a.detectorFallbackReason(100+3*wait),null,"once counter works, later stillness does not trigger fallback");
        check(a.observation(100+3*wait).reason,"sensor_no_recent_events","stillness reports observations, not sensor failure");
        check(a.snapshot().steps,1L,"old measured total is preserved during silence");
        a.pause();check(a.observation(100+3*wait).status,"paused","paused monitoring is explicit");

        // Sequential source switches never add a counter delta and detector events for the same interval.
        a=new StepSessionAccumulator();a.start(COUNTER,1000);
        a.accept(COUNTER,100,1001,3000);a.accept(COUNTER,103,1002,3001);
        a.pause();a.start(DETECTOR,2000);
        a.accept(COUNTER,110,2001,3002);
        check(a.snapshot().steps,3L,"late event from retired counter source is rejected");
        a.accept(DETECTOR,1,1999,3003);
        check(a.snapshot().steps,3L,"cached pre-switch detector event is rejected");
        a.accept(DETECTOR,1,2002,3004);
        check(a.snapshot().steps,4L,"fresh detector event adds exactly one step");
        a.accept(DETECTOR,1,2002,3004);
        check(a.snapshot().steps,4L,"duplicate detector callback is not double-counted");
        a.pause();a.start(COUNTER,3000);
        a.accept(DETECTOR,1,3001,3005);a.accept(COUNTER,140,2999,3006);
        check(a.snapshot().steps,4L,"return to preferred counter rejects old source and old timestamp");
        a.accept(COUNTER,150,3002,3007);
        check(a.snapshot().steps,4L,"counter restart keeps prior total without counting background gap");
        check(a.observation(3003).status,"baseline_only","restored counter needs its own increment");
        a.accept(COUNTER,152,3004,3008);
        check(a.snapshot().steps,6L,"later counter increment is added once after source restoration");
        a.accept(COUNTER,152.5f,3005,3009);
        check(a.snapshot().steps,6L,"fractional counter reading is rejected");
        check(a.snapshot().eventsCount,5,"ignored source and stale readings do not inflate event diagnostics");
        System.out.println(checks+" step session checks passed");
    }
}

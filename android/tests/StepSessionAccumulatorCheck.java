package cn.shichen.wellness;
import static cn.shichen.wellness.StepSessionAccumulator.Mode.*;
public class StepSessionAccumulatorCheck {
    static void check(Object actual,Object expected,String name) {
        if(!java.util.Objects.equals(actual,expected))throw new AssertionError(name+": "+actual+" != "+expected);
    }
    public static void main(String[] args) {
        StepSessionAccumulator a=new StepSessionAccumulator();
        check(a.snapshot().steps,null,"no sensor event is unknown");
        a.start(COUNTER,100);a.accept(500,90,1000);
        check(a.snapshot().steps,null,"old cached event rejected");
        a.accept(503,110,1010);check(a.snapshot().steps,0L,"first counter event is baseline only");
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
        a.pause();a.start(DETECTOR,220);check(a.snapshot().segmentHasReading,false,"resume awaits a new reading");
        a.accept(1,230,1130);a.accept(1,240,1140);check(a.snapshot().steps,12L,"detector counts real first step");
        a.accept(2,250,1150);check(a.snapshot().steps,12L,"unexpected detector value rejected");
        a=new StepSessionAccumulator();a.start(DETECTOR,0);a.accept(1,1,1);
        check(a.snapshot().steps,1L,"detector-only hardware counts first event");
        System.out.println("15 step session checks passed");
    }
}

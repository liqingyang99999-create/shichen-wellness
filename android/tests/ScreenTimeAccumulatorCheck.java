package cn.shichen.wellness;
import static cn.shichen.wellness.ScreenTimeAccumulator.Kind.*;
public class ScreenTimeAccumulatorCheck {
    static final long MIN=60000,START=10*MIN,END=70*MIN;
    static void check(Object actual,Object expected,String name){if(!java.util.Objects.equals(actual,expected))throw new AssertionError(name+": "+actual+" != "+expected);}
    public static void main(String[] args){
        ScreenTimeAccumulator a=new ScreenTimeAccumulator(START,END);
        a.accept(5*MIN,OFF);a.accept(20*MIN,ON);a.accept(40*MIN,OFF);check(a.minutes(),20L,"closed interval");
        a=new ScreenTimeAccumulator(START,END);a.accept(5*MIN,ON);a.accept(40*MIN,OFF);check(a.minutes(),30L,"midnight crossing");
        a=new ScreenTimeAccumulator(START,END);a.accept(20*MIN,ON);check(a.minutes(),null,"missing baseline");
        a=new ScreenTimeAccumulator(START,END);a.accept(5*MIN,ON);a.accept(20*MIN,RESTART);a.accept(30*MIN,ON);check(a.minutes(),null,"shutdown never counted as screen use");
        a=new ScreenTimeAccumulator(START,END);a.accept(5*MIN,ON);a.accept(6*MIN,RESTART);a.accept(20*MIN,ON);check(a.minutes(),null,"prior restart invalidates stale baseline");
        a=new ScreenTimeAccumulator(START,END);a.accept(5*MIN,ON);a.accept(6*MIN,RESTART);a.accept(7*MIN,OFF);a.accept(30*MIN,ON);check(a.minutes(),40L,"known state after prior restart");
        a=new ScreenTimeAccumulator(START,END);a.accept(5*MIN,OFF);check(a.minutes(),0L,"known zero");
        a=new ScreenTimeAccumulator(START,END);a.accept(5*MIN,ON);a.accept(20*MIN,ON);check(a.minutes(),60L,"duplicate on events");
        a=new ScreenTimeAccumulator(START,END);a.accept(20*MIN,ON);a.accept(40*MIN,OFF);
        check(a.result().observedMinutes,20L,"missing midnight retains observed duration");
        check(a.result().status,"partial","missing midnight explicitly partial");
        check(a.result().windowStart,20*MIN,"partial window starts at first event");
        check(a.result().coveredMinutes,50L,"partial covered duration includes known off state");
        a=new ScreenTimeAccumulator(START,END);a.accept(5*MIN,OFF);a.accept(20*MIN,ON);a.accept(30*MIN,OFF);
        a.accept(40*MIN,ON);a.accept(50*MIN,RESTART);a.accept(60*MIN,ON);
        check(a.result().observedMinutes,20L,"restart preserves closed interval and excludes unclosed interval");
        check(a.result().coveredMinutes,40L,"unknown restart gap excluded from coverage");
        check(a.result().reason,"restart_gap","restart gap explicitly partial");
        a=new ScreenTimeAccumulator(START,END);check(a.result().observedMinutes,null,"empty is unknown not zero");
        check(a.result().status,"no_events","empty distinguished from denied access");
        a.accept(20*MIN,OFF);check(a.result().observedMinutes,0L,"known off interval is real zero");
        a.accept(80*MIN,ON);a.accept(15*MIN,ON);check(a.result().observedMinutes,0L,"future and out of order ignored");
        a=new ScreenTimeAccumulator(START,END);a.accept(5*MIN,ON);a.accept(20*MIN,RESTART);
        check(a.result().observedMinutes,null,"unclosed prerestart interval not invented");
        a=new ScreenTimeAccumulator(START,END);a.accept(START,OFF);a.accept(END,ON);
        check(a.minutes(),0L,"exact endpoints do not add future duration");
        System.out.println("21 screen duration checks passed");
    }
}

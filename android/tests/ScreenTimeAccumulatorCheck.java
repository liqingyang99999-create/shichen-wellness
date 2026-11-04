package cn.shichen.wellness;
import static cn.shichen.wellness.ScreenTimeAccumulator.Kind.*;
public class ScreenTimeAccumulatorCheck {
    static final long MIN=60000,START=10*MIN,END=70*MIN;
    static void check(Long actual,Long expected,String name){if(!java.util.Objects.equals(actual,expected))throw new AssertionError(name+": "+actual+" != "+expected);}
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
        System.out.println("8 screen duration checks passed");
    }
}

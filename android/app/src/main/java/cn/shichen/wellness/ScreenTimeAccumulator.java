package cn.shichen.wellness;

/** Pure calculation: missing midnight state or a restart today yields unknown, never an invented total. */
final class ScreenTimeAccumulator {
    enum Kind { ON, OFF, RESTART }
    private final long start,end;
    private Boolean on;
    private boolean baseline, interrupted;
    private long since,total;
    ScreenTimeAccumulator(long start,long end){this.start=start;this.end=end;this.since=start;}
    void accept(long at,Kind kind){
        if(at>end)return;
        if(kind==Kind.RESTART){
            if(at>=start)interrupted=true;
            on=null;baseline=false;since=start;return;
        }
        boolean next=kind==Kind.ON;
        if(at<=start){on=next;baseline=true;since=start;return;}
        if(Boolean.TRUE.equals(on))total+=Math.max(0,at-since);
        on=next;since=at;
    }
    Long minutes(){
        if(!baseline||interrupted)return null;
        long value=total+(Boolean.TRUE.equals(on)?Math.max(0,end-since):0);
        return Math.max(0,Math.min((end-start)/60000,value/60000));
    }
}

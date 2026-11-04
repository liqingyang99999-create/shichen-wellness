package cn.shichen.wellness;

/** Counts genuine step events in active foreground segments, never the gap between segments. */
final class StepSessionAccumulator {
    enum Mode { COUNTER, DETECTOR }
    static final class Snapshot {
        final Long steps, firstAt, lastAt;
        final int eventsCount;
        final boolean segmentHasReading;
        Snapshot(Long steps,Long firstAt,Long lastAt,int eventsCount,boolean segmentHasReading) {
            this.steps=steps;this.firstAt=firstAt;this.lastAt=lastAt;this.eventsCount=eventsCount;
            this.segmentHasReading=segmentHasReading;
        }
    }
    private Mode mode;
    private boolean active, hasReading, segmentHasReading;
    private long total, segmentStartNanos, lastNanos=Long.MIN_VALUE;
    private Long baseline, firstAt, lastAt;
    private int eventsCount;
    synchronized void start(Mode mode,long elapsedNanos) {
        this.mode=mode;active=true;baseline=null;segmentHasReading=false;segmentStartNanos=elapsedNanos;
    }
    synchronized void pause() {active=false;baseline=null;segmentHasReading=false;}
    synchronized void accept(float value,long eventNanos,long atMillis) {
        if(!active || !Float.isFinite(value) || value<0 || eventNanos<segmentStartNanos || eventNanos<=lastNanos)return;
        if(mode==Mode.DETECTOR && value!=1f)return;
        lastNanos=eventNanos;
        if(mode==Mode.COUNTER) {
            long current=(long)value;
            if(baseline!=null && current>=baseline)total+=current-baseline;
            // A reset/reboot creates a new baseline, not negative or invented steps.
            baseline=current;
        } else total++;
        hasReading=true;segmentHasReading=true;eventsCount++;
        if(firstAt==null)firstAt=atMillis;
        lastAt=atMillis;
    }
    synchronized Snapshot snapshot() {
        return new Snapshot(hasReading?total:null,firstAt,lastAt,eventsCount,segmentHasReading);
    }
}

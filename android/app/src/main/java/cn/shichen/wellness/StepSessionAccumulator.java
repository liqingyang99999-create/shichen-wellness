package cn.shichen.wellness;

/** Counts genuine step events in active foreground segments, never the gap between segments. */
final class StepSessionAccumulator {
    static final long OBSERVATION_TIMEOUT_NANOS=60_000_000_000L;
    enum Mode { COUNTER, DETECTOR }
    static final class Snapshot {
        final Long steps, firstAt, lastAt, lastIncrementAt;
        final int eventsCount;
        final boolean segmentHasReading, segmentHasIncrement, baselineEstablished;
        Snapshot(Long steps,Long firstAt,Long lastAt,Long lastIncrementAt,int eventsCount,boolean segmentHasReading,boolean segmentHasIncrement,boolean baselineEstablished) {
            this.steps=steps;this.firstAt=firstAt;this.lastAt=lastAt;this.eventsCount=eventsCount;
            this.lastIncrementAt=lastIncrementAt;this.segmentHasReading=segmentHasReading;
            this.segmentHasIncrement=segmentHasIncrement;this.baselineEstablished=baselineEstablished;
        }
    }
    static final class Observation {
        final String status,reason;
        Observation(String status,String reason){this.status=status;this.reason=reason;}
    }
    private Mode mode;
    private boolean active, segmentHasReading, segmentHasIncrement;
    private long total, segmentStartNanos, lastNanos=Long.MIN_VALUE;
    private Long baseline, firstAt, lastAt, lastIncrementAt;
    private int eventsCount;
    synchronized void start(Mode mode,long elapsedNanos) {
        this.mode=mode;active=true;baseline=null;segmentHasReading=false;segmentHasIncrement=false;segmentStartNanos=elapsedNanos;
    }
    synchronized void pause() {active=false;baseline=null;segmentHasReading=false;segmentHasIncrement=false;}
    synchronized void accept(float value,long eventNanos,long atMillis) {
        accept(mode,value,eventNanos,atMillis);
    }
    synchronized void accept(Mode source,float value,long eventNanos,long atMillis) {
        if(!active || source!=mode || !Float.isFinite(value) || value<0 || eventNanos<segmentStartNanos || eventNanos<=lastNanos)return;
        if(mode==Mode.DETECTOR && value!=1f)return;
        if(mode==Mode.COUNTER && value!=(long)value)return;
        lastNanos=eventNanos;
        long increment=0;
        if(mode==Mode.COUNTER) {
            long current=(long)value;
            if(baseline!=null && current>=baseline)increment=current-baseline;
            // A reset/reboot creates a new baseline, not negative or invented steps.
            baseline=current;
        } else increment=1;
        if(increment>0){total+=increment;segmentHasIncrement=true;lastIncrementAt=atMillis;}
        segmentHasReading=true;eventsCount++;
        if(firstAt==null)firstAt=atMillis;
        lastAt=atMillis;
    }
    synchronized Snapshot snapshot() {
        // A counter baseline proves a sensor message, not zero observed steps.
        return new Snapshot(total>0?total:null,firstAt,lastAt,lastIncrementAt,eventsCount,segmentHasReading,segmentHasIncrement,baseline!=null);
    }
    synchronized Observation observation(long nowNanos) {
        if(!active)return new Observation("paused","app_background");
        long reference=segmentHasReading?lastNanos:segmentStartNanos;
        if(nowNanos>=reference && nowNanos-reference>=OBSERVATION_TIMEOUT_NANOS)
            return new Observation("no_events","sensor_no_recent_events");
        if(!segmentHasReading)return new Observation("waiting_for_sensor","awaiting_first_event");
        if(!segmentHasIncrement)return new Observation("baseline_only","counter_baseline_only");
        return new Observation("available","foreground_steps_observed");
    }
    synchronized String detectorFallbackReason(long nowNanos) {
        if(!active || mode!=Mode.COUNTER || segmentHasIncrement || nowNanos<segmentStartNanos
            || nowNanos-segmentStartNanos<OBSERVATION_TIMEOUT_NANOS)return null;
        return segmentHasReading?"counter_no_increment":"counter_no_events";
    }
}

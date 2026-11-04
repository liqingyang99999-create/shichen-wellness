package cn.shichen.wellness;

/** Aggregates only intervals with known state; a partial record is never a full-day total. */
final class ScreenTimeAccumulator {
    enum Kind { ON, OFF, RESTART }
    static final class Result {
        final Long fullDayMinutes, observedMinutes, windowStart, windowEnd, coveredMinutes;
        final String status, reason;
        Result(Long full, Long observed, Long from, Long to, Long covered, String status, String reason) {
            this.fullDayMinutes=full; this.observedMinutes=observed; this.windowStart=from;
            this.windowEnd=to; this.coveredMinutes=covered; this.status=status; this.reason=reason;
        }
    }
    private final long start, end;
    private Boolean on;
    private boolean baseline, interrupted;
    private long since, total, covered, lastAt=Long.MIN_VALUE;
    private Long firstCommitted, lastCommitted;
    ScreenTimeAccumulator(long start, long end) {
        if(end<start)throw new IllegalArgumentException("Invalid interval");
        this.start=start;this.end=end;this.since=start;
    }
    void accept(long at, Kind kind) {
        if(at>end || at<lastAt)return;
        lastAt=at;
        if(kind==Kind.RESTART) {
            // Shutdown markers do not reliably close an open screen interval.
            // Preserve closed intervals, but never carry state across restart.
            if(at>=start)interrupted=true;
            on=null;baseline=false;since=start;return;
        }
        boolean next=kind==Kind.ON;
        if(at<=start) {on=next;baseline=true;since=start;return;}
        if(on!=null) {
            long duration=at-since;
            if(on)total+=duration;
            covered+=duration;
            if(firstCommitted==null)firstCommitted=since;
            lastCommitted=at;
        }
        on=next;since=at;
    }
    Result result() {
        long value=total, coverage=covered;
        Long from=firstCommitted, to=lastCommitted;
        if(on!=null) {
            if(on)value+=end-since;
            coverage+=end-since;
            if(from==null)from=since;
            to=end;
        }
        if(from==null)return new Result(null,null,null,null,null,"no_events","no_screen_events");
        long observed=Math.max(0,value/60000);
        boolean complete=baseline && !interrupted && coverage==end-start;
        return new Result(complete?observed:null,observed,from,to,Math.max(0,coverage/60000),
            complete?"available":"partial",complete?"complete_day":interrupted?"restart_gap":"midnight_state_unknown");
    }
    Long minutes() {return result().fullDayMinutes;}
}

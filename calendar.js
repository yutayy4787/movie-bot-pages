"use strict";

// Keep time placement independent of the DOM so overlapping screenings can be checked.
const ScreeningCalendar = (() => {
  function timeLabel(minutes) {
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }
  function entry(row, movie) {
    const [hours, minutes] = row.starts_at.split(":").map(Number);
    const start = hours * 60 + minutes;
    const runtime = Number(movie?.runtime_minutes);
    const knownDuration = Number.isFinite(runtime) && runtime > 0;
    return { row, start, end: start + (knownDuration ? runtime : 30), knownDuration };
  }
  function layout(entries) {
    const sorted = entries.map((item) => ({ ...item })).sort((a, b) => a.start - b.start || a.end - b.end);
    let cluster = [], laneEnds = [], clusterEnd = -Infinity;
    const finish = () => cluster.forEach((item) => { item.lanes = laneEnds.length; });
    for (const item of sorted) {
      if (item.start >= clusterEnd) {
        finish(); cluster = []; laneEnds = []; clusterEnd = -Infinity;
      }
      let lane = laneEnds.findIndex((end) => end <= item.start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = item.end;
      item.lane = lane;
      cluster.push(item);
      clusterEnd = Math.max(clusterEnd, item.end);
    }
    finish();
    return sorted;
  }
  return { timeLabel, entry, layout };
})();
if (typeof module !== "undefined") module.exports = ScreeningCalendar;

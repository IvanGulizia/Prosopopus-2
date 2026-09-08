const firstKf = { time: 0 };
const lastKf = { time: 1 };
const duration = 2;
const times = [0, 0.5, 1.0, 1.5, 1.9];

times.forEach(time => {
  const t = (time % duration + duration) % duration;
  let prevKf, nextKf, rawProgress;
  
  if (t > lastKf.time || t < firstKf.time) {
    const loopSpan = (firstKf.time + duration) - lastKf.time;
    const dt = t >= lastKf.time ? (t - lastKf.time) : (t + duration - lastKf.time);
    rawProgress = Math.max(0, Math.min(1, dt / loopSpan));
    console.log(`t=${t} -> LOOP. dt=${dt}, loopSpan=${loopSpan}, rawProgress=${rawProgress}`);
  } else {
    // Normal bounding
    console.log(`t=${t} -> NORMAL.`);
  }
});

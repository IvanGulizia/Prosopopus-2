const { evaluateEasing } = require('./dist/utils/animation.js') || {};

function test() {
  const t = 1.5;
  const lastKfTime = 1.0;
  const firstKfTime = 0.0;
  const effectiveDuration = 2.0;

  const loopSpan = (firstKfTime + effectiveDuration) - lastKfTime;
  const dt = t >= lastKfTime ? (t - lastKfTime) : (t + effectiveDuration - lastKfTime);
  const rawProgress = Math.max(0, Math.min(1, dt / loopSpan));
  
  console.log({ loopSpan, dt, rawProgress });
}
test();

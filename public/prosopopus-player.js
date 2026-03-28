/**
 * Prosopopus v2 - Standalone Player (JS Version)
 * Ported from src/player.ts for maximum compatibility and performance.
 */

// --- MATH & INTERPOLATION UTILS ---

const distance = (p1, p2) => Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
const lerp = (start, end, t) => start * (1 - t) + end * t;

const parseColor = (color) => {
  if (!color || color === 'none') return { r: 0, g: 0, b: 0, a: 1 };
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const bigint = parseInt(hex, 16);
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255, a: 1 };
  }
  if (color.startsWith('rgb')) {
    const match = color.match(/(\d+(\.\d+)?)/g);
    if (match) {
      return {
        r: parseFloat(match[0]),
        g: parseFloat(match[1]),
        b: parseFloat(match[2]),
        a: match[3] ? parseFloat(match[3]) : 1
      };
    }
  }
  return { r: 0, g: 0, b: 0, a: 1 };
};

const mixColors = (colors) => {
  let rSum = 0, gSum = 0, bSum = 0, aSum = 0;
  let hasColor = false;
  let totalAlphaWeight = 0;

  for (const c of colors) {
    const rgba = parseColor(c.color);
    const alpha = c.color === 'none' ? 0 : rgba.a;
    if (alpha > 0) {
      hasColor = true;
      rSum += rgba.r * c.weight * alpha;
      gSum += rgba.g * c.weight * alpha;
      bSum += rgba.b * c.weight * alpha;
    }
    aSum += alpha * c.weight;
    totalAlphaWeight += c.weight * alpha;
  }

  if (!hasColor || aSum <= 0.001 || totalAlphaWeight <= 0.0001) return 'none';
  return `rgba(${Math.round(rSum / totalAlphaWeight)}, ${Math.round(gSum / totalAlphaWeight)}, ${Math.round(bSum / totalAlphaWeight)}, ${aSum.toFixed(3)})`;
};

const resamplePoints = (points, targetCount) => {
  if (points.length < 2 || targetCount < 2) return points;
  let totalLength = 0;
  for (let i = 1; i < points.length; i++) totalLength += distance(points[i - 1], points[i]);
  if (totalLength === 0) return Array(targetCount).fill(points[0]);

  const step = totalLength / (targetCount - 1);
  const newPoints = [points[0]];
  let currentDist = 0;
  let nextPointIndex = 1;

  for (let i = 1; i < targetCount; i++) {
    const targetDist = i * step;
    let distSoFar = currentDist;
    let p1 = points[nextPointIndex - 1];
    let p2 = points[nextPointIndex];
    let segmentDist = distance(p1, p2);

    while (distSoFar + segmentDist < targetDist && nextPointIndex < points.length - 1) {
      distSoFar += segmentDist;
      currentDist = distSoFar;
      nextPointIndex++;
      p1 = points[nextPointIndex - 1];
      p2 = points[nextPointIndex];
      segmentDist = distance(p1, p2);
    }

    const t = segmentDist === 0 ? 0 : (targetDist - distSoFar) / segmentDist;
    newPoints.push({ x: lerp(p1.x, p2.x, t), y: lerp(p1.y, p2.y, t), pressure: lerp(p1.pressure || 0.5, p2.pressure || 0.5, t) });
  }
  newPoints[targetCount - 1] = points[points.length - 1];
  return newPoints;
};

const upsamplePreservingCorners = (points, targetCount) => {
  if (points.length === 0) return [];
  if (points.length >= targetCount) return points;
  const pointsToAdd = targetCount - points.length;
  const segments = points.length - 1;
  if (segments < 1) return Array(targetCount).fill(points[0]);
  const baseAdd = Math.floor(pointsToAdd / segments);
  const remainder = pointsToAdd % segments;
  const newPoints = [];
  for (let i = 0; i < segments; i++) {
    newPoints.push(points[i]);
    const count = baseAdd + (i < remainder ? 1 : 0);
    for (let k = 1; k <= count; k++) {
      const t = k / (count + 1);
      newPoints.push({ x: lerp(points[i].x, points[i + 1].x, t), y: lerp(points[i].y, points[i + 1].y, t), pressure: lerp(points[i].pressure || 0.5, points[i + 1].pressure || 0.5, t) });
    }
  }
  newPoints.push(points[points.length - 1]);
  return newPoints;
};

const calculateBilinearGridWeights = (currentAxes, keyframes, xAxisId = 'axis-x', yAxisId = 'axis-y') => {
  const weights = {};
  const curX = currentAxes[xAxisId] || 0;
  const curY = currentAxes[yAxisId] || 0;
  const EPSILON = 0.0001; // Increased precision

  const distinctCoords = (arr) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const result = [];
    if (sorted.length > 0) result.push(sorted[0]);
    for (let i = 1; i < sorted.length; i++) if (sorted[i] > sorted[i - 1] + 0.001) result.push(sorted[i]);
    return result;
  };

  const xCoords = distinctCoords(keyframes.map(k => k.axisValues[xAxisId] || 0));
  const yCoords = distinctCoords(keyframes.map(k => k.axisValues[yAxisId] || 0));

  if (xCoords.length === 0 || yCoords.length === 0) {
    if (keyframes.length > 0) weights[keyframes[0].id] = 1;
    return weights;
  }

  const findInterval = (val, grid) => {
    if (val <= grid[0]) return { lower: grid[0], upper: grid[0], t: 0 };
    if (val >= grid[grid.length - 1]) return { lower: grid[grid.length - 1], upper: grid[grid.length - 1], t: 0 };
    for (let i = 0; i < grid.length - 1; i++) {
      if (val >= grid[i] && val <= grid[i + 1]) {
        const span = grid[i + 1] - grid[i];
        return { lower: grid[i], upper: grid[i + 1], t: span === 0 ? 0 : (val - grid[i]) / span };
      }
    }
    return { lower: grid[0], upper: grid[0], t: 0 };
  };

  const xInfo = findInterval(curX, xCoords);
  const yInfo = findInterval(curY, yCoords);

  const resolveCornerWeights = (targetX, targetY) => {
    const exact = keyframes.find(k => Math.abs((k.axisValues[xAxisId] || 0) - targetX) < EPSILON && Math.abs((k.axisValues[yAxisId] || 0) - targetY) < EPSILON);
    if (exact) return { [exact.id]: 1.0 };
    let totalW = 0;
    const cornerWeights = {};
    keyframes.forEach(k => {
      const dx = (k.axisValues[xAxisId] || 0) - targetX;
      const dy = (k.axisValues[yAxisId] || 0) - targetY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const w = dist < 0.001 ? 1000 : 1 / Math.pow(dist, 2);
      cornerWeights[k.id] = w;
      totalW += w;
    });
    for (const id in cornerWeights) cornerWeights[id] /= totalW;
    return cornerWeights;
  };

  const corners = [
    { x: xInfo.lower, y: yInfo.lower, wBase: (1 - xInfo.t) * (1 - yInfo.t) },
    { x: xInfo.upper, y: yInfo.lower, wBase: xInfo.t * (1 - yInfo.t) },
    { x: xInfo.lower, y: yInfo.upper, wBase: (1 - xInfo.t) * yInfo.t },
    { x: xInfo.upper, y: yInfo.upper, wBase: xInfo.t * yInfo.t }
  ];

  corners.forEach(c => {
    if (c.wBase <= 0.0001) return;
    const cornerComposition = resolveCornerWeights(c.x, c.y);
    for (const kfId in cornerComposition) weights[kfId] = (weights[kfId] || 0) + (cornerComposition[kfId] * c.wBase);
  });

  return weights;
};

const calculateIDWWeights = (currentAxes, keyframes, exponent) => {
  const weights = {};
  let totalWeight = 0;
  for (const kf of keyframes) {
    let dist = 0;
    for (const axisId in currentAxes) dist += Math.pow((currentAxes[axisId] || 0) - (kf.axisValues[axisId] || 0), 2);
    dist = Math.sqrt(dist);
    if (dist < 0.001) {
      keyframes.forEach(k => weights[k.id] = 0);
      weights[kf.id] = 1;
      return weights;
    }
    const w = 1 / Math.pow(dist, exponent);
    weights[kf.id] = w;
    totalWeight += w;
  }
  for (const id in weights) weights[id] /= totalWeight;
  return weights;
};

const calculateInterpolationWeights = (currentAxes, keyframes, exponent = 2, strategy = 'bilinear-grid', xAxisId = 'axis-x', yAxisId = 'axis-y') => {
  if (keyframes.length === 0) return {};
  if (keyframes.length === 1) return { [keyframes[0].id]: 1.0 };
  return strategy === 'bilinear-grid' ? calculateBilinearGridWeights(currentAxes, keyframes, xAxisId, yAxisId) : calculateIDWWeights(currentAxes, keyframes, exponent);
};

const resolveStrokeStyle = (stroke, layer) => {
  const defaultStyle = { strokeColor: '#000000', strokeWidth: 4, fillColor: 'none', lineStyle: 'solid', cornerRoundness: 0 };
  const baseStyle = layer?.baseStyle || defaultStyle;
  if (!stroke || !stroke.style) return { ...baseStyle, cornerRoundness: baseStyle.cornerRoundness ?? defaultStyle.cornerRoundness };
  return {
    strokeColor: stroke.style.strokeColor ?? baseStyle.strokeColor,
    strokeWidth: stroke.style.strokeWidth ?? baseStyle.strokeWidth,
    fillColor: stroke.style.fillColor ?? baseStyle.fillColor,
    lineStyle: stroke.style.lineStyle ?? baseStyle.lineStyle,
    cornerRoundness: stroke.style.cornerRoundness ?? baseStyle.cornerRoundness ?? defaultStyle.cornerRoundness
  };
};

const interpolateStrokePoints = (activeKeyframes, mode = 'resample', targetCount = 200) => {
  if (activeKeyframes.length === 0) return { points: [], color: 'rgba(0,0,0,0)', fillColor: 'none', width: 1, cornerRoundness: 0 };

  const color = mixColors(activeKeyframes.map(k => ({ color: k.color, weight: k.weight })));
  const fillColor = mixColors(activeKeyframes.map(k => ({ color: k.fillColor, weight: k.weight })));
  let totalWidth = 0, totalCornerRoundness = 0, weightDiv = 0;
  activeKeyframes.forEach(k => { totalWidth += k.width * k.weight; totalCornerRoundness += k.cornerRoundness * k.weight; weightDiv += k.weight; });
  const width = weightDiv > 0 ? totalWidth / weightDiv : 1;
  const cornerRoundness = weightDiv > 0 ? totalCornerRoundness / weightDiv : 0;

  let ACTUAL_TARGET_COUNT = targetCount;
  const maxPts = Math.max(...activeKeyframes.map(k => k.points?.length || 0));
  if (mode === 'points' || mode === 'spline') ACTUAL_TARGET_COUNT = maxPts;

  // Optimization: Pre-process points once per keyframe
  const processedKeyframes = activeKeyframes.map(kf => {
    const rawPoints = kf.points || [];
    const processed = (mode === 'points' || mode === 'spline') 
      ? (rawPoints.length === ACTUAL_TARGET_COUNT ? rawPoints : upsamplePreservingCorners(rawPoints, ACTUAL_TARGET_COUNT)) 
      : resamplePoints(rawPoints, ACTUAL_TARGET_COUNT);
    return { weight: kf.weight, processed };
  });

  const resultPoints = [];
  for (let i = 0; i < ACTUAL_TARGET_COUNT; i++) {
    let x = 0, y = 0, pressure = 0, totalW = 0;
    for (const kf of processedKeyframes) {
      const pt = kf.processed[i] || kf.processed[kf.processed.length - 1] || { x: 0, y: 0, pressure: 0.5 };
      x += pt.x * kf.weight; y += pt.y * kf.weight; pressure += (pt.pressure || 0.5) * kf.weight; totalW += kf.weight;
    }
    if (totalW > 0) resultPoints.push({ x: x / totalW, y: y / totalW, pressure: pressure / totalW });
  }
  return { points: resultPoints, color, fillColor, width, cornerRoundness };
};

const drawCornerRoundedPath = (ctx, points, roundness) => {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i++) {
    const curr = points[i], prev = points[i - 1], next = points[i + 1];
    const len1 = distance(prev, curr), len2 = distance(curr, next);
    if (len1 < 0.1 || len2 < 0.1) { ctx.lineTo(curr.x, curr.y); continue; }
    const dot = ((curr.x - prev.x) / len1) * ((next.x - curr.x) / len2) + ((curr.y - prev.y) / len1) * ((next.y - curr.y) / len2);
    if (dot > 0.99) { ctx.lineTo(curr.x, curr.y); continue; }
    const radius = Math.min(len1, len2) * 0.5 * (roundness / 100) * Math.tan((Math.PI - Math.acos(Math.max(-1, Math.min(1, dot)))) / 2);
    if (radius < 0.05 || isNaN(radius)) { ctx.lineTo(curr.x, curr.y); continue; }
    ctx.arcTo(curr.x, curr.y, next.x, next.y, radius);
  }
  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
};

const drawCatmullRomSpline = (ctx, points, tension = 0.5) => {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[0], p1 = points[i], p2 = points[i + 1], p3 = i < points.length - 2 ? points[i + 2] : points[points.length - 1];
    ctx.bezierCurveTo(p1.x + (p2.x - p0.x) / 6 * tension, p1.y + (p2.y - p0.y) / 6 * tension, p2.x - (p3.x - p1.x) / 6 * tension, p2.y - (p3.y - p1.y) / 6 * tension, p2.x, p2.y);
  }
};

// --- PLAYER CLASS ---

export class ProsopopusPlayer {
  constructor(canvas, project) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');
    this.ctx = ctx;
    this.project = project;
    
    // Find the axes that should be mapped to the mouse
    this.xAxisId = project.axes?.find(a => a.type === 'mouseX')?.id || 'axis-x';
    this.yAxisId = project.axes?.find(a => a.type === 'mouseY')?.id || 'axis-y';
    
    this.currentAxes = {};
    this.targetAxes = {};
    
    // Initialize all axes to their default values
    project.axes?.forEach(axis => {
      this.currentAxes[axis.id] = axis.currentValue ?? 0.5;
      this.targetAxes[axis.id] = axis.currentValue ?? 0.5;
    });

    this.velocity = {};
    project.axes?.forEach(axis => {
      this.velocity[axis.id] = 0;
    });

    this.lastTime = 0;
    this.isRunning = false;
    this.setupInteraction();
  }

  setupInteraction() {
    this.handleMove = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      
      const rect = this.canvas.getBoundingClientRect();
      
      // Allow a small margin around the canvas for interaction to ensure we hit the edges (0 and 1)
      // even if the mouse moves slightly outside the canvas area.
      const margin = 100; 
      if (clientX < rect.left - margin || clientX > rect.right + margin ||
          clientY < rect.top - margin || clientY > rect.bottom + margin) {
        return;
      }

      // Calculate normalized coordinates (0 to 1) relative to the canvas
      const x = (clientX - rect.left) / rect.width;
      const y = (clientY - rect.top) / rect.height;
      
      this.targetAxes[this.xAxisId] = Math.max(0, Math.min(1, x));
      this.targetAxes[this.yAxisId] = Math.max(0, Math.min(1, y));
      
      // Prevent scrolling on touch devices when interacting
      if (e.touches && e.cancelable) e.preventDefault();
    };

    window.addEventListener('mousemove', this.handleMove);
    window.addEventListener('touchmove', this.handleMove, { passive: false });
  }

  start() {
    this.isRunning = true;
    requestAnimationFrame(this.loop.bind(this));
  }

  stop() {
    this.isRunning = false;
  }

  destroy() {
    this.stop();
    if (this.handleMove) {
      window.removeEventListener('mousemove', this.handleMove);
      window.removeEventListener('touchmove', this.handleMove);
    }
  }

  loop(time) {
    if (!this.isRunning) return;
    if (!this.lastTime) this.lastTime = time;
    const dt = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    this.updatePhysics(dt);
    this.render();
    requestAnimationFrame(this.loop.bind(this));
  }

  updatePhysics(dt) {
    const settings = this.project.settings || {};
    const stiffness = settings.springStiffness || 120;
    const damping = settings.springDamping || 20;

    for (const axisId in this.targetAxes) {
      if (settings.playModePhysics) {
        const force = (this.targetAxes[axisId] - this.currentAxes[axisId]) * stiffness - (this.velocity[axisId] || 0) * damping;
        this.velocity[axisId] = (this.velocity[axisId] || 0) + force * dt;
        this.currentAxes[axisId] = (this.currentAxes[axisId] || 0) + this.velocity[axisId] * dt;
      } else {
        this.currentAxes[axisId] = this.targetAxes[axisId];
      }
      this.currentAxes[axisId] = Math.max(0, Math.min(1, this.currentAxes[axisId]));
    }
  }

  render() {
    const { canvas, ctx, project, currentAxes } = this;
    const settings = project.settings || {};
    const dpr = window.devicePixelRatio || 1;
    
    const rect = canvas.getBoundingClientRect();
    const displayW = rect.width;
    const displayH = rect.height;
    
    if (displayW === 0 || displayH === 0) return;

    const projectW = project.canvasSize?.width || 600;
    const projectH = project.canvasSize?.height || 600;

    if (canvas.width !== Math.floor(displayW * dpr) || canvas.height !== Math.floor(displayH * dpr)) {
      canvas.width = Math.floor(displayW * dpr);
      canvas.height = Math.floor(displayH * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    
    const scaleX = displayW / projectW;
    const scaleY = displayH / projectH;
    ctx.scale(scaleX, scaleY);

    ctx.clearRect(0, 0, projectW, projectH);
    ctx.fillStyle = settings.theme?.canvasBg || '#ffffff';
    ctx.fillRect(0, 0, projectW, projectH);

    if (!project.layers || !project.keyframes) {
      ctx.restore();
      return;
    }

    project.layers.forEach(layer => {
      if (!layer.visible) return;
      
      const relevantKfs = project.keyframes.filter(kf => {
        const state = kf.layerStates?.find(s => s.layerId === layer.id);
        return state && state.strokes && state.strokes.length > 0;
      });
      
      if (relevantKfs.length === 0) return;

      const weights = calculateInterpolationWeights(currentAxes, relevantKfs, settings.interpolationExponent, settings.interpolationStrategy, this.xAxisId, this.yAxisId);
      const activeKfs = relevantKfs.map(k => ({ ...k, weight: weights[k.id] || 0 })).filter(k => k.weight > 0.0001);
      
      if (activeKfs.length === 0) return;

      const strokeData = activeKfs.map(kf => {
        const ls = kf.layerStates.find(s => s.layerId === layer.id);
        const s = ls.strokes[0];
        const style = resolveStrokeStyle(s, layer);
        return { 
          weight: kf.weight, 
          points: s.points, 
          style: s,
          color: style.strokeColor, 
          fillColor: style.fillColor, 
          width: style.strokeWidth, 
          cornerRoundness: style.cornerRoundness || 0 
        };
      });

      const { points, color, fillColor, width, cornerRoundness } = interpolateStrokePoints(strokeData, layer.interpolationMode, settings.performanceMode ? 80 : 200);
      
      if (points.length > 0) {
        ctx.globalAlpha = layer.opacity ?? 1;
        ctx.lineCap = settings.strokeCap || 'round';
        ctx.lineJoin = 'round';

        if (layer.interpolationMode === 'spline') {
          drawCatmullRomSpline(ctx, points, 0.5);
        } else if (cornerRoundness > 0) {
          drawCornerRoundedPath(ctx, points, cornerRoundness);
        } else {
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        }

        if (fillColor !== 'none') {
          ctx.fillStyle = fillColor;
          ctx.fill();
        }
        if (color !== 'none') {
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.stroke();
        }
      }
    });

    ctx.restore();
  }
}

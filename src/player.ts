/**
 * Prosopopus v2 - Autonomous Player
 * Lightweight rendering engine for Prosopopus vector interpolation projects.
 */

import { Project, Point, Stroke, Layer, Keyframe, InterpolationStrategy, StyleProps } from '../types';

// --- CORE MATH UTILS (Inlined for autonomy) ---

const distance = (p1: Point, p2: Point): number => Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
const lerp = (start: number, end: number, t: number): number => start * (1 - t) + end * t;

const parseColor = (color: string): { r: number, g: number, b: number, a: number } => {
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

const mixColors = (colors: { color: string | 'none', weight: number }[]): string => {
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

const resamplePoints = (points: Point[], targetCount: number): Point[] => {
  if (points.length < 2 || targetCount < 2) return points;
  let totalLength = 0;
  for (let i = 1; i < points.length; i++) totalLength += distance(points[i - 1], points[i]);
  if (totalLength === 0) return Array(targetCount).fill(points[0]);

  const step = totalLength / (targetCount - 1);
  const newPoints: Point[] = [points[0]];
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

const upsamplePreservingCorners = (points: Point[], targetCount: number): Point[] => {
  if (points.length === 0) return [];
  if (points.length >= targetCount) return points;
  const pointsToAdd = targetCount - points.length;
  const segments = points.length - 1;
  if (segments < 1) return Array(targetCount).fill(points[0]);
  const baseAdd = Math.floor(pointsToAdd / segments);
  const remainder = pointsToAdd % segments;
  const newPoints: Point[] = [];
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

const calculateBilinearGridWeights = (currentAxes: Record<string, number>, keyframes: Keyframe[]) => {
  const weights: Record<string, number> = {};
  const curX = currentAxes['axis-x'] || 0;
  const curY = currentAxes['axis-y'] || 0;
  const EPSILON = 0.005;

  const distinctCoords = (arr: number[]) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const result = [];
    if (sorted.length > 0) result.push(sorted[0]);
    for (let i = 1; i < sorted.length; i++) if (sorted[i] > sorted[i - 1] + EPSILON) result.push(sorted[i]);
    return result;
  };

  const xCoords = distinctCoords(keyframes.map(k => k.axisValues['axis-x'] || 0));
  const yCoords = distinctCoords(keyframes.map(k => k.axisValues['axis-y'] || 0));

  if (xCoords.length === 0 || yCoords.length === 0) {
    if (keyframes.length > 0) weights[keyframes[0].id] = 1;
    return weights;
  }

  const findInterval = (val: number, grid: number[]) => {
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

  const resolveCornerWeights = (targetX: number, targetY: number) => {
    const exact = keyframes.find(k => Math.abs((k.axisValues['axis-x'] || 0) - targetX) < EPSILON && Math.abs((k.axisValues['axis-y'] || 0) - targetY) < EPSILON);
    if (exact) return { [exact.id]: 1.0 };
    let totalW = 0;
    const cornerWeights: Record<string, number> = {};
    keyframes.forEach(k => {
      const dx = (k.axisValues['axis-x'] || 0) - targetX;
      const dy = (k.axisValues['axis-y'] || 0) - targetY;
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

const calculateIDWWeights = (currentAxes: Record<string, number>, keyframes: Keyframe[], exponent: number) => {
  const weights: Record<string, number> = {};
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

const calculateInterpolationWeights = (currentAxes: Record<string, number>, keyframes: Keyframe[], exponent: number = 2, strategy: InterpolationStrategy = 'bilinear-grid'): Record<string, number> => {
  if (keyframes.length === 0) return {};
  if (keyframes.length === 1) return { [keyframes[0].id]: 1.0 };
  return strategy === 'bilinear-grid' ? calculateBilinearGridWeights(currentAxes, keyframes) : calculateIDWWeights(currentAxes, keyframes, exponent);
};

const resolveStrokeStyle = (stroke: Stroke | undefined, layer: Layer | undefined): StyleProps => {
  const defaultStyle: StyleProps = { strokeColor: '#000000', strokeWidth: 4, fillColor: 'none', lineStyle: 'solid', cornerRoundness: 0 };
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

const interpolateStrokePoints = (
  activeKeyframes: { weight: number; points: Point[] | undefined, style: Stroke | undefined, color: string, fillColor: string, width: number, cornerRoundness: number }[],
  mode: 'resample' | 'points' | 'spline' = 'resample',
  targetCount: number = 200
): { points: Point[], color: string, fillColor: string, width: number, cornerRoundness: number } => {
  if (activeKeyframes.length === 0) return { points: [], color: 'rgba(0,0,0,0)', fillColor: 'none', width: 1, cornerRoundness: 0 };

  const color = mixColors(activeKeyframes.map(k => ({ color: k.color, weight: k.weight })));
  const fillColor = mixColors(activeKeyframes.map(k => ({ color: k.fillColor, weight: k.weight })));
  let totalWidth = 0, totalCornerRoundness = 0, weightDiv = 0;
  activeKeyframes.forEach(k => { totalWidth += k.width * k.weight; totalCornerRoundness += k.cornerRoundness * k.weight; weightDiv += k.weight; });
  const width = weightDiv > 0 ? totalWidth / weightDiv : 1;
  const cornerRoundness = weightDiv > 0 ? totalCornerRoundness / weightDiv : 0;

  let ACTUAL_TARGET_COUNT = targetCount;
  const maxPts = Math.max(...activeKeyframes.map(k => k.points!.length));
  if (mode === 'points' || mode === 'spline') ACTUAL_TARGET_COUNT = maxPts;

  const referenceKeyframe = activeKeyframes.reduce((prev, curr) => (prev.weight >= curr.weight) ? prev : curr);
  const referenceStroke = referenceKeyframe.points!;
  const referenceResampled = (mode === 'points' || mode === 'spline') ? upsamplePreservingCorners(referenceStroke, ACTUAL_TARGET_COUNT) : resamplePoints(referenceStroke, ACTUAL_TARGET_COUNT);

  const resultPoints: Point[] = [];
  for (let i = 0; i < ACTUAL_TARGET_COUNT; i++) {
    let x = 0, y = 0, pressure = 0, totalW = 0;
    for (const kf of activeKeyframes) {
      const rawPoints = kf.points!;
      const processed = (mode === 'points' || mode === 'spline') ? (rawPoints.length === ACTUAL_TARGET_COUNT ? rawPoints : upsamplePreservingCorners(rawPoints, ACTUAL_TARGET_COUNT)) : resamplePoints(rawPoints, ACTUAL_TARGET_COUNT);
      const pt = processed[i];
      x += pt.x * kf.weight; y += pt.y * kf.weight; pressure += (pt.pressure || 0.5) * kf.weight; totalW += kf.weight;
    }
    if (totalW > 0) resultPoints.push({ x: x / totalW, y: y / totalW, pressure: pressure / totalW });
  }
  return { points: resultPoints, color, fillColor, width, cornerRoundness };
};

const drawCornerRoundedPath = (ctx: CanvasRenderingContext2D, points: Point[], roundness: number) => {
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

const drawCatmullRomSpline = (ctx: CanvasRenderingContext2D, points: Point[], tension: number = 0.5) => {
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
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private project: Project;
  private currentAxes: Record<string, number> = { 'axis-x': 0.5, 'axis-y': 0.5 };
  private targetAxes: Record<string, number> = { 'axis-x': 0.5, 'axis-y': 0.5 };
  private velocity: { x: number, y: number } = { x: 0, y: 0 };
  private lastTime: number = 0;
  private isRunning: boolean = false;

  constructor(canvas: HTMLCanvasElement, project: Project) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');
    this.ctx = ctx;
    this.project = project;
    this.setupInteraction();
  }

  private setupInteraction() {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      let x = (clientX - rect.left) / rect.width;
      let y = (clientY - rect.top) / rect.height;
      this.targetAxes['axis-x'] = Math.max(0, Math.min(1, x));
      this.targetAxes['axis-y'] = Math.max(0, Math.min(1, y));
    };
    this.canvas.addEventListener('mousemove', handleMove);
    this.canvas.addEventListener('touchmove', handleMove);
  }

  public start() {
    this.isRunning = true;
    requestAnimationFrame(this.loop.bind(this));
  }

  public stop() {
    this.isRunning = false;
  }

  private loop(time: number) {
    if (!this.isRunning) return;
    if (!this.lastTime) this.lastTime = time;
    const dt = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    this.updatePhysics(dt);
    this.render();
    requestAnimationFrame(this.loop.bind(this));
  }

  private updatePhysics(dt: number) {
    const settings = this.project.settings || {};
    if (settings.playModePhysics) {
      const stiffness = settings.springStiffness || 120;
      const damping = settings.springDamping || 20;
      const fx = (this.targetAxes['axis-x'] - this.currentAxes['axis-x']) * stiffness - this.velocity.x * damping;
      const fy = (this.targetAxes['axis-y'] - this.currentAxes['axis-y']) * stiffness - this.velocity.y * damping;
      this.velocity.x += fx * dt;
      this.velocity.y += fy * dt;
      this.currentAxes['axis-x'] += this.velocity.x * dt;
      this.currentAxes['axis-y'] += this.velocity.y * dt;
    } else {
      this.currentAxes['axis-x'] = this.targetAxes['axis-x'];
      this.currentAxes['axis-y'] = this.targetAxes['axis-y'];
    }
    this.currentAxes['axis-x'] = Math.max(0, Math.min(1, this.currentAxes['axis-x']));
    this.currentAxes['axis-y'] = Math.max(0, Math.min(1, this.currentAxes['axis-y']));
  }

  private render() {
    const { canvas, ctx, project, currentAxes } = this;
    const settings = project.settings || {};
    const dpr = window.devicePixelRatio || 1;
    const w = project.canvasSize.width, h = project.canvasSize.height;

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    }

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = settings.theme?.canvasBg || '#ffffff';
    ctx.fillRect(0, 0, w, h);

    project.layers.forEach(layer => {
      if (!layer.visible) return;
      const relevantKfs = project.keyframes.filter(kf => (kf.layerStates.find(s => s.layerId === layer.id)?.strokes.length || 0) > 0);
      if (relevantKfs.length === 0) return;

      const weights = calculateInterpolationWeights(currentAxes, relevantKfs, settings.interpolationExponent, settings.interpolationStrategy);
      const activeKfs = relevantKfs.map(k => ({ ...k, weight: weights[k.id] || 0 })).filter(k => k.weight > 0.0001);
      const strokeData = activeKfs.map(kf => {
        const s = kf.layerStates.find(ls => ls.layerId === layer.id)?.strokes[0];
        const style = resolveStrokeStyle(s, layer);
        return { weight: kf.weight, points: s?.points, style: s, color: style.strokeColor, fillColor: style.fillColor, width: style.strokeWidth, cornerRoundness: style.cornerRoundness ?? 0 };
      });

      const primary = strokeData.sort((a, b) => b.weight - a.weight).find(sd => sd.style)?.style;
      if (!primary) return;

      const { points, color, fillColor, width, cornerRoundness } = interpolateStrokePoints(strokeData, layer.interpolationMode, settings.performanceMode ? 80 : 200);
      if (points.length > 0) {
        if (layer.interpolationMode === 'spline') drawCatmullRomSpline(ctx, points, 0.5);
        else if (cornerRoundness > 0) drawCornerRoundedPath(ctx, points, cornerRoundness);
        else {
          ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.globalAlpha = layer.opacity;
        ctx.lineCap = settings.strokeCap || 'round';
        ctx.lineJoin = 'round';
        if (fillColor !== 'none') { ctx.fillStyle = fillColor; ctx.fill(); }
        if (color !== 'none') { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); }
      }
    });
  }
}

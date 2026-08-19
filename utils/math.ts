// utils/math.ts
import { Point, Stroke, InterpolationStrategy, SymmetryType, CornerRadii, ShapeType, ShapeConfig } from '../types';

export const distance = (p1: Point, p2: Point): number => {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

export const lerp = (start: number, end: number, t: number): number => {
  return start * (1 - t) + end * t;
};

// --- Transformation Helpers ---

export const rotatePoint = (p: Point, center: Point, angleRad: number): Point => {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return {
    x: center.x + (dx * cos - dy * sin),
    y: center.y + (dx * sin + dy * cos),
    pressure: p.pressure
  };
};

export const getBoundingBox = (points: Point[]): { minX: number, maxX: number, minY: number, maxY: number, width: number, height: number, centerX: number, centerY: number } => {
  if (points.length === 0) return { minX:0, maxX:0, minY:0, maxY:0, width:0, height:0, centerX:0, centerY:0 };
  
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  
  return {
    minX, maxX, minY, maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: minX + (maxX - minX) / 2,
    centerY: minY + (maxY - minY) / 2
  };
};

// --- Color Interpolation (RGBA) ---

const colorCache: Record<string, { r: number, g: number, b: number, a: number }> = {};

const parseColor = (color: string): { r: number, g: number, b: number, a: number } => {
  if (!color || color === 'none') return { r: 0, g: 0, b: 0, a: 1 }; 
  if (colorCache[color]) return colorCache[color];

  let result = { r: 0, g: 0, b: 0, a: 1 };

  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const bigint = parseInt(hex, 16);
    result = {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255,
      a: 1
    };
  }
  else if (color.startsWith('rgb')) {
    const match = color.match(/(\d+(\.\d+)?)/g);
    if (match) {
        result = {
            r: parseFloat(match[0]),
            g: parseFloat(match[1]),
            b: parseFloat(match[2]),
            a: match[3] ? parseFloat(match[3]) : 1
        };
    }
  }

  colorCache[color] = result;
  return result;
};

export const mixColors = (colors: { color: string | 'none', weight: number }[]): string => {
  let rSum = 0, gSum = 0, bSum = 0, aSum = 0;
  let hasColor = false;
  
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
  }
  
  if (!hasColor || aSum <= 0.001) return 'none';
  
  let totalAlphaWeight = 0; 
  colors.forEach(c => {
     const rgba = parseColor(c.color);
     const alpha = c.color === 'none' ? 0 : rgba.a;
     totalAlphaWeight += c.weight * alpha;
  });

  if (totalAlphaWeight <= 0.0001) return 'rgba(0,0,0,0)';

  const finalR = rSum / totalAlphaWeight;
  const finalG = gSum / totalAlphaWeight;
  const finalB = bSum / totalAlphaWeight;

  return `rgba(${Math.round(finalR)}, ${Math.round(finalG)}, ${Math.round(finalB)}, ${aSum.toFixed(3)})`;
};

// --- Geometry Helpers ---

const getPathLength = (points: Point[]): number => {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += distance(points[i - 1], points[i]);
  }
  return len;
};

// Curve Resampling (Arc-Length)
export const resamplePoints = (points: Point[], targetCount: number): Point[] => {
  if (points.length < 2 || targetCount < 2) return points;

  const totalLength = getPathLength(points);
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

    const segmentLocalDist = targetDist - distSoFar;
    const t = segmentDist === 0 ? 0 : segmentLocalDist / segmentDist;
    
    newPoints.push({
      x: lerp(p1.x, p2.x, t),
      y: lerp(p1.y, p2.y, t),
      pressure: lerp(p1.pressure || 0.5, p2.pressure || 0.5, t)
    });
  }

  // Ensure strict end-point matching
  if (newPoints.length < targetCount) {
      while (newPoints.length < targetCount) newPoints.push(points[points.length - 1]);
  } else if (newPoints.length === targetCount) {
      // Force last point to be exactly the source last point to avoid floating error
      newPoints[targetCount - 1] = points[points.length - 1];
  } else {
      newPoints.length = targetCount;
      newPoints[targetCount - 1] = points[points.length - 1];
  }

  return newPoints;
};

// --- CORNER-PRESERVING UPSAMPLING ---
export const upsamplePreservingCorners = (points: Point[], targetCount: number): Point[] => {
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
        
        if (count > 0) {
            const pStart = points[i];
            const pEnd = points[i+1];
            for (let k = 1; k <= count; k++) {
                const t = k / (count + 1);
                newPoints.push({
                    x: lerp(pStart.x, pEnd.x, t),
                    y: lerp(pStart.y, pEnd.y, t),
                    pressure: lerp(pStart.pressure||0.5, pEnd.pressure||0.5, t)
                });
            }
        }
    }
    // Always add the very last point
    newPoints.push(points[points.length - 1]);

    return newPoints;
};

export const snapPointToGrid = (p: Point, gridSize: number, offset: {x: number, y: number} = {x:0, y:0}): Point => {
  return {
    x: Math.round((p.x - offset.x) / gridSize) * gridSize + offset.x,
    y: Math.round((p.y - offset.y) / gridSize) * gridSize + offset.y,
    pressure: p.pressure
  };
};

// --- Hit Testing ---

export const distToSegment = (p: Point, v: Point, w: Point) => {
  const l2 = Math.pow(distance(v, w), 2);
  if (l2 === 0) return distance(p, v);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projection = { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) };
  return distance(p, projection);
};

export const isPointInStroke = (p: Point, points: Point[], threshold: number = 10): boolean => {
  for (let i = 0; i < points.length - 1; i++) {
    if (distToSegment(p, points[i], points[i+1]) < threshold) return true;
  }
  return false;
};

// --- ABSOLUTE LINEAR ALIGNMENT (The Fix for "Jumps") ---

const alignPoints = (reference: Point[], target: Point[], isClosed: boolean): Point[] => {
    // CRITICAL: We return target AS IS.
    // The previous logic that tried to rotate/shift points when `isClosed` was true
    // caused the "Jumps" because the interpolation engine flipped between 
    // Linear (when open) and Cyclic (when closed) strategies in real-time.
    // By enforcing linearity, P[0] is always P[0]. Stability is restored.
    return target;
};

// --- INTERPOLATION STRATEGIES ---

const calculateBilinearGridWeights = (
  currentAxes: Record<string, number>,
  keyframes: { id: string; axisValues: Record<string, number> }[],
  allowExtrapolation: boolean = false,
  extrapolationFactor: number = 0.2
) => {
  const weights: Record<string, number> = {};
  
  const curX = currentAxes['axis-x'] || 0;
  const curY = currentAxes['axis-y'] || 0;
  const EPSILON = 0.005;

  const distinctCoords = (arr: number[]) => {
      const sorted = [...arr].sort((a,b) => a - b);
      const result = [];
      if (sorted.length > 0) result.push(sorted[0]);
      for (let i = 1; i < sorted.length; i++) {
          if (sorted[i] > sorted[i-1] + EPSILON) result.push(sorted[i]);
      }
      return result;
  };
  const xCoords = distinctCoords(keyframes.map(k => k.axisValues['axis-x'] || 0));
  const yCoords = distinctCoords(keyframes.map(k => k.axisValues['axis-y'] || 0));

  if (xCoords.length === 0 || yCoords.length === 0) {
      if (keyframes.length > 0) weights[keyframes[0].id] = 1;
      return weights;
  }

  const findInterval = (val: number, grid: number[]) => {
      if (grid.length === 1) return { lower: grid[0], upper: grid[0], t: 0 };
      
      if (val < grid[0]) {
          const span = grid[1] - grid[0];
          const rawT = span === 0 ? 0 : (val - grid[0]) / span;
          if (allowExtrapolation) {
              const clampedT = Math.max(-extrapolationFactor, rawT);
              return { lower: grid[0], upper: grid[1], t: clampedT };
          }
          return { lower: grid[0], upper: grid[0], t: 0 };
      }
      
      if (val > grid[grid.length - 1]) {
          const lastIdx = grid.length - 1;
          const span = grid[lastIdx] - grid[lastIdx - 1];
          const rawT = span === 0 ? 1 : 1 + (val - grid[lastIdx]) / span;
          if (allowExtrapolation) {
              const clampedT = Math.min(1 + extrapolationFactor, rawT);
              return { lower: grid[lastIdx - 1], upper: grid[lastIdx], t: clampedT };
          }
          return { lower: grid[lastIdx], upper: grid[lastIdx], t: 0 };
      }

      for (let i = 0; i < grid.length - 1; i++) {
          if (val >= grid[i] && val <= grid[i+1]) {
              const span = grid[i+1] - grid[i];
              return { lower: grid[i], upper: grid[i+1], t: span === 0 ? 0 : (val - grid[i]) / span };
          }
      }
      return { lower: grid[0], upper: grid[0], t: 0 };
  };

  const xInfo = findInterval(curX, xCoords);
  const yInfo = findInterval(curY, yCoords);

  const resolveCornerWeights = (targetX: number, targetY: number) => {
      const exact = keyframes.find(k => Math.abs((k.axisValues['axis-x']||0) - targetX) < EPSILON && Math.abs((k.axisValues['axis-y']||0) - targetY) < EPSILON);
      if (exact) return { [exact.id]: 1.0 };
      
      let totalW = 0;
      const cornerWeights: Record<string, number> = {};
      
      keyframes.forEach(k => {
          const dx = (k.axisValues['axis-x']||0) - targetX;
          const dy = (k.axisValues['axis-y']||0) - targetY;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 0.001) { cornerWeights[k.id] = 1000; totalW += 1000; }
          else {
              const w = 1 / Math.pow(dist, 2);
              cornerWeights[k.id] = w;
              totalW += w;
          }
      });
      
      for(const id in cornerWeights) cornerWeights[id] /= totalW;
      return cornerWeights;
  };

  const corners = [
      { x: xInfo.lower, y: yInfo.lower, wBase: (1 - xInfo.t) * (1 - yInfo.t) },
      { x: xInfo.upper, y: yInfo.lower, wBase: xInfo.t * (1 - yInfo.t) },
      { x: xInfo.lower, y: yInfo.upper, wBase: (1 - xInfo.t) * yInfo.t },
      { x: xInfo.upper, y: yInfo.upper, wBase: xInfo.t * yInfo.t }
  ];

  corners.forEach(c => {
      if (Math.abs(c.wBase) <= 0.0001) return;
      const cornerComposition = resolveCornerWeights(c.x, c.y);
      for (const kfId in cornerComposition) {
          weights[kfId] = (weights[kfId] || 0) + (cornerComposition[kfId] * c.wBase);
      }
  });

  return weights;
};

const calculateIDWWeights = (
    currentAxes: Record<string, number>, 
    keyframes: { id: string; axisValues: Record<string, number> }[], 
    exponent: number,
    allowExtrapolation: boolean = false,
    extrapolationFactor: number = 0.2
) => {
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

    // Approach A: If extrapolation enabled in IDW mode, project dominant keyframe past 1.0 while slightly depressing distant keyframes
    if (allowExtrapolation && keyframes.length > 1) {
        const sorted = Object.entries(weights).sort((a, b) => b[1] - a[1]);
        const dominantId = sorted[0][0];
        const dominantWeight = sorted[0][1];
        if (dominantWeight > 0.5) {
            const extra = (dominantWeight - 0.5) * 2 * extrapolationFactor;
            weights[dominantId] += extra;
            for (let i = 1; i < sorted.length; i++) {
                weights[sorted[i][0]] -= extra / (sorted.length - 1);
            }
        }
    }

    return weights;
};

export const calculateInterpolationWeights = (
  currentAxes: Record<string, number>,
  keyframes: { id: string; axisValues: Record<string, number> }[],
  exponent: number = 2,
  strategy: InterpolationStrategy = 'bilinear-grid',
  allowExtrapolation: boolean = false,
  extrapolationFactor: number = 0.2
): Record<string, number> => {
   if (keyframes.length === 0) return {};
   if (keyframes.length === 1) return { [keyframes[0].id]: 1.0 };
   if (strategy === 'bilinear-grid') return calculateBilinearGridWeights(currentAxes, keyframes, allowExtrapolation, extrapolationFactor);
   return calculateIDWWeights(currentAxes, keyframes, exponent, allowExtrapolation, extrapolationFactor);
};

// --- CORE INTERPOLATION ENGINE ---

export interface InterpolationOvershootOptions {
  exaggerationEnabled?: boolean;
  exaggerationFactor?: number; // e.g. 1.25 -> 25% exaggeration from centroid/neutral pose
  neutralKeyframeIndex?: number;
}

export const interpolateStrokePoints = (
  strokeId: string,
  basePoints: Point[], 
  keyframesData: { 
    weight: number; 
    points: Point[] | undefined; 
    style: Stroke | undefined; 
    color: string; 
    fillColor: string; 
    width: number; 
    cornerRoundness: number;
    cornerRadii?: CornerRadii;
  }[],
  mode: 'resample' | 'points' | 'spline' | 'length' = 'resample',
  targetCount: number = 200,
  overshootOptions?: InterpolationOvershootOptions
): { 
  points: Point[]; 
  color: string; 
  fillColor: string; 
  width: number; 
  cornerRoundness: number;
  cornerRadii?: CornerRadii;
} => {
  
  // 1. Filter active keyframes (weights can be negative or > 1 in extrapolation mode)
  const activeKeyframes = keyframesData.filter(k => Math.abs(k.weight) > 0.0001 && k.points && k.points.length > 0);
  if (activeKeyframes.length === 0) return { points: [], color: 'rgba(0,0,0,0)', fillColor: 'none', width: 1, cornerRoundness: 0 };

  // 2. Mix Properties (Colors & Width clamped to non-negative)
  const positiveKeyframes = activeKeyframes.filter(k => k.weight > 0.0001);
  const colorKeyframes = positiveKeyframes.length > 0 ? positiveKeyframes : activeKeyframes;
  const color = mixColors(colorKeyframes.map(k => ({ color: k.color, weight: Math.max(0.001, k.weight) })));
  const fillColor = mixColors(colorKeyframes.map(k => ({ color: k.fillColor, weight: Math.max(0.001, k.weight) })));
  
  let totalWidth = 0;
  let totalCornerRoundness = 0;
  let widthWeightDivisor = 0;
  let totalTL = 0, totalTR = 0, totalBR = 0, totalBL = 0;
  let hasRadii = false;

  activeKeyframes.forEach(k => {
      const w = Math.max(0, k.weight);
      totalWidth += k.width * w;
      totalCornerRoundness += k.cornerRoundness * w;
      widthWeightDivisor += w;

      const r = k.cornerRadii || k.style?.shapeConfig?.cornerRadii || k.style?.style?.cornerRadii;
      if (r) {
        hasRadii = true;
        totalTL += (r.topLeft ?? 0) * w;
        totalTR += (r.topRight ?? 0) * w;
        totalBR += (r.bottomRight ?? 0) * w;
        totalBL += (r.bottomLeft ?? 0) * w;
      }
  });
  const width = widthWeightDivisor > 0 ? totalWidth / widthWeightDivisor : 1;
  const cornerRoundness = widthWeightDivisor > 0 ? totalCornerRoundness / widthWeightDivisor : 0;
  const cornerRadii: CornerRadii | undefined = hasRadii && widthWeightDivisor > 0 ? {
    topLeft: totalTL / widthWeightDivisor,
    topRight: totalTR / widthWeightDivisor,
    bottomRight: totalBR / widthWeightDivisor,
    bottomLeft: totalBL / widthWeightDivisor
  } : undefined;

  // 3. Point Count Calculation & Isomorphic Topology Check
  const firstLen = activeKeyframes[0].points!.length;
  const allSameLength = activeKeyframes.every(k => k.points!.length === firstLen);

  // If all keyframes share low-poly topology (<= 16 points, like rectangles, triangles, polygons) or mode is 'points':
  if (allSameLength && (firstLen <= 16 || mode === 'points')) {
    const resultPoints: Point[] = [];
    for (let i = 0; i < firstLen; i++) {
      let x = 0;
      let y = 0;
      let pressure = 0;
      let totalWeight = 0;

      for (const kf of activeKeyframes) {
        const pt = kf.points![i];
        x += pt.x * kf.weight;
        y += pt.y * kf.weight;
        pressure += (pt.pressure || 0.5) * Math.max(0, kf.weight);
        totalWeight += kf.weight;
      }

      if (Math.abs(totalWeight) > 0.0001) {
        resultPoints.push({
          x: x / totalWeight,
          y: y / totalWeight,
          pressure: pressure / (activeKeyframes.reduce((sum, k) => sum + Math.max(0, k.weight), 0) || 1)
        });
      }
    }

    if (overshootOptions?.exaggerationEnabled && overshootOptions.exaggerationFactor && overshootOptions.exaggerationFactor !== 1.0 && resultPoints.length > 0) {
      const factor = overshootOptions.exaggerationFactor;
      let cX = 0, cY = 0;
      for (const p of resultPoints) { cX += p.x; cY += p.y; }
      cX /= resultPoints.length;
      cY /= resultPoints.length;
      for (let i = 0; i < resultPoints.length; i++) {
        resultPoints[i].x = cX + (resultPoints[i].x - cX) * factor;
        resultPoints[i].y = cY + (resultPoints[i].y - cY) * factor;
      }
    }

    return { points: resultPoints, color, fillColor, width, cornerRoundness, cornerRadii };
  }

  let ACTUAL_TARGET_COUNT = targetCount; 
  const maxPts = Math.max(...activeKeyframes.map(k => k.points!.length));

  if (mode === 'points' || mode === 'spline' || mode === 'length') {
      ACTUAL_TARGET_COUNT = maxPts;
  }

  // 4. Reference Selection
  const referenceKeyframe = activeKeyframes.reduce((prev, current) => {
      return (prev.weight >= current.weight) ? prev : current;
  });
  
  const referenceStroke = referenceKeyframe.points!;
  const isClosed = false; 

  // Resample Reference
  let referenceResampled: Point[];
  if (mode === 'points' || mode === 'spline') {
      referenceResampled = upsamplePreservingCorners(referenceStroke, ACTUAL_TARGET_COUNT);
  } else {
      referenceResampled = resamplePoints(referenceStroke, ACTUAL_TARGET_COUNT);
  }

  const resultPoints: Point[] = [];

  for (let i = 0; i < ACTUAL_TARGET_COUNT; i++) {
      let x = 0;
      let y = 0;
      let pressure = 0;
      let totalWeight = 0;

      for (const kf of activeKeyframes) {
          const rawPoints = kf.points!;
          let processedPoints: Point[] = [];

          if (mode === 'points' || mode === 'spline') {
             if (rawPoints.length === ACTUAL_TARGET_COUNT) {
                 processedPoints = rawPoints;
             } else {
                 processedPoints = upsamplePreservingCorners(rawPoints, ACTUAL_TARGET_COUNT);
             }
          } else {
             processedPoints = resamplePoints(rawPoints, ACTUAL_TARGET_COUNT);
          }

          // STRICT LINEAR ALIGNMENT (isClosed is always false)
          const alignedPoints = alignPoints(referenceResampled, processedPoints, isClosed);
          
          const pt = alignedPoints[i];

          x += pt.x * kf.weight;
          y += pt.y * kf.weight;
          pressure += (pt.pressure || 0.5) * Math.max(0, kf.weight);
          totalWeight += kf.weight;
      }

      if (Math.abs(totalWeight) > 0.0001) {
          resultPoints.push({
              x: x / totalWeight,
              y: y / totalWeight,
              pressure: pressure / (activeKeyframes.reduce((sum, k) => sum + Math.max(0, k.weight), 0) || 1)
          });
      }
  }

  // Option C (Geometric Overshoot): Exaggeration / Shape Extrusion
  if (overshootOptions?.exaggerationEnabled && overshootOptions.exaggerationFactor && overshootOptions.exaggerationFactor !== 1.0 && resultPoints.length > 0) {
      const factor = overshootOptions.exaggerationFactor;
      let cX = 0, cY = 0;
      for (const p of resultPoints) {
          cX += p.x;
          cY += p.y;
      }
      cX /= resultPoints.length;
      cY /= resultPoints.length;

      for (let i = 0; i < resultPoints.length; i++) {
          resultPoints[i].x = cX + (resultPoints[i].x - cX) * factor;
          resultPoints[i].y = cY + (resultPoints[i].y - cY) * factor;
      }
  }

  return { points: resultPoints, color, fillColor, width, cornerRoundness, cornerRadii };
};

// --- OPTIMIZATION & SMOOTHING ---

const perpendicularDistance = (point: Point, lineStart: Point, lineEnd: Point): number => {
  let dx = lineEnd.x - lineStart.x;
  let dy = lineEnd.y - lineStart.y;
  const mag = Math.sqrt(dx * dx + dy * dy);
  if (mag > 0.0) { dx /= mag; dy /= mag; }
  const pvx = point.x - lineStart.x;
  const pvy = point.y - lineStart.y;
  const pvdot = pvx * dx + pvy * dy;
  const dsx = pvdot * dx;
  const dsy = pvdot * dy;
  const ax = pvx - dsx;
  const ay = pvy - dsy;
  return Math.sqrt(ax * ax + ay * ay);
};

export const simplifyPoints = (points: Point[], epsilon: number = 2): Point[] => {
  if (points.length < 3) return points;
  let dmax = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > dmax) { index = i; dmax = d; }
  }
  if (dmax > epsilon) {
    const recResults1 = simplifyPoints(points.slice(0, index + 1), epsilon);
    const recResults2 = simplifyPoints(points.slice(index, end + 1), epsilon);
    return [...recResults1.slice(0, -1), ...recResults2];
  } else {
    return [points[0], points[end]];
  }
};

export const simplifyCollinearPoints = (points: Point[], epsilon: number = 0.5): Point[] => {
  if (points.length < 3) return points;
  const result = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const next = points[i + 1];
    
    // Check Collinearity using Cross Product
    // The "epsilon" here acts as an area check.
    const val = (curr.y - prev.y) * (next.x - curr.x) - (curr.x - prev.x) * (next.y - curr.y);
    
    // Check if point is very close to previous (Micro-segment removal)
    const dist = distance(curr, prev);

    // Keep point ONLY if it is significant
    if (Math.abs(val) > epsilon && dist > 1.0) {
       result.push(curr);
    }
  }
  result.push(points[points.length - 1]);
  return result;
};

export const chaikinSmooth = (points: Point[], iterations: number = 2): Point[] => {
    if (points.length < 3) return points;
    let output = [...points];
    for (let i = 0; i < iterations; i++) {
        const next: Point[] = [];
        next.push(output[0]);
        for (let j = 0; j < output.length - 1; j++) {
            const p0 = output[j];
            const p1 = output[j + 1];
            next.push({
                x: 0.75 * p0.x + 0.25 * p1.x,
                y: 0.75 * p0.y + 0.25 * p1.y,
                pressure: lerp(p0.pressure || 0.5, p1.pressure || 0.5, 0.25)
            });
            next.push({
                x: 0.25 * p0.x + 0.75 * p1.x,
                y: 0.25 * p0.y + 0.75 * p1.y,
                pressure: lerp(p0.pressure || 0.5, p1.pressure || 0.5, 0.75)
            });
        }
        next.push(output[output.length - 1]);
        output = next;
    }
    return output;
};

// --- RENDERERS ---

/**
 * Draws a 4-vertex rectangle/quad with independent corner radii (or uniform corner roundness)
 * without shrinking the outer dimensions of the shape.
 * Works seamlessly from a 0-radius sharp rectangle to rounded rectangle to a perfect circle/pill.
 */
export const drawRoundedRectangle = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  cornerRadii?: CornerRadii,
  cornerRoundness?: number
) => {
  if (points.length < 4) return;
  const p0 = points[0];
  const p1 = points[1];
  const p2 = points[2];
  const p3 = points[3];

  const w = distance(p0, p1);
  const h = distance(p1, p2);
  if (w < 0.1 || h < 0.1) return;

  const maxR = Math.min(w, h) / 2;

  let tl = 0, tr = 0, br = 0, bl = 0;
  if (cornerRadii) {
    tl = Math.max(0, Math.min(cornerRadii.topLeft ?? 0, maxR));
    tr = Math.max(0, Math.min(cornerRadii.topRight ?? 0, maxR));
    br = Math.max(0, Math.min(cornerRadii.bottomRight ?? 0, maxR));
    bl = Math.max(0, Math.min(cornerRadii.bottomLeft ?? 0, maxR));
  } else if (cornerRoundness !== undefined && cornerRoundness > 0) {
    const r = maxR * (Math.min(100, Math.max(0, cornerRoundness)) / 100);
    tl = tr = br = bl = r;
  }

  // Scale down if adjacent radii sum exceeds edge length
  if (tl + tr > w && (tl + tr) > 0) { const f = w / (tl + tr); tl *= f; tr *= f; }
  if (bl + br > w && (bl + br) > 0) { const f = w / (bl + br); bl *= f; br *= f; }
  if (tl + bl > h && (tl + bl) > 0) { const f = h / (tl + bl); tl *= f; bl *= f; }
  if (tr + br > h && (tr + br) > 0) { const f = h / (tr + br); tr *= f; br *= f; }

  // Unit direction vectors along edges
  const u01 = { x: (p1.x - p0.x) / w, y: (p1.y - p0.y) / w };
  const u12 = { x: (p2.x - p1.x) / h, y: (p2.y - p1.y) / h };
  const u23 = { x: (p3.x - p2.x) / w, y: (p3.y - p2.y) / w };
  const u30 = { x: (p0.x - p3.x) / h, y: (p0.y - p3.y) / h };

  ctx.beginPath();
  ctx.moveTo(p0.x + u01.x * tl, p0.y + u01.y * tl);
  ctx.lineTo(p1.x - u01.x * tr, p1.y - u01.y * tr);
  ctx.arcTo(p1.x, p1.y, p2.x, p2.y, tr);
  ctx.lineTo(p2.x - u12.x * br, p2.y - u12.y * br);
  ctx.arcTo(p2.x, p2.y, p3.x, p3.y, br);
  ctx.lineTo(p3.x - u23.x * bl, p3.y - u23.y * bl);
  ctx.arcTo(p3.x, p3.y, p0.x, p0.y, bl);
  ctx.lineTo(p0.x - u30.x * tl, p0.y - u30.y * tl);
  ctx.arcTo(p0.x, p0.y, p1.x, p1.y, tl);
  ctx.closePath();
};

export const drawCornerRoundedPath = (ctx: CanvasRenderingContext2D, uniquePoints: Point[], roundness: number) => {
    // TOPOLOGY PRESERVATION:
    // We assume 'uniquePoints' coming from the interpolator has the correct vertices.
    if (uniquePoints.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(uniquePoints[0].x, uniquePoints[0].y);

    if (uniquePoints.length === 2 || roundness <= 0) {
        for (let i = 1; i < uniquePoints.length; i++) {
            ctx.lineTo(uniquePoints[i].x, uniquePoints[i].y);
        }
        return;
    }

    const len = uniquePoints.length;
    for (let i = 1; i < len - 1; i++) {
        const curr = uniquePoints[i];
        const prev = uniquePoints[i - 1];
        const next = uniquePoints[i + 1];
        
        const len1 = distance(prev, curr);
        const len2 = distance(curr, next);
        
        // Microscopic segment protection
        if (len1 < 0.1 || len2 < 0.1) {
            ctx.lineTo(curr.x, curr.y);
            continue;
        }
        
        const u1x = (prev.x - curr.x) / len1;
        const u1y = (prev.y - curr.y) / len1;
        const u2x = (next.x - curr.x) / len2;
        const u2y = (next.y - curr.y) / len2;
        
        // Tangent offset along each segment (at most 48% of segment length)
        const maxT = Math.min(len1, len2) * 0.48;
        const clampedRoundness = Math.min(100, Math.max(0, roundness));
        const T = maxT * (clampedRoundness / 100);
        
        if (T < 0.1) {
            ctx.lineTo(curr.x, curr.y);
            continue;
        }

        const pStart = { x: curr.x + u1x * T, y: curr.y + u1y * T };
        const pEnd = { x: curr.x + u2x * T, y: curr.y + u2y * T };

        ctx.lineTo(pStart.x, pStart.y);
        ctx.quadraticCurveTo(curr.x, curr.y, pEnd.x, pEnd.y);
    }

    // Always Open End (no closePath)
    ctx.lineTo(uniquePoints[len - 1].x, uniquePoints[len - 1].y);
};

export const drawCatmullRomSpline = (ctx: CanvasRenderingContext2D, points: Point[], tension: number = 0.5) => {
    if (points.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    const len = points.length;
    // FORCED OPEN TOPOLOGY
    // We strictly follow point list. No auto-closing.
    const isClosed = false;
    
    for (let i = 0; i < len - 1; i++) {
        const p0 = i > 0 ? points[i - 1] : points[0];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = i < len - 2 ? points[i + 2] : points[len - 1];

        // Loop logic removed/disabled via isClosed=false constant
        // Fallback to clamping for start/end control points
        const p0_loop = p0;
        const p3_loop = p3;

        const cp1x = p1.x + (p2.x - p0_loop.x) / 6 * tension;
        const cp1y = p1.y + (p2.y - p0_loop.y) / 6 * tension;
        const cp2x = p2.x - (p3_loop.x - p1.x) / 6 * tension;
        const cp2y = p2.y - (p3_loop.y - p1.y) / 6 * tension;

        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
};

// --- SYMMETRY HELPERS ---

/**
 * Calculates transformed/mirrored point arrays for symmetry rendering and creation.
 */
export const getSymmetricPoints = (
  points: Point[],
  type: SymmetryType,
  axisX: number,
  axisY: number,
  radialCount: number = 4
): Point[][] => {
  if (points.length === 0) return [];

  const results: Point[][] = [];

  if (type === 'vertical') {
    results.push(
      points.map(p => ({
        x: 2 * axisX - p.x,
        y: p.y,
        pressure: p.pressure
      }))
    );
  } else if (type === 'horizontal') {
    results.push(
      points.map(p => ({
        x: p.x,
        y: 2 * axisY - p.y,
        pressure: p.pressure
      }))
    );
  } else if (type === 'quad') {
    // 1. Mirror Horizontal (across vertical axisX)
    results.push(
      points.map(p => ({
        x: 2 * axisX - p.x,
        y: p.y,
        pressure: p.pressure
      }))
    );
    // 2. Mirror Vertical (across horizontal axisY)
    results.push(
      points.map(p => ({
        x: p.x,
        y: 2 * axisY - p.y,
        pressure: p.pressure
      }))
    );
    // 3. Mirror Both (opposite quadrant)
    results.push(
      points.map(p => ({
        x: 2 * axisX - p.x,
        y: 2 * axisY - p.y,
        pressure: p.pressure
      }))
    );
  } else if (type === 'radial') {
    const count = Math.max(2, Math.min(12, radialCount));
    const center = { x: axisX, y: axisY };
    for (let k = 1; k < count; k++) {
      const angle = (k * 2 * Math.PI) / count;
      results.push(points.map(p => rotatePoint(p, center, angle)));
    }
  }

  return results;
};

/**
 * Merges original and mirrored points into one continuous contour path.
 * For vertical symmetry, it connects the drawn half with the mirrored half seamlessly.
 */
export const getUnifiedSymmetricContour = (
  points: Point[],
  type: SymmetryType,
  axisX: number,
  axisY: number
): Point[] => {
  if (points.length < 2) return points;

  const SNAP_THRESHOLD = 16; // Snap to axis if close enough

  if (type === 'vertical') {
    // Clone points with optional axis snap on start and end
    const raw = points.map((p, idx) => {
      if ((idx === 0 || idx === points.length - 1) && Math.abs(p.x - axisX) < SNAP_THRESHOLD) {
        return { ...p, x: axisX };
      }
      return p;
    });

    // Mirrored points in reverse order to smoothly connect at the opposite end
    const mirroredRev = [...raw]
      .reverse()
      .map(p => ({
        x: 2 * axisX - p.x,
        y: p.y,
        pressure: p.pressure
      }));

    // Avoid duplicate point at meeting seam
    const lastRaw = raw[raw.length - 1];
    const firstMirrored = mirroredRev[0];
    if (distance(lastRaw, firstMirrored) < 1.0) {
      mirroredRev.shift();
    }

    return [...raw, ...mirroredRev];
  } else if (type === 'horizontal') {
    const raw = points.map((p, idx) => {
      if ((idx === 0 || idx === points.length - 1) && Math.abs(p.y - axisY) < SNAP_THRESHOLD) {
        return { ...p, y: axisY };
      }
      return p;
    });

    const mirroredRev = [...raw]
      .reverse()
      .map(p => ({
        x: p.x,
        y: 2 * axisY - p.y,
        pressure: p.pressure
      }));

    const lastRaw = raw[raw.length - 1];
    const firstMirrored = mirroredRev[0];
    if (distance(lastRaw, firstMirrored) < 1.0) {
      mirroredRev.shift();
    }

    return [...raw, ...mirroredRev];
  }

  return points;
};

// ==========================================
// --- SHAPE GENERATION & FIGMA MANIPULATION ---
// ==========================================

/**
 * Generates the clean fixed-topology 5-point boundary vertices for a rectangle.
 * (Top-Left, Top-Right, Bottom-Right, Bottom-Left, Top-Left)
 * All roundness is rendered dynamically via drawRoundedRectangle, preserving
 * the exact 4-corner topology for flawless interpolation and zero resizing artifacts.
 */
export const generateRectanglePoints = (
  x: number,
  y: number,
  width: number,
  height: number,
  _radii: CornerRadii = { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
  rotationRad: number = 0,
  _targetPointCount: number = 5
): Point[] => {
  const w = Math.abs(width);
  const h = Math.abs(height);
  if (w < 1 || h < 1) return [];

  const minX = Math.min(x, x + width);
  const minY = Math.min(y, y + height);
  const maxX = minX + w;
  const maxY = minY + h;

  let points: Point[] = [
    { x: minX, y: minY, pressure: 0.5 }, // Top-Left
    { x: maxX, y: minY, pressure: 0.5 }, // Top-Right
    { x: maxX, y: maxY, pressure: 0.5 }, // Bottom-Right
    { x: minX, y: maxY, pressure: 0.5 }, // Bottom-Left
    { x: minX, y: minY, pressure: 0.5 }  // Close Loop
  ];

  if (rotationRad !== 0) {
    const center = { x: minX + w / 2, y: minY + h / 2 };
    points = points.map(p => rotatePoint(p, center, rotationRad));
  }

  return points;
};

/**
 * Generates the 5 boundary vertices for an ellipse/circle bounding box.
 * Shared topology with rectangles so rectangle-to-circle morphing is 100% isomorphic.
 */
export const generateEllipsePoints = (
  x: number,
  y: number,
  width: number,
  height: number,
  rotationRad: number = 0,
  _targetPointCount: number = 5
): Point[] => {
  return generateRectanglePoints(x, y, width, height, undefined, rotationRad);
};

/**
 * Generates vertices for a regular polygon (Triangle, Pentagon, Hexagon, etc.)
 */
export const generatePolygonPoints = (
  x: number,
  y: number,
  width: number,
  height: number,
  sides: number = 5,
  rotationRad: number = 0,
  _targetPointCount: number = 200
): Point[] => {
  const w = Math.abs(width);
  const h = Math.abs(height);
  if (w < 1 || h < 1) return [];

  const minX = Math.min(x, x + width);
  const minY = Math.min(y, y + height);
  const rx = w / 2;
  const ry = h / 2;
  const cx = minX + rx;
  const cy = minY + ry;

  const numSides = Math.max(3, sides);
  const vertices: Point[] = [];

  // Starting at top (-PI/2)
  for (let i = 0; i < numSides; i++) {
    const theta = -Math.PI / 2 + (i / numSides) * Math.PI * 2;
    const px = cx + rx * Math.cos(theta);
    const py = cy + ry * Math.sin(theta);
    let p: Point = { x: px, y: py, pressure: 0.5 };
    if (rotationRad !== 0) {
      p = rotatePoint(p, { x: cx, y: cy }, rotationRad);
    }
    vertices.push(p);
  }
  vertices.push(vertices[0]); // close loop

  return vertices;
};

/**
 * Generates points for any supported ShapeConfig with clean low-poly fixed topology.
 */
export const generateShapePoints = (
  config: ShapeConfig,
  _targetPointCount: number = 5
): Point[] => {
  const rotation = config.rotation || 0;
  const startX = config.minX ?? config.x ?? 0;
  const startY = config.minY ?? config.y ?? 0;

  switch (config.type) {
    case 'ellipse':
      return generateEllipsePoints(startX, startY, config.width, config.height, rotation);
    case 'polygon':
      return generatePolygonPoints(startX, startY, config.width, config.height, config.sides || 5, rotation);
    case 'rectangle':
    default:
      return generateRectanglePoints(
        startX,
        startY,
        config.width,
        config.height,
        config.cornerRadii || { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
        rotation
      );
  }
};

/**
 * Calculates corner handle positions for interactive Figma-style dragging on Canvas.
 */
export const getCornerHandlePositions = (
  bounds: { minX: number; minY: number; width: number; height: number; rotation?: number },
  radii: CornerRadii = { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 }
): { corner: keyof CornerRadii; x: number; y: number }[] => {
  const { minX, minY, width, height, rotation = 0 } = bounds;
  const maxR = Math.min(width, height) / 2;

  // Offset distance inside each corner (smoothly moving from minInset at r=0 to maxR at r=maxR)
  const minInset = Math.min(14, maxR * 0.4);
  const getOffset = (r: number) => {
    const clampedR = Math.max(0, Math.min(maxR, r || 0));
    const t = maxR > 0 ? clampedR / maxR : 0;
    return minInset * (1 - t) + maxR * t;
  };

  const center = { x: minX + width / 2, y: minY + height / 2 };

  const rawHandles: { corner: keyof CornerRadii; x: number; y: number }[] = [
    { corner: 'topLeft', x: minX + getOffset(radii.topLeft), y: minY + getOffset(radii.topLeft) },
    { corner: 'topRight', x: minX + width - getOffset(radii.topRight), y: minY + getOffset(radii.topRight) },
    { corner: 'bottomRight', x: minX + width - getOffset(radii.bottomRight), y: minY + height - getOffset(radii.bottomRight) },
    { corner: 'bottomLeft', x: minX + getOffset(radii.bottomLeft), y: minY + height - getOffset(radii.bottomLeft) },
  ];

  if (rotation !== 0) {
    return rawHandles.map(h => {
      const rot = rotatePoint({ x: h.x, y: h.y }, center, rotation);
      return { corner: h.corner, x: rot.x, y: rot.y };
    });
  }

  return rawHandles;
};

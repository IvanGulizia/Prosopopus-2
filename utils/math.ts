// utils/math.ts
import { Point, Stroke, InterpolationStrategy } from '../types';

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
  keyframes: { id: string; axisValues: Record<string, number> }[]
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
      if (val <= grid[0]) return { lower: grid[0], upper: grid[0], t: 0 };
      if (val >= grid[grid.length - 1]) return { lower: grid[grid.length - 1], upper: grid[grid.length - 1], t: 0 };
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
      if (c.wBase <= 0.0001) return;
      const cornerComposition = resolveCornerWeights(c.x, c.y);
      for (const kfId in cornerComposition) {
          weights[kfId] = (weights[kfId] || 0) + (cornerComposition[kfId] * c.wBase);
      }
  });

  return weights;
};

const calculateIDWWeights = (currentAxes: Record<string, number>, keyframes: { id: string; axisValues: Record<string, number> }[], exponent: number) => {
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

export const calculateInterpolationWeights = (
  currentAxes: Record<string, number>,
  keyframes: { id: string; axisValues: Record<string, number> }[],
  exponent: number = 2,
  strategy: InterpolationStrategy = 'bilinear-grid'
): Record<string, number> => {
   if (keyframes.length === 0) return {};
   if (keyframes.length === 1) return { [keyframes[0].id]: 1.0 };
   if (strategy === 'bilinear-grid') return calculateBilinearGridWeights(currentAxes, keyframes);
   return calculateIDWWeights(currentAxes, keyframes, exponent);
};

// --- CORE INTERPOLATION ENGINE ---

export const interpolateStrokePoints = (
  strokeId: string,
  basePoints: Point[], 
  keyframesData: { weight: number; points: Point[] | undefined, style: Stroke | undefined, color: string, fillColor: string, width: number }[],
  mode: 'resample' | 'points' | 'spline' = 'resample',
  targetCount: number = 200 
): { points: Point[], color: string, fillColor: string, width: number } => {
  
  // 1. Filter active keyframes
  const activeKeyframes = keyframesData.filter(k => k.weight > 0.0001 && k.points && k.points.length > 0);
  if (activeKeyframes.length === 0) return { points: [], color: 'rgba(0,0,0,0)', fillColor: 'none', width: 1 };

  // 2. Mix Properties
  const color = mixColors(activeKeyframes.map(k => ({ color: k.color, weight: k.weight })));
  const fillColor = mixColors(activeKeyframes.map(k => ({ color: k.fillColor, weight: k.weight })));
  
  let totalWidth = 0;
  let widthWeightDivisor = 0;
  activeKeyframes.forEach(k => {
      totalWidth += k.width * k.weight;
      widthWeightDivisor += k.weight;
  });
  const width = widthWeightDivisor > 0 ? totalWidth / widthWeightDivisor : 1;

  // 3. Point Count Calculation
  let ACTUAL_TARGET_COUNT = targetCount; 
  const maxPts = Math.max(...activeKeyframes.map(k => k.points!.length));

  if (mode === 'points' || mode === 'spline') {
      ACTUAL_TARGET_COUNT = maxPts;
  }

  // 4. Reference Selection
  const referenceKeyframe = activeKeyframes.reduce((prev, current) => {
      return (prev.weight >= current.weight) ? prev : current;
  });
  
  const referenceStroke = referenceKeyframe.points!;
  
  // We NO LONGER check for closure to switch algorithms.
  // The algorithm is now ALWAYS Linear.
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
          pressure += (pt.pressure || 0.5) * kf.weight;
          totalWeight += kf.weight;
      }

      if (totalWeight > 0) {
          resultPoints.push({
              x: x / totalWeight,
              y: y / totalWeight,
              pressure: pressure / totalWeight
          });
      }
  }

  return { points: resultPoints, color, fillColor, width };
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

export const drawCornerRoundedPath = (ctx: CanvasRenderingContext2D, uniquePoints: Point[], roundness: number) => {
    // 1. TOPOLOGY PRESERVATION:
    // We do NOT filter points here based on distance. 
    // We assume 'uniquePoints' coming from the interpolator has the correct number of vertices 
    // needed for the animation state. Removing points here would cause "jumps".
    if (uniquePoints.length < 2) return;

    ctx.beginPath();
    
    // Always Open Logic
    ctx.moveTo(uniquePoints[0].x, uniquePoints[0].y);

    const len = uniquePoints.length;
    // Standard linear path traversal
    const startIdx = 1;
    const endIdx = len - 1;

    for (let i = startIdx; i < endIdx; i++) {
        const curr = uniquePoints[i];
        
        // No wrapping indices needed since we are strictly linear
        const prev = uniquePoints[i-1];
        const next = uniquePoints[i+1];
        
        const len1 = distance(prev, curr);
        const len2 = distance(curr, next);
        
        // 2. PHANTOM LINE & ZERO-LENGTH PROTECTION:
        // If a segment is microscopic (e.g. overlapping points created by user for "pauses"),
        // we MUST NOT attempt to round it, otherwise arcTo() math explodes and creates lines to infinity.
        // We just draw a straight line to the point (which is visually effectively 0 length).
        if (len1 < 0.1 || len2 < 0.1) {
            ctx.lineTo(curr.x, curr.y);
            continue;
        }
        
        const v1x = curr.x - prev.x; const v1y = curr.y - prev.y;
        const v2x = next.x - curr.x; const v2y = next.y - curr.y;
        const n1x = v1x/len1; const n1y = v1y/len1;
        const n2x = v2x/len2; const n2y = v2y/len2;
        const dot = n1x * n2x + n1y * n2y;
        
        // 3. COLLINEAR PROTECTION:
        // If points are perfectly aligned, arcTo() radius becomes infinite.
        if (dot > 0.99) {
             ctx.lineTo(curr.x, curr.y);
             continue;
        }
        
        const maxTangent = Math.min(len1, len2) * 0.5;
        const currentTangent = maxTangent * (roundness / 100);
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        const innerAngle = Math.PI - angle;
        const radius = currentTangent * Math.tan(innerAngle / 2);
        
        // 4. RADIUS SAFETY:
        // Ensure radius is valid and doesn't exceed geometric limits
        if (radius < 0.05 || isNaN(radius)) {
             ctx.lineTo(curr.x, curr.y);
             continue;
        }

        ctx.arcTo(curr.x, curr.y, next.x, next.y, radius);
    }

    // Always Open End
    ctx.lineTo(uniquePoints[uniquePoints.length-1].x, uniquePoints[uniquePoints.length-1].y);
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
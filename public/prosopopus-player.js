/**
 * Prosopopus v2 - Standalone Player (Vanilla JS Bundle)
 * Autonomous rendering engine for Prosopopus vector interpolation projects.
 * Strictly parity-matched with the main studio Play Mode.
 */

// --- MATH UTILS ---

const distance = (p1, p2) => Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
const lerp = (start, end, t) => start * (1 - t) + end * t;

const rotatePoint = (p, center, angleRad) => {
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
      newPoints.push({
        x: lerp(points[i].x, points[i + 1].x, t),
        y: lerp(points[i].y, points[i + 1].y, t),
        pressure: lerp(points[i].pressure || 0.5, points[i + 1].pressure || 0.5, t)
      });
    }
  }
  newPoints.push(points[points.length - 1]);
  return newPoints;
};

// --- INTERPOLATION WEIGHTS ---

const calculateBilinearGridWeights = (currentAxes, keyframes, allowExtrapolation = true, extrapolationFactor = 0.2) => {
  const weights = {};
  const curX = currentAxes['axis-x'] || 0;
  const curY = currentAxes['axis-y'] || 0;
  const EPSILON = 0.005;

  const distinctCoords = (arr) => {
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

  const findInterval = (val, grid) => {
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
    const exact = keyframes.find(k => Math.abs((k.axisValues['axis-x'] || 0) - targetX) < EPSILON && Math.abs((k.axisValues['axis-y'] || 0) - targetY) < EPSILON);
    if (exact) return { [exact.id]: 1.0 };
    let totalW = 0;
    const cornerWeights = {};
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
    if (Math.abs(c.wBase) <= 0.0001) return;
    const cornerComposition = resolveCornerWeights(c.x, c.y);
    for (const kfId in cornerComposition) weights[kfId] = (weights[kfId] || 0) + (cornerComposition[kfId] * c.wBase);
  });

  return weights;
};

const calculateIDWWeights = (currentAxes, keyframes, exponent = 2, allowExtrapolation = false, extrapolationFactor = 0.2) => {
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

const calculateInterpolationWeights = (currentAxes, keyframes, exponent = 2, strategy = 'bilinear-grid', allowExtrapolation = true, extrapolationFactor = 0.2) => {
  if (keyframes.length === 0) return {};
  if (keyframes.length === 1) return { [keyframes[0].id]: 1.0 };
  return strategy === 'bilinear-grid'
    ? calculateBilinearGridWeights(currentAxes, keyframes, allowExtrapolation, extrapolationFactor)
    : calculateIDWWeights(currentAxes, keyframes, exponent, allowExtrapolation, extrapolationFactor);
};

// --- STROKE RESOLUTION & INTERPOLATION ---

const resolveStrokeStyle = (stroke, layer) => {
  const defaultStyle = { strokeColor: '#000000', strokeWidth: 4, fillColor: 'none', lineStyle: 'solid', cornerRoundness: 0 };
  const baseStyle = layer?.baseStyle || defaultStyle;
  if (!stroke || !stroke.style) return { ...baseStyle, cornerRoundness: baseStyle.cornerRoundness ?? defaultStyle.cornerRoundness };
  return {
    strokeColor: stroke.style.strokeColor ?? baseStyle.strokeColor,
    strokeWidth: stroke.style.strokeWidth ?? baseStyle.strokeWidth,
    fillColor: stroke.style.fillColor ?? baseStyle.fillColor,
    lineStyle: stroke.style.lineStyle ?? baseStyle.lineStyle,
    cornerRoundness: stroke.style.cornerRoundness ?? baseStyle.cornerRoundness ?? defaultStyle.cornerRoundness,
    cornerRadii: stroke.style.cornerRadii ?? baseStyle.cornerRadii,
    strokeCap: stroke.style.strokeCap ?? baseStyle.strokeCap,
    strokeResolution: stroke.style.strokeResolution ?? baseStyle.strokeResolution
  };
};

const interpolateStrokePoints = (
  strokeId,
  basePoints,
  keyframesData,
  mode = 'resample',
  targetCount = 200,
  overshootOptions = {}
) => {
  const activeKeyframes = keyframesData.filter(k => Math.abs(k.weight) > 0.0001 && k.points && k.points.length > 0);
  if (activeKeyframes.length === 0) return { points: [], color: 'rgba(0,0,0,0)', fillColor: 'none', width: 1, cornerRoundness: 0 };

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
  const cornerRadii = hasRadii && widthWeightDivisor > 0 ? {
    topLeft: totalTL / widthWeightDivisor,
    topRight: totalTR / widthWeightDivisor,
    bottomRight: totalBR / widthWeightDivisor,
    bottomLeft: totalBL / widthWeightDivisor
  } : undefined;

  const firstLen = activeKeyframes[0].points.length;
  const allSameLength = activeKeyframes.every(k => k.points.length === firstLen);

  // Low-poly topology fast path
  if (allSameLength && (firstLen <= 16 || mode === 'points')) {
    const resultPoints = [];
    for (let i = 0; i < firstLen; i++) {
      let x = 0, y = 0, pressure = 0, totalWeight = 0;
      for (const kf of activeKeyframes) {
        const pt = kf.points[i];
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
  const maxPts = Math.max(...activeKeyframes.map(k => k.points.length));
  if (mode === 'points' || mode === 'spline' || mode === 'length') ACTUAL_TARGET_COUNT = maxPts;

  const referenceKeyframe = activeKeyframes.reduce((prev, curr) => (prev.weight >= curr.weight ? prev : curr));
  const referenceStroke = referenceKeyframe.points;
  const referenceResampled = (mode === 'points' || mode === 'spline')
    ? upsamplePreservingCorners(referenceStroke, ACTUAL_TARGET_COUNT)
    : resamplePoints(referenceStroke, ACTUAL_TARGET_COUNT);

  const resultPoints = [];
  for (let i = 0; i < ACTUAL_TARGET_COUNT; i++) {
    let x = 0, y = 0, pressure = 0, totalWeight = 0;
    for (const kf of activeKeyframes) {
      const rawPoints = kf.points;
      let processedPoints = [];
      if (mode === 'points' || mode === 'spline') {
        processedPoints = rawPoints.length === ACTUAL_TARGET_COUNT ? rawPoints : upsamplePreservingCorners(rawPoints, ACTUAL_TARGET_COUNT);
      } else {
        processedPoints = resamplePoints(rawPoints, ACTUAL_TARGET_COUNT);
      }
      const pt = processedPoints[i];
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
};

// --- DRAWING RENDERERS ---

const drawRoundedRectangle = (ctx, points, cornerRadii, cornerRoundness) => {
  if (points.length < 4) return;
  const p0 = points[0], p1 = points[1], p2 = points[2], p3 = points[3];
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

  if (tl + tr > w && tl + tr > 0) { const f = w / (tl + tr); tl *= f; tr *= f; }
  if (bl + br > w && bl + br > 0) { const f = w / (bl + br); bl *= f; br *= f; }
  if (tl + bl > h && tl + bl > 0) { const f = h / (tl + bl); tl *= f; bl *= f; }
  if (tr + br > h && tr + br > 0) { const f = h / (tr + br); tr *= f; br *= f; }

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

const drawCornerRoundedPath = (ctx, uniquePoints, roundness) => {
  if (uniquePoints.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(uniquePoints[0].x, uniquePoints[0].y);

  if (uniquePoints.length === 2 || roundness <= 0) {
    for (let i = 1; i < uniquePoints.length; i++) ctx.lineTo(uniquePoints[i].x, uniquePoints[i].y);
    return;
  }

  const len = uniquePoints.length;
  for (let i = 1; i < len - 1; i++) {
    const curr = uniquePoints[i], prev = uniquePoints[i - 1], next = uniquePoints[i + 1];
    const len1 = distance(prev, curr), len2 = distance(curr, next);
    if (len1 < 0.1 || len2 < 0.1) { ctx.lineTo(curr.x, curr.y); continue; }

    const u1x = (prev.x - curr.x) / len1;
    const u1y = (prev.y - curr.y) / len1;
    const u2x = (next.x - curr.x) / len2;
    const u2y = (next.y - curr.y) / len2;

    const maxT = Math.min(len1, len2) * 0.48;
    const clampedRoundness = Math.min(100, Math.max(0, roundness));
    const T = maxT * (clampedRoundness / 100);

    if (T < 0.1) { ctx.lineTo(curr.x, curr.y); continue; }

    const pStart = { x: curr.x + u1x * T, y: curr.y + u1y * T };
    const pEnd = { x: curr.x + u2x * T, y: curr.y + u2y * T };

    ctx.lineTo(pStart.x, pStart.y);
    ctx.quadraticCurveTo(curr.x, curr.y, pEnd.x, pEnd.y);
  }

  ctx.lineTo(uniquePoints[len - 1].x, uniquePoints[len - 1].y);
};

const drawCatmullRomSpline = (ctx, points, tension = 0.5) => {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  const len = points.length;
  for (let i = 0; i < len - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[0];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i < len - 2 ? points[i + 2] : points[len - 1];

    const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension;
    const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension;
    const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension;
    const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
};

// --- SYMMETRY UTILS ---

const getSymmetricPoints = (points, type, axisX, axisY, radialCount = 4) => {
  if (points.length === 0) return [];
  const results = [];
  if (type === 'vertical') {
    results.push(points.map(p => ({ x: 2 * axisX - p.x, y: p.y, pressure: p.pressure })));
  } else if (type === 'horizontal') {
    results.push(points.map(p => ({ x: p.x, y: 2 * axisY - p.y, pressure: p.pressure })));
  } else if (type === 'quad') {
    results.push(points.map(p => ({ x: 2 * axisX - p.x, y: p.y, pressure: p.pressure })));
    results.push(points.map(p => ({ x: p.x, y: 2 * axisY - p.y, pressure: p.pressure })));
    results.push(points.map(p => ({ x: 2 * axisX - p.x, y: 2 * axisY - p.y, pressure: p.pressure })));
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

// --- PLAYER CLASS ---

export class ProsopopusPlayer {
  constructor(canvas, project) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D rendering context for canvas');
    this.ctx = ctx;
    this.project = project;

    const settings = project.settings || {};
    const cursorType = settings.playModeCursor || 'default';
    if (cursorType === 'crosshair') canvas.style.cursor = 'crosshair';
    else if (cursorType === 'none' || cursorType === 'dot') canvas.style.cursor = 'none';
    else canvas.style.cursor = 'default';

    const axisX = project.axes?.find(a => a.id === 'axis-x');
    const axisY = project.axes?.find(a => a.id === 'axis-y');
    const initX = axisX ? axisX.currentValue : 0.5;
    const initY = axisY ? axisY.currentValue : 0.5;
    this.currentAxes = { 'axis-x': initX, 'axis-y': initY };
    this.targetAxes = { 'axis-x': initX, 'axis-y': initY };
    this.velocity = { x: 0, y: 0 };
    this.pointerVelocity = { x: 0, y: 0 };
    this.lastPointerPos = { x: initX, y: initY };
    this.lastPointerTime = 0;

    this.vertexInertiaMap = new Map();
    this.lastTime = 0;
    this.animationFrameId = 0;
    this.isRunning = false;
    this.cleanupListeners = null;

    this.setupInteraction();
  }

  setProject(project) {
    this.project = project;
    this.vertexInertiaMap.clear();
    const settings = project.settings || {};
    const cursorType = settings.playModeCursor || 'default';
    if (cursorType === 'crosshair') this.canvas.style.cursor = 'crosshair';
    else if (cursorType === 'none' || cursorType === 'dot') this.canvas.style.cursor = 'none';
    else this.canvas.style.cursor = 'default';
  }

  setupInteraction() {
    const handleMove = (clientX, clientY) => {
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const rawNormX = (clientX - rect.left) / rect.width;
      const rawNormY = (clientY - rect.top) / rect.height;

      const now = performance.now();
      const dt = Math.max(0.005, (now - (this.lastPointerTime || now)) / 1000);
      this.lastPointerTime = now;

      const deltaX = rawNormX - this.lastPointerPos.x;
      const deltaY = rawNormY - this.lastPointerPos.y;
      this.lastPointerPos = { x: rawNormX, y: rawNormY };

      const instantVelX = deltaX / dt;
      const instantVelY = deltaY / dt;
      this.pointerVelocity.x = this.pointerVelocity.x * 0.4 + instantVelX * 0.6;
      this.pointerVelocity.y = this.pointerVelocity.y * 0.4 + instantVelY * 0.6;

      const settings = this.project.settings || {};
      const padding = settings.axisMatrixPadding ?? 0;
      const minX = Math.max(0, padding);
      const maxX = Math.min(1, 1 - padding);
      const minY = Math.max(0, padding);
      const maxY = Math.min(1, 1 - padding);

      let processedX = rawNormX;
      let processedY = rawNormY;

      if (settings.overshootRubberbandEnabled) {
        const factor = settings.overshootRubberbandFactor ?? 0.35;
        if (processedX < minX) {
          const overflow = minX - processedX;
          processedX = minX - (overflow * factor);
        } else if (processedX > maxX) {
          const overflow = processedX - maxX;
          processedX = maxX + (overflow * factor);
        }

        if (processedY < minY) {
          const overflow = minY - processedY;
          processedY = minY - (overflow * factor);
        } else if (processedY > maxY) {
          const overflow = processedY - maxY;
          processedY = maxY + (overflow * factor);
        }

        processedX = Math.max(0, Math.min(1, processedX));
        processedY = Math.max(0, Math.min(1, processedY));
      } else {
        processedX = Math.max(minX, Math.min(maxX, processedX));
        processedY = Math.max(minY, Math.min(maxY, processedY));
      }

      if (settings.snapPlayMode) {
        const effectiveSizeX = maxX - minX;
        const effectiveSizeY = maxY - minY;
        if (effectiveSizeX > 0 && effectiveSizeY > 0) {
          const divisions = (settings.axisMatrixDivisions && settings.axisMatrixDivisions > 1)
            ? settings.axisMatrixDivisions - 1
            : 10;
          const relX = (processedX - minX) / effectiveSizeX;
          const relY = (processedY - minY) / effectiveSizeY;
          const snappedRelX = Math.round(relX * divisions) / divisions;
          const snappedRelY = Math.round(relY * divisions) / divisions;
          processedX = minX + (snappedRelX * effectiveSizeX);
          processedY = minY + (snappedRelY * effectiveSizeY);
        }
      }

      if (settings.overshootMomentumEnabled) {
        const momentumMult = (settings.overshootMomentumFactor ?? 0.4) * 0.15;
        processedX += this.pointerVelocity.x * momentumMult;
        processedY += this.pointerVelocity.y * momentumMult;
        processedX = Math.max(0, Math.min(1, processedX));
        processedY = Math.max(0, Math.min(1, processedY));
      }

      this.targetAxes['axis-x'] = processedX;
      this.targetAxes['axis-y'] = processedY;
    };

    const onPointerMove = (e) => handleMove(e.clientX, e.clientY);
    const onTouchMove = (e) => {
      if (e.touches && e.touches.length > 0) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const onMouseMove = (e) => handleMove(e.clientX, e.clientY);

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('mousemove', onMouseMove, { passive: true });

    this.cleanupListeners = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.animationFrameId = requestAnimationFrame(this.loop.bind(this));
  }

  stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }
  }

  destroy() {
    this.stop();
    if (this.cleanupListeners) {
      this.cleanupListeners();
      this.cleanupListeners = null;
    }
    this.vertexInertiaMap.clear();
  }

  loop(time) {
    if (!this.isRunning) return;
    if (!this.lastTime) this.lastTime = time;
    const dt = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    this.updatePhysics(dt);
    this.render(dt);

    this.animationFrameId = requestAnimationFrame(this.loop.bind(this));
  }

  updatePhysics(dt) {
    const settings = this.project.settings || {};
    const targetX = this.targetAxes['axis-x'] ?? 0.5;
    const targetY = this.targetAxes['axis-y'] ?? 0.5;

    if (settings.playModePhysics) {
      const stiffness = settings.springStiffness || 120;
      let damping = settings.springDamping || 20;

      if (settings.overshootBouncinessEnabled) {
        const bounciness = settings.overshootBounciness ?? 0.5;
        const criticalDamping = 2 * Math.sqrt(stiffness);
        const minDamping = criticalDamping * 0.15;
        const maxDamping = criticalDamping * 1.2;
        const targetUnderdamping = maxDamping - bounciness * (maxDamping - minDamping);
        damping = Math.min(damping, targetUnderdamping);
      }

      const forceX = (targetX - this.currentAxes['axis-x']) * stiffness - this.velocity.x * damping;
      const forceY = (targetY - this.currentAxes['axis-y']) * stiffness - this.velocity.y * damping;

      this.velocity.x += forceX * dt;
      this.velocity.y += forceY * dt;

      this.currentAxes['axis-x'] += this.velocity.x * dt;
      this.currentAxes['axis-y'] += this.velocity.y * dt;

      if (Math.abs(this.velocity.x) < 0.0001 && Math.abs(targetX - this.currentAxes['axis-x']) < 0.0001) {
        this.currentAxes['axis-x'] = targetX;
        this.velocity.x = 0;
      }
      if (Math.abs(this.velocity.y) < 0.0001 && Math.abs(targetY - this.currentAxes['axis-y']) < 0.0001) {
        this.currentAxes['axis-y'] = targetY;
        this.velocity.y = 0;
      }
    } else {
      this.currentAxes['axis-x'] = targetX;
      this.currentAxes['axis-y'] = targetY;
      this.velocity = { x: 0, y: 0 };
    }

    this.currentAxes['axis-x'] = Math.max(0, Math.min(1, this.currentAxes['axis-x']));
    this.currentAxes['axis-y'] = Math.max(0, Math.min(1, this.currentAxes['axis-y']));
  }

  render(dt) {
    const { canvas, ctx, project, currentAxes } = this;
    const settings = project.settings || {};
    const dpr = settings.resolutionScale || window.devicePixelRatio || 1;
    const w = project.canvasSize?.width || 800;
    const h = project.canvasSize?.height || 800;

    const baseResolution = settings.strokeResolution || 400;
    const interpolationTargetCount = settings.performanceMode
      ? Math.max(40, Math.min(120, Math.round(baseResolution * 0.35)))
      : baseResolution;

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    }

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = settings.theme?.canvasBg || '#ffffff';
    ctx.fillRect(0, 0, w, h);

    const allowExtrapolation = settings.overshootExtrapolationEnabled ?? true;
    const extrapolationFactor = settings.overshootExtrapolationFactor ?? 0.2;

    project.layers.forEach(layer => {
      if (!layer.visible) return;

      if (layer.isGuide) {
        // Guide / Reference layer: Render all strokes directly without interpolation
        const guideStrokes = (layer.guideStrokes && layer.guideStrokes.length > 0)
          ? layer.guideStrokes
          : (project.keyframes[0]?.layerStates.find(ls => ls.layerId === layer.id)?.strokes || []);

        guideStrokes.forEach(s => {
          if (!s || !s.points || s.points.length === 0) return;
          const resolved = resolveStrokeStyle(s, layer);
          ctx.beginPath();
          ctx.moveTo(s.points[0].x, s.points[0].y);
          for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
          if (s.closed) ctx.closePath();

          ctx.globalAlpha = layer.opacity;
          if (resolved.fillColor && resolved.fillColor !== 'none') {
            ctx.fillStyle = resolved.fillColor;
            ctx.fill();
          }
          if (resolved.strokeColor && resolved.strokeColor !== 'none') {
            ctx.lineCap = settings.strokeCap || 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = resolved.strokeColor;
            ctx.lineWidth = resolved.strokeWidth;
            ctx.stroke();
          }
          ctx.globalAlpha = 1.0;
        });
        return;
      }

      const layerRelevantKeyframes = project.keyframes.filter(kf => {
        const ls = kf.layerStates.find(s => s.layerId === layer.id);
        return ls && ls.strokes.length > 0;
      });

      if (layerRelevantKeyframes.length === 0) return;

      const weights = calculateInterpolationWeights(
        currentAxes,
        layerRelevantKeyframes,
        settings.interpolationExponent,
        settings.interpolationStrategy,
        allowExtrapolation,
        extrapolationFactor
      );

      const activeKeyframes = layerRelevantKeyframes
        .map(k => ({ ...k, weight: weights[k.id] || 0 }))
        .filter(k => Math.abs(k.weight) > 0.0001);

      const strokeId = `stroke-${layer.id}-unique`;

      const strokeData = activeKeyframes.map(kf => {
        const state = kf.layerStates.find(ls => ls.layerId === layer.id);
        const s = state?.strokes[0];
        const resolvedStyle = resolveStrokeStyle(s, layer);
        return {
          weight: kf.weight,
          points: s?.points,
          style: s,
          color: resolvedStyle.strokeColor,
          fillColor: resolvedStyle.fillColor,
          width: resolvedStyle.strokeWidth,
          cornerRoundness: resolvedStyle.cornerRoundness ?? 0,
          cornerRadii: resolvedStyle.cornerRadii
        };
      });

      const sortedByWeight = [...strokeData].sort((a, b) => b.weight - a.weight);
      const primaryStroke = sortedByWeight.find(sd => sd.style)?.style;
      if (!primaryStroke) return;

      let {
        points: interpolatedPoints,
        color: interpolatedColor,
        fillColor: interpolatedFill,
        width: interpolatedWidth,
        cornerRoundness: interpolatedCornerRoundness,
        cornerRadii: interpolatedCornerRadii
      } = interpolateStrokePoints(
        strokeId,
        primaryStroke.points,
        strokeData,
        layer.interpolationMode,
        interpolationTargetCount,
        {
          exaggerationEnabled: settings.overshootExaggerationEnabled,
          exaggerationFactor: settings.overshootExaggerationFactor ?? 1.25
        }
      );

      // Approach B: Dynamic Vertex Inertial Velocity / Jiggle (Disney Follow-Through)
      if (settings.overshootVertexInertiaEnabled && interpolatedPoints.length > 0) {
        const stiffness = (settings.overshootVertexInertiaFactor ?? 0.6) * 120.0;
        const damping = (settings.overshootVertexDamping ?? 0.75) * 35.0;
        const mass = Math.max(0.1, settings.overshootVertexMass ?? 1.0);
        const inertiaKey = `layer-${layer.id}`;
        let stored = this.vertexInertiaMap.get(inertiaKey);

        if (!stored || stored.current.length !== interpolatedPoints.length) {
          stored = {
            current: interpolatedPoints.map(p => ({ ...p })),
            velocity: interpolatedPoints.map(() => ({ x: 0, y: 0 }))
          };
          this.vertexInertiaMap.set(inertiaKey, stored);
        } else {
          const subSteps = 2;
          const subDt = Math.min(dt, 0.05) / subSteps;

          for (let step = 0; step < subSteps; step++) {
            for (let i = 0; i < interpolatedPoints.length; i++) {
              const targetPt = interpolatedPoints[i];
              const curPt = stored.current[i];
              const vel = stored.velocity[i];

              const springF_x = (targetPt.x - curPt.x) * stiffness - vel.x * damping;
              const springF_y = (targetPt.y - curPt.y) * stiffness - vel.y * damping;

              vel.x += (springF_x / mass) * subDt;
              vel.y += (springF_y / mass) * subDt;

              curPt.x += vel.x * subDt;
              curPt.y += vel.y * subDt;
              curPt.pressure = targetPt.pressure;
            }
          }
          interpolatedPoints = stored.current.map(p => ({ ...p }));
        }
      }

      if (interpolatedPoints.length > 0) {
        const layerSym = layer.symmetry?.enabled
          ? layer.symmetry
          : (settings.symmetryEnabled && settings.symmetryTarget !== 'merge')
          ? {
              enabled: true,
              type: settings.symmetryType || 'vertical',
              axisX: settings.symmetryAxisX ?? (w / 2),
              axisY: settings.symmetryAxisY ?? (h / 2),
              radialCount: settings.symmetryRadialCount || 4
            }
          : null;

        const allInterpolatedPaths = [interpolatedPoints];
        if (layerSym && layerSym.enabled) {
          const ax = layerSym.axisX ?? (w / 2);
          const ay = layerSym.axisY ?? (h / 2);
          const symVariants = getSymmetricPoints(
            interpolatedPoints,
            layerSym.type,
            ax,
            ay,
            layerSym.radialCount || 4
          );
          allInterpolatedPaths.push(...symVariants);
        }

        allInterpolatedPaths.forEach(pathPts => {
          if (pathPts.length === 0) return;

          const isRectangleShape = primaryStroke?.shapeConfig?.type === 'rectangle';

          if (layer.interpolationMode === 'spline') {
            drawCatmullRomSpline(ctx, pathPts, 0.5);
          } else if (isRectangleShape && (interpolatedCornerRadii || interpolatedCornerRoundness > 0)) {
            drawRoundedRectangle(ctx, pathPts, interpolatedCornerRadii, interpolatedCornerRoundness);
          } else {
            ctx.beginPath();
            if (interpolatedCornerRoundness > 0) {
              drawCornerRoundedPath(ctx, pathPts, interpolatedCornerRoundness);
            } else {
              ctx.moveTo(pathPts[0].x, pathPts[0].y);
              for (let i = 1; i < pathPts.length; i++) ctx.lineTo(pathPts[i].x, pathPts[i].y);
            }
          }

          ctx.globalAlpha = layer.opacity;
          switch (layer.blendMode) {
            case 'multiply': ctx.globalCompositeOperation = 'multiply'; break;
            case 'screen': ctx.globalCompositeOperation = 'screen'; break;
            case 'overlay': ctx.globalCompositeOperation = 'overlay'; break;
            case 'difference': ctx.globalCompositeOperation = 'difference'; break;
            case 'exclusion': ctx.globalCompositeOperation = 'exclusion'; break;
            default: ctx.globalCompositeOperation = 'source-over';
          }

          if (interpolatedFill && interpolatedFill !== 'none') {
            ctx.fillStyle = interpolatedFill;
            ctx.fill();
          }
          if (interpolatedColor && interpolatedColor !== 'none') {
            ctx.lineCap = settings.strokeCap || 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = interpolatedColor;
            ctx.lineWidth = interpolatedWidth;
            ctx.stroke();
          }
        });

        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'source-over';
      }
    });

    // Render custom dot/shape cursor if configured
    if (settings.playModeCursor === 'dot' && this.lastPointerPos) {
      const px = this.lastPointerPos.x * w;
      const py = this.lastPointerPos.y * h;
      const shape = settings.playModeCursorShape || 'circle';
      const size = settings.playModeCursorSize ?? 4;
      const color = settings.playModeCursorColor || '#000000';

      ctx.save();
      ctx.fillStyle = color;
      ctx.strokeStyle = color;

      if (shape === 'circle') {
        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.5, size / 2), 0, Math.PI * 2);
        ctx.fill();
      } else if (shape === 'square') {
        ctx.fillRect(px - size / 2, py - size / 2, size, size);
      } else if (shape === 'ring') {
        ctx.lineWidth = Math.max(1, size <= 6 ? 1 : 1.5);
        ctx.beginPath();
        ctx.arc(px, py, Math.max(1, size / 2), 0, Math.PI * 2);
        ctx.stroke();
      } else if (shape === 'cross') {
        const arm = Math.max(2, size / 2);
        ctx.lineWidth = Math.max(1, size <= 6 ? 1 : 1.5);
        ctx.beginPath();
        ctx.moveTo(px - arm, py);
        ctx.lineTo(px + arm, py);
        ctx.moveTo(px, py - arm);
        ctx.lineTo(px, py + arm);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}

// utils/animation.ts
import { AnimationTimeline, TimelineKeyframeMarker, EasingType, LayerTimelineTrack, LayerTimelineKeyframe, Stroke, Point, InterpolationMode, InteractionCollider, LoopMode, Layer } from '../types';
import { evaluateEasing } from './easing';
import { interpolateStrokePoints, distance, getBoundingBox } from './math';
import { resolveStrokeStyle } from './style';

/**
 * Calculates exact interpolated axis coordinates for an animation timeline at time t.
 */
export function evaluateTimelineAxes(animation: AnimationTimeline, time: number): Record<string, number> {
  const { markers, duration } = animation;
  if (!markers || markers.length === 0) {
    return { 'axis-x': 0.5, 'axis-y': 0.5 };
  }
  if (markers.length === 1) {
    return { ...markers[0].axisValues };
  }

  // Clamp time between 0 and duration
  const t = Math.max(0, Math.min(duration, time));

  // Find previous and next markers
  let prevMarker = markers[0];
  let nextMarker = markers[markers.length - 1];

  for (let i = 0; i < markers.length; i++) {
    if (markers[i].time <= t) {
      prevMarker = markers[i];
    }
  }

  for (let i = 0; i < markers.length; i++) {
    if (markers[i].time >= t) {
      nextMarker = markers[i];
      break;
    }
  }

  if (prevMarker.id === nextMarker.id || prevMarker.time === nextMarker.time) {
    return { ...prevMarker.axisValues };
  }

  const segmentDuration = Math.max(0.0001, nextMarker.time - prevMarker.time);
  const rawProgress = Math.max(0, Math.min(1, (t - prevMarker.time) / segmentDuration));
  const easedProgress = evaluateEasing(rawProgress, prevMarker.easing || 'easeInOut');

  const result: Record<string, number> = {};
  const allAxes = new Set([
    ...Object.keys(prevMarker.axisValues || {}),
    ...Object.keys(nextMarker.axisValues || {})
  ]);

  allAxes.forEach(axisKey => {
    const v0 = prevMarker.axisValues[axisKey] ?? 0.5;
    const v1 = nextMarker.axisValues[axisKey] ?? 0.5;
    result[axisKey] = v0 + (v1 - v0) * easedProgress;
  });

  return result;
}

/**
 * Evaluates the vector strokes of a Layer on a LayerTimelineTrack at time t.
 * Supports seamless loop interpolation from the last keyframe back to the first keyframe.
 */
export function evaluateLayerTimelineStrokes(
  track: LayerTimelineTrack,
  time: number,
  interpolationMode: InterpolationMode = 'resample',
  targetResolution: number = 200,
  loopMode: LoopMode = 'loop',
  duration: number = 2.0,
  layer?: Layer
): Stroke[] {
  const { keyframes } = track;
  if (!keyframes || keyframes.length === 0) {
    return [];
  }

  // Sort keyframes by time
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  if (sorted.length === 1) {
    return sorted[0].strokes || [];
  }

  const effectiveDuration = Math.max(0.1, duration);
  const t = loopMode === 'loop' ? (time % effectiveDuration + effectiveDuration) % effectiveDuration : Math.max(0, time);

  const firstKf = sorted[0];
  const lastKf = sorted[sorted.length - 1];

  let prevKf = firstKf;
  let nextKf = lastKf;
  let easedProgress = 0;

  if (loopMode === 'loop' && (t > lastKf.time || t < firstKf.time)) {
    // Seamless Loop Segment: interpolates from last keyframe back into the first keyframe
    const loopSpan = (firstKf.time + effectiveDuration) - lastKf.time;
    if (loopSpan > 0.0001) {
      const dt = t >= lastKf.time ? (t - lastKf.time) : (t + effectiveDuration - lastKf.time);
      const rawProgress = Math.max(0, Math.min(1, dt / loopSpan));
      easedProgress = evaluateEasing(rawProgress, lastKf.easing || 'easeInOut');
      prevKf = lastKf;
      nextKf = firstKf;
    } else {
      return lastKf.strokes || [];
    }
  } else {
    // If before first keyframe in non-loop mode
    if (t <= firstKf.time) {
      return firstKf.strokes || [];
    }

    // If after last keyframe in non-loop mode
    if (t >= lastKf.time) {
      return lastKf.strokes || [];
    }

    // Find bounding keyframes
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].time <= t) {
        prevKf = sorted[i];
      }
    }

    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].time >= t) {
        nextKf = sorted[i];
        break;
      }
    }

    if (prevKf.id === nextKf.id || prevKf.time === nextKf.time) {
      return prevKf.strokes || [];
    }

    const segmentDuration = Math.max(0.0001, nextKf.time - prevKf.time);
    const rawProgress = Math.max(0, Math.min(1, (t - prevKf.time) / segmentDuration));
    easedProgress = evaluateEasing(rawProgress, prevKf.easing || 'easeInOut');
  }

  const prevStrokes = prevKf.strokes || [];
  const nextStrokes = nextKf.strokes || [];

  const maxStrokes = Math.max(prevStrokes.length, nextStrokes.length);
  const resultStrokes: Stroke[] = [];

  for (let i = 0; i < maxStrokes; i++) {
    const strokeA = prevStrokes[i] || nextStrokes[i];
    const strokeB = nextStrokes[i] || prevStrokes[i];

    if (!strokeA && !strokeB) continue;
    if (!strokeA) { resultStrokes.push(strokeB); continue; }
    if (!strokeB) { resultStrokes.push(strokeA); continue; }

    const styleA = resolveStrokeStyle(strokeA, layer);
    const styleB = resolveStrokeStyle(strokeB, layer);

    const isRectA = strokeA.shapeConfig?.type === 'rectangle';
    const isRectB = strokeB.shapeConfig?.type === 'rectangle';
    const hasAnyRadii = Boolean(styleA.cornerRadii || styleB.cornerRadii || strokeA.shapeConfig?.cornerRadii || strokeB.shapeConfig?.cornerRadii);

    const radiiA = styleA.cornerRadii || strokeA.shapeConfig?.cornerRadii || (hasAnyRadii && isRectA ? { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 } : undefined);
    const radiiB = styleB.cornerRadii || strokeB.shapeConfig?.cornerRadii || (hasAnyRadii && isRectB ? { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 } : undefined);

    const keyframesData = [
      {
        weight: 1 - easedProgress,
        points: strokeA.points,
        style: strokeA,
        color: styleA.strokeColor || '#000000',
        fillColor: styleA.fillColor || 'none',
        width: styleA.strokeWidth ?? 2,
        cornerRoundness: styleA.cornerRoundness ?? 0,
        cornerRadii: radiiA
      },
      {
        weight: easedProgress,
        points: strokeB.points,
        style: strokeB,
        color: styleB.strokeColor || '#000000',
        fillColor: styleB.fillColor || 'none',
        width: styleB.strokeWidth ?? 2,
        cornerRoundness: styleB.cornerRoundness ?? 0,
        cornerRadii: radiiB
      }
    ];

    const interpolated = interpolateStrokePoints(
      strokeA.id || `${track.layerId}-temporal-${i}`,
      strokeA.points,
      keyframesData,
      interpolationMode,
      targetResolution
    );

    resultStrokes.push({
      id: strokeA.id || `${track.layerId}-stroke-${i}`,
      points: interpolated.points,
      closed: strokeA.closed ?? strokeB.closed ?? false,
      shapeConfig: (strokeA.shapeConfig || strokeB.shapeConfig) ? {
        ...(strokeA.shapeConfig || strokeB.shapeConfig),
        cornerRadii: interpolated.cornerRadii
      } : undefined,
      style: {
        ...(strokeA.style || {}),
        ...(strokeB.style || {}),
        strokeColor: interpolated.color,
        fillColor: interpolated.fillColor,
        strokeWidth: interpolated.width,
        cornerRoundness: interpolated.cornerRoundness,
        cornerRadii: interpolated.cornerRadii
      }
    });
  }

  return resultStrokes;
}

/**
 * Checks if a point (canvas coordinates) is inside a given collider area.
 */
export function testPointInCollider(
  point: Point,
  collider?: InteractionCollider,
  layerStrokes?: Stroke[]
): boolean {
  if (!collider || collider.type === 'canvas') {
    return true; // Entire canvas is hit
  }

  if (collider.type === 'rect') {
    const x = collider.rect?.x ?? collider.x ?? 0;
    const y = collider.rect?.y ?? collider.y ?? 0;
    const width = collider.rect?.width ?? collider.width ?? 100;
    const height = collider.rect?.height ?? collider.height ?? 100;
    const minX = Math.min(x, x + width);
    const maxX = Math.max(x, x + width);
    const minY = Math.min(y, y + height);
    const maxY = Math.max(y, y + height);
    return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
  }

  if (collider.type === 'circle') {
    const x = collider.circle?.x ?? collider.x ?? 0;
    const y = collider.circle?.y ?? collider.y ?? 0;
    const radius = collider.circle?.radius ?? collider.radius ?? 50;
    return distance(point, { x, y }) <= radius;
  }

  if (collider.type === 'layer') {
    if (!layerStrokes || layerStrokes.length === 0) return false;
    // Collect all points of layer strokes to test bounding box with safety margin
    const allPoints: Point[] = [];
    layerStrokes.forEach(s => {
      if (s.points) allPoints.push(...s.points);
    });
    if (allPoints.length === 0) return false;

    const bbox = getBoundingBox(allPoints);
    const margin = 12; // 12px proximity buffer
    return (
      point.x >= bbox.minX - margin &&
      point.x <= bbox.maxX + margin &&
      point.y >= bbox.minY - margin &&
      point.y <= bbox.maxY + margin
    );
  }

  return true;
}

/**
 * Updates timeline playback head based on deltaTime and loop mode.
 */
export function advanceTimelineTime(
  currentTime: number,
  duration: number,
  dt: number,
  loopMode: 'once' | 'loop' | 'pingpong',
  direction: number = 1
): { newTime: number; newDirection: number; isEnded: boolean } {
  let newDirection = direction;
  let isEnded = false;
  let newTime = currentTime + dt * newDirection;

  if (loopMode === 'once') {
    if (newTime >= duration) {
      newTime = duration;
      isEnded = true;
    } else if (newTime <= 0) {
      newTime = 0;
    }
  } else if (loopMode === 'loop') {
    if (newTime >= duration) {
      newTime = newTime % duration;
    } else if (newTime < 0) {
      newTime = duration - (Math.abs(newTime) % duration);
    }
  } else if (loopMode === 'pingpong') {
    if (newTime >= duration) {
      newTime = duration;
      newDirection = -1;
    } else if (newTime <= 0) {
      newTime = 0;
      newDirection = 1;
    }
  }

  return { newTime, newDirection, isEnded };
}


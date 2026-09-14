import { Point, Project, UIState, Stroke, CornerRadii } from '../types';
import { resolveLayerVisibleStrokes } from './layerUtils';
import { distance, rotatePoint, getCornerHandlePositions, isPointInStroke } from './math';

export const isPointInsidePolygon = (p: Point, points: Point[]): boolean => {
  if (!points || points.length < 3) return false;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, yi = points[i].y;
    const xj = points[j].x, yj = points[j].y;
    const intersect = ((yi > p.y) !== (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

export const getGizmoHit = (p: Point, bounds: { cx: number, cy: number, width: number, height: number, rotation: number } | null, scale: number) => {
    if (!bounds) return null;
    const { cx, cy, width, height, rotation } = bounds;
    const hw = width / 2; const hh = height / 2;
    const localP = rotatePoint(p, {x: cx, y: cy}, -rotation);
    const HANDLE_SIZE = 12 / scale;
    if (distance(localP, {x: cx, y: cy - hh - 25}) < HANDLE_SIZE) return 'rotator';
    if (distance(localP, {x: cx - hw, y: cy - hh}) < HANDLE_SIZE) return 'tl';
    if (distance(localP, {x: cx + hw, y: cy - hh}) < HANDLE_SIZE) return 'tr';
    if (distance(localP, {x: cx - hw, y: cy + hh}) < HANDLE_SIZE) return 'bl';
    if (distance(localP, {x: cx + hw, y: cy + hh}) < HANDLE_SIZE) return 'br';
    if (localP.x >= cx - hw && localP.x <= cx + hw && localP.y >= cy - hh && localP.y <= cy + hh) return 'body';
    return null;
};

export const getCornerGizmoHit = (p: Point, bounds: { cx: number, cy: number, width: number, height: number, rotation: number } | null, radii: CornerRadii | undefined, scale: number): keyof CornerRadii | null => {
    if (!bounds) return null;
    const minX = bounds.cx - bounds.width / 2;
    const minY = bounds.cy - bounds.height / 2;
    const handles = getCornerHandlePositions(
      { minX, minY, width: bounds.width, height: bounds.height, rotation: bounds.rotation },
      radii || { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 }
    );
    const HIT_RADIUS = 10 / scale;
    for (const h of handles) {
      if (distance(p, { x: h.x, y: h.y }) <= HIT_RADIUS) {
        return h.corner;
      }
    }
    return null;
};

export const getVertexHit = (p: Point, strokePoints: Point[], scale: number): number => {
    const HIT_THRESHOLD = 8 / scale;
    for (let i = strokePoints.length - 1; i >= 0; i--) {
        if (distance(p, strokePoints[i]) < HIT_THRESHOLD) return i;
    }
    return -1;
};

export const findHitStrokeAcrossLayers = (p: Point, project: Project, ui: UIState): { strokeId: string; layerId: string } | null => {
    const activeLayerId = ui.selectedLayerId;
    if (!activeLayerId) return null;

    const layer = project.layers.find(l => l.id === activeLayerId && !l.id.includes('-sym-') && l.visible && !l.locked);
    if (!layer) return null;

    const strokes = resolveLayerVisibleStrokes(project, ui, activeLayerId);
    for (let i = strokes.length - 1; i >= 0; i--) {
       const s = strokes[i];
       if (s.visible === false) continue;
       if (!s.points || s.points.length === 0) continue;
       const isHit = isPointInStroke(p, s.points) || ((s.closed || s.shapeConfig || (s.style?.fillColor && s.style?.fillColor !== 'none')) && isPointInsidePolygon(p, s.points));
       if (isHit) {
          return { strokeId: s.id, layerId: layer.id };
       }
    }
    return null;
};

export const findHitStroke = (p: Point, project: Project, ui: UIState): string | null => {
    const hit = findHitStrokeAcrossLayers(p, project, ui);
    return hit ? hit.strokeId : null;
};

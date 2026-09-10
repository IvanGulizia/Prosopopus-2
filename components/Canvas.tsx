// components/Canvas.tsx
import React, { useRef, useLayoutEffect, useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { interpolateStrokePoints, snapPointToGrid, isPointInStroke, calculateInterpolationWeights, distance, getBoundingBox, rotatePoint, lerp, drawCornerRoundedPath, drawRoundedRectangle, drawCatmullRomSpline, simplifyCollinearPoints, distToSegment, getSymmetricPoints, generateRectanglePoints, generateEllipsePoints, generatePolygonPoints, generateShapePoints, getCornerHandlePositions } from '../utils/math';
import { resolveStrokeStyle } from '../utils/style';
import { Point, CornerRadii, ShapeConfig, Stroke, AnimationTimeline, TimelineKeyframeMarker, LayerInteraction, Project, UIState } from '../types';
import { evaluateEasing } from '../utils/easing';
import { evaluateTimelineAxes, advanceTimelineTime, evaluateLayerTimelineStrokes, testPointInCollider } from '../utils/animation';
import { checkTransitionMatches, interpolateStrokesDirect } from '../utils/stateMachine';
import { APP_COLORS } from '../constants';

type InteractionMode = 'none' | 'drawing' | 'polyline' | 'drawingShape' | 'dragging' | 'resizing' | 'rotating' | 'draggingVertex' | 'draggingCorner' | 'draggingCollider';
type ResizeHandle = 'tl' | 'tr' | 'bl' | 'br';
type CornerHandle = keyof CornerRadii;

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

export const resolveLayerVisibleStrokes = (proj: Project, u: UIState, layerId: string): Stroke[] => {
  const layer = proj.layers.find(l => l.id === layerId);
  if (!layer || !layer.visible) return [];

  if (layer.isGuide) {
    const layerRelevantKeyframes = proj.keyframes.filter(kf => {
      const ls = kf.layerStates.find(s => s.layerId === layer.id);
      return ls && ls.strokes.length > 0;
    });

    if (u.mode === 'play' && layerRelevantKeyframes.length > 0) {
      // Find the currently active state in play mode based on global currentAxesDict
      // This is a helper inside the getCurrentLayerStrokes hook.
      // `proj.axes` holds the values. But we don't have access to the physics-smoothed playMode axes here easily,
      // so we use the raw proj.axes for the thumbnail extraction in the layers panel.
      const currentAxesDict: Record<string, number> = {};
      proj.axes.forEach(a => { currentAxesDict[a.id] = a.currentValue; });
      const weights = calculateInterpolationWeights(
        currentAxesDict,
        layerRelevantKeyframes,
        u.interpolationExponent,
        u.interpolationStrategy,
        false,
        0,
        u.gridCurvature ?? 1.0
      );
      let maxWeight = -Infinity;
      let nearestKfId = '';
      for (const [kfId, weight] of Object.entries(weights)) {
        if (weight > maxWeight) {
          maxWeight = weight;
          nearestKfId = kfId;
        }
      }
      const nearestKf = layerRelevantKeyframes.find(k => k.id === nearestKfId);
      const kfStrokes = nearestKf?.layerStates.find(ls => ls.layerId === layer.id)?.strokes;
      if (kfStrokes && kfStrokes.length > 0) return kfStrokes;
    } else {
      const selectedKf = proj.keyframes.find(k => k.id === u.selectedKeyframeId) || proj.keyframes[0];
      const kfStrokes = selectedKf?.layerStates.find(ls => ls.layerId === layer.id)?.strokes;
      if (kfStrokes && kfStrokes.length > 0) return kfStrokes;
    }

    return (layer.guideStrokes && layer.guideStrokes.length > 0)
      ? layer.guideStrokes
      : (proj.keyframes[0]?.layerStates.find(ls => ls.layerId === layer.id)?.strokes || []);
  }

  const isTimelineDriving = layer.driverMode === 'timeline' || u.isTimelineOpen;
  if (isTimelineDriving) {
    const activeAnim = proj.animations?.find(a => a.id === (u.activeAnimationId || proj.activeAnimationId)) || proj.animations?.[0];
    const track = activeAnim?.tracks?.find(t => t.layerId === layer.id);
    if (track && track.keyframes && track.keyframes.length > 0) {
      if (u.selectedTimelineKeyframeId) {
        const matchKf = track.keyframes.find(k => k.id === u.selectedTimelineKeyframeId);
        if (matchKf && matchKf.strokes && matchKf.strokes.length > 0) {
          return matchKf.strokes;
        }
      }
      const tTime = u.timelineCurrentTime ?? 0;
      const matchTimeKf = track.keyframes.find(k => Math.abs(k.time - tTime) <= 0.03);
      if (matchTimeKf && matchTimeKf.strokes && matchTimeKf.strokes.length > 0) {
        return matchTimeKf.strokes;
      }
      return evaluateLayerTimelineStrokes(
        track,
        tTime,
        layer.interpolationMode || 'resample',
        200,
        activeAnim?.loopMode || 'loop',
        activeAnim?.duration || 2.0,
        layer
      );
    }
  }

  if (u.selectedKeyframeId) {
    const kf = proj.keyframes.find(k => k.id === u.selectedKeyframeId);
    const ls = kf?.layerStates.find(s => s.layerId === layer.id);
    return ls?.strokes || [];
  }

  return [];
};

export const resolveActiveVisibleStroke = (proj: Project, u: UIState): Stroke | undefined => {
  if (!u.selectedStrokeId || !u.selectedLayerId) return undefined;
  const strokes = resolveLayerVisibleStrokes(proj, u, u.selectedLayerId);
  return strokes.find(s => s.id === u.selectedStrokeId);
};

export const Canvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const { 
      ui, project, updateAxisValue, updateMultipleAxisValues, 
      addStrokeToCurrentKeyframe, updateStrokeInCurrentKeyframe, selectStroke, selectLayer,
      undo, redo, deleteStroke, setTransformMode, setTool, addOrUpdateShapeStroke, setCornerRadii, setCornerRadius,
      setInteractionCollider
  } = useStore();
  
  // -- Stable Refs for Animation Loop --
  const projectRef = useRef(project);
  const uiRef = useRef(ui);
  
  useEffect(() => { projectRef.current = project; }, [project]);
  useEffect(() => { uiRef.current = ui; }, [ui]);

  // -- Physics State (Refs to avoid re-renders) --
  const targetAxesRef = useRef<Record<string, number>>({ 'axis-x': 0.5, 'axis-y': 0.5 });
  const velocityRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 });
  const pointerVelocityRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 });
  const lastPointerTimeRef = useRef<number>(0);
  const lastPointerPosRef = useRef<{ x: number, y: number }>({ x: 0.5, y: 0.5 });
  
  // Play Mode Local Physics State (Decoupled from Store)
  const playModeAxesRef = useRef<Record<string, number>>({ 'axis-x': 0.5, 'axis-y': 0.5 });

  // Timeline & State Machine Physics / Transition Refs
  const timelinePingPongDirRef = useRef<number>(1);
  const interactiveTransitionRef = useRef<{
    startPos: Record<string, number>;
    targetPos: Record<string, number>;
    startTime: number;
    duration: number;
    easing: any;
  } | null>(null);
  const stateMachineTransitionRef = useRef<{
    fromNodeId: string;
    toNodeId: string;
    startTime: number;
    duration: number;
    easing: any;
    fromStrokesMap: Record<string, Stroke[]>;
    toStrokesMap: Record<string, Stroke[]>;
    targetClipAnimationId?: string;
    targetLayerId?: string;
  } | null>(null);
  const lastHoveredLayerRef = useRef<string | null>(null);
  const hoveredInteractionsRef = useRef<Set<string>>(new Set());

  // Vertex Inertia Dynamics (Disney Follow-Through / Jiggle - Approach B)
  const vertexInertiaRef = useRef<Map<string, { current: Point[], velocity: Point[] }>>(new Map());

  const lastFrameTimeRef = useRef<number>(0);
  
  // -- Interaction State (Refs needed for Loop access without stale closure) --
  const currentPointsRef = useRef<Point[]>([]); 
  const interactionModeRef = useRef<InteractionMode>('none');
  
  // -- SYNCED REFS FOR RENDERING --
  const [polylinePoints, setPolylinePoints] = useState<Point[]>([]);
  const polylinePointsRef = useRef<Point[]>([]);
  useEffect(() => { polylinePointsRef.current = polylinePoints; }, [polylinePoints]);

  const [mousePos, setMousePos] = useState<Point | null>(null);
  const mousePosRef = useRef<Point | null>(null);
  useEffect(() => { mousePosRef.current = mousePos; }, [mousePos]);

  const [selectionBounds, setSelectionBounds] = useState<{cx: number; cy: number; width: number; height: number; rotation: number;} | null>(null);
  const selectionBoundsRef = useRef(selectionBounds);
  useEffect(() => { selectionBoundsRef.current = selectionBounds; }, [selectionBounds]);

  const [transformStart, setTransformStart] = useState<{
      mouse: Point;
      center: Point;
      angle: number;
      width: number;
      height: number;
      points: Point[]; 
  } | null>(null);
  const transformStartRef = useRef(transformStart);
  useEffect(() => { transformStartRef.current = transformStart; }, [transformStart]);

  const [activeHandle, setActiveHandle] = useState<ResizeHandle | null>(null);
  const [activeCornerHandle, setActiveCornerHandle] = useState<CornerHandle | null>(null);
  const activeCornerHandleRef = useRef<CornerHandle | null>(null);
  useEffect(() => { activeCornerHandleRef.current = activeCornerHandle; }, [activeCornerHandle]);

  const [shapeDragStart, setShapeDragStart] = useState<{ startPoint: Point; currentPoint: Point } | null>(null);
  const shapeDragStartRef = useRef<{ startPoint: Point; currentPoint: Point } | null>(null);
  useEffect(() => { shapeDragStartRef.current = shapeDragStart; }, [shapeDragStart]);

  const [activeVertexIndex, setActiveVertexIndex] = useState<number | null>(null);
  const activeVertexIndexRef = useRef<number | null>(null);
  useEffect(() => { activeVertexIndexRef.current = activeVertexIndex; }, [activeVertexIndex]);
  
  const isVertexMode = ui.transformMode === 'points';
  const isVertexModeRef = useRef(false);
  useEffect(() => { isVertexModeRef.current = isVertexMode; }, [isVertexMode]);

  const ignoreNextContextMenuRef = useRef(false);

  useEffect(() => {
      if (!ui.selectedStrokeId && ui.transformMode === 'points') {
          setTransformMode('object');
      }
  }, [ui.selectedStrokeId, ui.transformMode, setTransformMode]);

  const setInteractionMode = (mode: InteractionMode) => {
      interactionModeRef.current = mode;
      setInteractionModeState(mode);
  };
  const [interactionModeState, setInteractionModeState] = useState<InteractionMode>('none');

  const [scale, setScale] = useState(1);
  const CANVAS_WIDTH = project.canvasSize.width;
  const CANVAS_HEIGHT = project.canvasSize.height;

  // -- Helpers --
  
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current) return;
      const { width: contW, height: contH } = containerRef.current.getBoundingClientRect();
      const marginX = 120;
      const marginY = 240;
      const newScale = Math.min((contW - marginX) / CANVAS_WIDTH, (contH - marginY) / CANVAS_HEIGHT, 1);
      setScale(Math.max(0.1, newScale));
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [CANVAS_WIDTH, CANVAS_HEIGHT]);

  const getCanvasPoint = (e: React.PointerEvent): Point => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
    const y = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);
    return { x, y, pressure: e.pressure || 0.5 };
  };

  const getSnappedPoint = (p: Point): Point => {
      if (ui.snapToGrid) {
          const snapSize = ui.gridSize * ui.snapScale;
          const centerX = CANVAS_WIDTH / 2;
          const centerY = CANVAS_HEIGHT / 2;
          const offset = {
              x: (centerX % snapSize),
              y: (centerY % snapSize)
          };
          return snapPointToGrid(p, snapSize, offset);
      }
      return p;
  };

  useEffect(() => {
    if (ui.mode !== 'play') return;
    
    // Reset play mode physics to current axes when entering play mode
    const axisX = project.axes.find(a => a.id === 'axis-x');
    const axisY = project.axes.find(a => a.id === 'axis-y');
    if (axisX && axisY) {
        playModeAxesRef.current = { 'axis-x': axisX.currentValue, 'axis-y': axisY.currentValue };
        targetAxesRef.current = { 'axis-x': axisX.currentValue, 'axis-y': axisY.currentValue };
        velocityRef.current = { x: 0, y: 0 };
        pointerVelocityRef.current = { x: 0, y: 0 };
        lastPointerPosRef.current = { x: axisX.currentValue, y: axisY.currentValue };
        lastPointerTimeRef.current = performance.now();
    }

    const handleWindowPointerMove = (e: PointerEvent) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        
        const rawNormX = (e.clientX - rect.left) / rect.width;
        const rawNormY = (e.clientY - rect.top) / rect.height;
        
        // Track pointer velocity for momentum extrapolation (Option C)
        const now = performance.now();
        const dt = Math.max(0.005, (now - (lastPointerTimeRef.current || now)) / 1000);
        lastPointerTimeRef.current = now;
        
        const deltaX = rawNormX - lastPointerPosRef.current.x;
        const deltaY = rawNormY - lastPointerPosRef.current.y;
        lastPointerPosRef.current = { x: rawNormX, y: rawNormY };

        // Exponential smoothing on pointer velocity
        const instantVelX = deltaX / dt;
        const instantVelY = deltaY / dt;
        pointerVelocityRef.current.x = pointerVelocityRef.current.x * 0.4 + instantVelX * 0.6;
        pointerVelocityRef.current.y = pointerVelocityRef.current.y * 0.4 + instantVelY * 0.6;

        const padding = ui.axisMatrixPadding ?? 0;
        const minX = Math.max(0, padding);
        const maxX = Math.min(1, 1 - padding);
        const minY = Math.max(0, padding);
        const maxY = Math.min(1, 1 - padding);

        let processedX = rawNormX;
        let processedY = rawNormY;

        // OPTION B: Rubberband Border Overshoot (Logarithmic resistance beyond active margin/padding)
        if (ui.overshootRubberbandEnabled) {
            const factor = ui.overshootRubberbandFactor ?? 0.35;
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

            // Still bound within absolute container limits [0, 1]
            processedX = Math.max(0, Math.min(1, processedX));
            processedY = Math.max(0, Math.min(1, processedY));
        } else {
            // Standard clamping
            processedX = Math.max(minX, Math.min(maxX, processedX));
            processedY = Math.max(minY, Math.min(maxY, processedY));
        }

        // Snap Grid in Play Mode
        if (ui.snapPlayMode) {
            const effectiveSizeX = maxX - minX;
            const effectiveSizeY = maxY - minY;
            if (effectiveSizeX > 0 && effectiveSizeY > 0) {
                const divisions = (ui.axisMatrixDivisions && ui.axisMatrixDivisions > 1) 
                    ? ui.axisMatrixDivisions - 1 
                    : 10;
                const relX = (processedX - minX) / effectiveSizeX;
                const relY = (processedY - minY) / effectiveSizeY;
                const snappedRelX = Math.round(relX * divisions) / divisions;
                const snappedRelY = Math.round(relY * divisions) / divisions;
                processedX = minX + (snappedRelX * effectiveSizeX);
                processedY = minY + (snappedRelY * effectiveSizeY);
            }
        }

        // OPTION C: Momentum / Kinetic Impulse Boost
        if (ui.overshootMomentumEnabled) {
            const momentumMult = (ui.overshootMomentumFactor ?? 0.4) * 0.15;
            // Project target forward with velocity
            processedX += pointerVelocityRef.current.x * momentumMult;
            processedY += pointerVelocityRef.current.y * momentumMult;
            
            // Allow momentum to reach up to absolute 0..1 bounds
            processedX = Math.max(0, Math.min(1, processedX));
            processedY = Math.max(0, Math.min(1, processedY));
        }
        
        targetAxesRef.current = { 'axis-x': processedX, 'axis-y': processedY };
    };

    const handleWindowWheel = (e: WheelEvent) => {
        const delta = e.deltaY > 0 ? 0.04 : -0.04;
        const currentProg = useStore.getState().ui.runtimeScrollProgress ?? 0;
        const nextProg = Math.max(0, Math.min(1, currentProg + delta));
        useStore.getState().setRuntimeScrollProgress(nextProg);

        triggerStateMachineEvent({
            type: 'wheel',
            scrollDelta: e.deltaY,
            scrollProgress: nextProg
        });
        if (e.deltaY > 0) {
            triggerStateMachineEvent({ type: 'scroll_down', scrollProgress: nextProg });
        } else {
            triggerStateMachineEvent({ type: 'scroll_up', scrollProgress: nextProg });
        }
    };

    const handleWindowKeyDown = (e: KeyboardEvent) => {
        const activeTag = document.activeElement?.tagName.toLowerCase() || '';
        const isInput = ['input', 'textarea', 'select'].includes(activeTag) || (document.activeElement as HTMLElement)?.isContentEditable;
        if (isInput) return;

        triggerStateMachineEvent({
            type: 'key_press',
            key: e.key
        });
        triggerStateMachineEvent({
            type: 'keydown',
            key: e.key
        });
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('wheel', handleWindowWheel, { passive: false });
    window.addEventListener('keydown', handleWindowKeyDown);
    return () => {
        window.removeEventListener('pointermove', handleWindowPointerMove);
        window.removeEventListener('wheel', handleWindowWheel);
        window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [
    ui.mode, 
    ui.snapPlayMode, 
    ui.axisMatrixPadding, 
    ui.axisMatrixDivisions, 
    ui.overshootRubberbandEnabled, 
    ui.overshootRubberbandFactor, 
    ui.overshootMomentumEnabled, 
    ui.overshootMomentumFactor, 
    project.axes
  ]);

  const handleDoubleClick = (e: React.MouseEvent) => {
      if (ui.mode === 'play') {
          const p = getCanvasPoint(e);
          triggerStateMachineEvent({
              type: 'double_click',
              layerId: lastHoveredLayerRef.current || 'canvas',
              point: p
          });
          return;
      }

      if (ui.selectedTool === 'polyline') {
          if (polylinePoints.length > 1) addStrokeToCurrentKeyframe(polylinePoints, false, true);
          setPolylinePoints([]);
          return;
      }

      if (ui.selectedTool === 'select' && ui.selectedStrokeId) {
           setTransformMode('points'); 
      }
  };

  const handleCancel = () => {
      // Logic for "Return / Cancel" via Escape or Right-Click
      if (ui.selectedTool === 'polyline' && polylinePoints.length > 0) {
          // Cancel current drawing
          setPolylinePoints([]);
      } else if (isVertexMode) {
          // Exit vertex mode
          setTransformMode('object'); 
      } else {
          // Deselect everything
          setInteractionMode('none'); 
          selectStroke(null);
      }
  };

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if ((e.target as HTMLElement).tagName === 'INPUT') return;

          if (e.key === 'Enter') { 
              if (ui.selectedTool === 'polyline') handleDoubleClick({} as React.MouseEvent);
          }
          if (e.key === 'Escape') { 
              handleCancel();
          }

          if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
              e.preventDefault();
              if (e.shiftKey) redo();
              else undo();
          }
          if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
              e.preventDefault();
              redo();
          }

          if (e.key === 'Backspace' || e.key === 'Delete') {
              if (ui.isTimelineOpen && ui.selectedTimelineKeyframeId) {
                  // Keyframe deletion in timeline is handled exclusively by Timeline component
                  return;
              }
              if (ui.selectedStrokeId) {
                  deleteStroke(ui.selectedStrokeId);
              }
          }

          if (ui.selectedStrokeId && ui.selectedLayerId && (e.key.startsWith('Arrow'))) {
              e.preventDefault();
              const stroke = resolveActiveVisibleStroke(project, ui);
              
              if (stroke) {
                  const step = e.shiftKey ? ui.gridSize : 1;
                  let dx = 0;
                  let dy = 0;
                  if (e.key === 'ArrowUp') dy = -step;
                  if (e.key === 'ArrowDown') dy = step;
                  if (e.key === 'ArrowLeft') dx = -step;
                  if (e.key === 'ArrowRight') dx = step;
                  
                  const newPoints = stroke.points.map(p => ({ ...p, x: p.x + dx, y: p.y + dy }));
                  updateStrokeInCurrentKeyframe(stroke.id, newPoints);
              }
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [ui.selectedTool, ui.selectedStrokeId, ui.selectedKeyframeId, ui.selectedTimelineKeyframeId, ui.timelineCurrentTime, ui.isTimelineOpen, ui.selectedLayerId, polylinePoints, project, isVertexMode]);

  useEffect(() => {
    if ((ui.selectedTool !== 'select' && ui.selectedTool !== 'shape') || !ui.selectedStrokeId || !ui.selectedLayerId) {
        setSelectionBounds(null);
        return;
    }
    const stroke = resolveActiveVisibleStroke(project, ui);
    if (!stroke || !stroke.points || stroke.points.length === 0) {
        setSelectionBounds(null);
        return;
    }
    const bbox = getBoundingBox(stroke.points);
    setSelectionBounds({
        cx: bbox.centerX, cy: bbox.centerY, width: bbox.width, height: bbox.height, rotation: stroke.shapeConfig?.rotation || 0
    });
  }, [ui.selectedStrokeId, ui.selectedKeyframeId, ui.selectedTimelineKeyframeId, ui.timelineCurrentTime, ui.isTimelineOpen, ui.selectedLayerId, ui.selectedTool, project]);

  const getGizmoHit = (p: Point, bounds: { cx: number, cy: number, width: number, height: number, rotation: number } | null) => {
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

  const getCornerGizmoHit = (p: Point, bounds: { cx: number, cy: number, width: number, height: number, rotation: number } | null, radii?: CornerRadii): CornerHandle | null => {
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

  const getVertexHit = (p: Point, strokePoints: Point[]): number => {
      const HIT_THRESHOLD = 8 / scale;
      for (let i = strokePoints.length - 1; i >= 0; i--) {
          if (distance(p, strokePoints[i]) < HIT_THRESHOLD) return i;
      }
      return -1;
  };

  // Active Layer Selection: Only allow selecting strokes that are visible on the active layer
  const findHitStrokeAcrossLayers = (p: Point): { strokeId: string; layerId: string } | null => {
     const activeLayerId = ui.selectedLayerId;
     if (!activeLayerId) return null;

     const layer = project.layers.find(l => l.id === activeLayerId && !l.id.includes('-sym-') && l.visible && !l.locked);
     if (!layer) return null;

     const strokes = resolveLayerVisibleStrokes(project, ui, activeLayerId);
     for (let i = strokes.length - 1; i >= 0; i--) {
        const s = strokes[i];
        if (!s.points || s.points.length === 0) continue;
        const isHit = isPointInStroke(p, s.points) || ((s.closed || s.shapeConfig || (s.style?.fillColor && s.style?.fillColor !== 'none')) && isPointInsidePolygon(p, s.points));
        if (isHit) {
           return { strokeId: s.id, layerId: layer.id };
        }
     }
     return null;
  };

  const findHitStroke = (p: Point): string | null => {
     const hit = findHitStrokeAcrossLayers(p);
     return hit ? hit.strokeId : null;
  };

  const triggerStateMachineEvent = (event: {
    type: string;
    layerId?: string | null;
    scrollProgress?: number;
    scrollDelta?: number;
    key?: string;
    point?: Point;
    layerStrokes?: Stroke[];
  }) => {
    const currentProject = projectRef.current;
    const currentUI = uiRef.current;
    if (!currentProject.stateMachines || currentProject.stateMachines.length === 0) return;

    const sm = currentProject.stateMachines.find(s => s.id === currentProject.activeStateMachineId) || currentProject.stateMachines[0];
    const currentNodeId = currentUI.activeStateNodeId || sm.entryNodeId;

    const matchingTrans = sm.transitions.find(t => 
      t.fromNodeId === currentNodeId && checkTransitionMatches(t, event)
    );

    if (matchingTrans) {
      const targetNode = sm.nodes.find(n => n.id === matchingTrans.toNodeId);
      if (!targetNode) return;

      const fromStrokesMap: Record<string, Stroke[]> = {};
      const toStrokesMap: Record<string, Stroke[]> = {};
      const transDuration = Math.max(0, matchingTrans.duration ?? 0.35);

      if (targetNode.type === 'clip' && targetNode.animationId) {
        const targetAnim = currentProject.animations?.find(a => a.id === targetNode.animationId);
        currentProject.layers.forEach(layer => {
          fromStrokesMap[layer.id] = resolveLayerVisibleStrokes(currentProject, currentUI, layer.id);
          const track = targetAnim?.tracks?.find(t => t.layerId === layer.id);
          if (track && track.keyframes && track.keyframes.length > 0) {
            toStrokesMap[layer.id] = evaluateLayerTimelineStrokes(
              track,
              0,
              layer.interpolationMode || 'resample',
              200,
              targetAnim?.loopMode || 'loop',
              targetAnim?.duration || 2.0,
              layer
            );
          } else {
            toStrokesMap[layer.id] = fromStrokesMap[layer.id] || [];
          }
        });

        if (transDuration > 0.02) {
          stateMachineTransitionRef.current = {
            fromNodeId: currentNodeId,
            toNodeId: targetNode.id,
            startTime: performance.now(),
            duration: transDuration * 1000,
            easing: matchingTrans.easing || 'easeInOut',
            fromStrokesMap,
            toStrokesMap,
            targetClipAnimationId: targetNode.animationId,
            targetLayerId: targetNode.targetLayerId
          };
          useStore.getState().setActiveStateNode(targetNode.id);
        } else {
          useStore.getState().setActiveAnimation(targetNode.animationId);
          useStore.getState().setTimelineCurrentTime(0);
          useStore.getState().setTimelinePlaying(true);
          useStore.getState().setActiveStateNode(targetNode.id);
        }
      } else if (targetNode.type === 'pose') {
        currentProject.layers.forEach(layer => {
          fromStrokesMap[layer.id] = resolveLayerVisibleStrokes(currentProject, currentUI, layer.id);
          const targetLs = targetNode.poseData?.layerStates?.find(ls => ls.layerId === layer.id);
          toStrokesMap[layer.id] = targetLs ? targetLs.strokes : [];
        });

        if (transDuration > 0.02) {
          stateMachineTransitionRef.current = {
            fromNodeId: currentNodeId,
            toNodeId: targetNode.id,
            startTime: performance.now(),
            duration: transDuration * 1000,
            easing: matchingTrans.easing || 'easeInOut',
            fromStrokesMap,
            toStrokesMap,
            targetLayerId: targetNode.targetLayerId
          };
        }
        if (targetNode.poseData?.axisValues) {
          targetAxesRef.current = { ...targetAxesRef.current, ...targetNode.poseData.axisValues };
        }
        useStore.getState().setActiveStateNode(targetNode.id);
      }
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    // Prevent default touch actions
    if (e.pointerType === 'touch') {
      // e.preventDefault(); // Sometimes blocks scrolling, be careful
    }

    const p = getCanvasPoint(e);
    
    if (ui.mode === 'play') {
       let hitLayerId: string | null = null;
       for (const l of project.layers) {
          if (!l.visible) continue;
          const strokes = resolveLayerVisibleStrokes(project, ui, l.id);
          const isHit = strokes.some(s => isPointInStroke(p, s.points) || ((s.closed || s.shapeConfig || (s.style?.fillColor && s.style?.fillColor !== 'none')) && isPointInsidePolygon(p, s.points)));
          if (isHit) {
             hitLayerId = l.id;
             break;
          }
       }

       // Trigger State Machine Click & Pointer Down with canvas hit point
       triggerStateMachineEvent({
          type: 'click',
          layerId: hitLayerId || 'canvas',
          point: p
       });
       triggerStateMachineEvent({
          type: 'pointer_down',
          layerId: hitLayerId || 'canvas',
          point: p
       });

       // Interactive State Machine Trigger on Click (legacy backwards compatibility)
       if (project.interactions && project.interactions.length > 0) {
          const targetKf = project.keyframes.find(k => k.id === ui.selectedKeyframeId) || project.keyframes[0];
          const matchingInteraction = project.interactions.find(i => {
             if (i.trigger !== 'click') return false;
             const targetStrokes = targetKf?.layerStates.find(ls => ls.layerId === i.layerId)?.strokes || [];
             return testPointInCollider(p, i.collider, targetStrokes);
          });

          if (matchingInteraction) {
             if (matchingInteraction.action.type === 'play_animation' && matchingInteraction.action.targetAnimationId) {
                useStore.getState().setActiveAnimation(matchingInteraction.action.targetAnimationId);
                useStore.getState().setTimelinePlaying(true);
             } else if (matchingInteraction.action.type === 'go_to_keyframe' && matchingInteraction.action.targetKeyframeId) {
                const targetKfObj = project.keyframes.find(k => k.id === matchingInteraction.action.targetKeyframeId);
                if (targetKfObj) {
                   interactiveTransitionRef.current = {
                      startPos: { ...targetAxesRef.current },
                      targetPos: { ...targetKfObj.axisValues },
                      startTime: performance.now(),
                      duration: matchingInteraction.action.duration || 350,
                      easing: matchingInteraction.action.easing || 'easeInOut'
                   };
                }
             }
          }
       }
       return;
    }

    // Check if dragging Collider in Edit Mode
    if (ui.editingColliderInteractionId && ui.mode === 'edit') {
       const activeInteraction = project.interactions?.find(i => i.id === ui.editingColliderInteractionId);
       if (activeInteraction && activeInteraction.collider) {
          const col = activeInteraction.collider;
          let isHit = false;
          if (col.type === 'rect') {
             const rx = col.rect?.x ?? col.x ?? 0;
             const ry = col.rect?.y ?? col.y ?? 0;
             const rw = col.rect?.width ?? col.width ?? 100;
             const rh = col.rect?.height ?? col.height ?? 100;
             isHit = p.x >= rx && p.x <= rx + rw && p.y >= ry && p.y <= ry + rh;
          } else if (col.type === 'circle') {
             const cx = col.circle?.x ?? col.x ?? 0;
             const cy = col.circle?.y ?? col.y ?? 0;
             const cr = col.circle?.radius ?? col.radius ?? 50;
             isHit = distance(p, { x: cx, y: cy }) <= cr;
          }
          if (isHit) {
             setInteractionMode('draggingCollider');
             setTransformStart({
                mouse: p,
                center: { x: col.x ?? 0, y: col.y ?? 0 },
                angle: 0,
                width: col.width ?? 100,
                height: col.height ?? 100,
                points: []
             });
             (e.target as Element).setPointerCapture(e.pointerId);
             return;
          }
       }
    }

    // Check if dragging State Machine Transition Collider in Edit Mode
    if (ui.selectedGraphTransitionId && ui.mode === 'edit') {
       const sm = project.stateMachines?.find(s => s.id === project.activeStateMachineId) || project.stateMachines?.[0];
       const activeTrans = sm?.transitions.find(t => t.id === ui.selectedGraphTransitionId);
       if (activeTrans && activeTrans.params?.collider) {
          const col = activeTrans.params.collider;
          let isHit = false;
          if (col.type === 'rect') {
             const rx = col.x ?? 0;
             const ry = col.y ?? 0;
             const rw = col.width ?? 100;
             const rh = col.height ?? 100;
             isHit = p.x >= rx && p.x <= rx + rw && p.y >= ry && p.y <= ry + rh;
          } else if (col.type === 'circle') {
             const cx = col.x ?? 0;
             const cy = col.y ?? 0;
             const cr = col.radius ?? 50;
             isHit = distance(p, { x: cx, y: cy }) <= cr;
          }
          if (isHit) {
             setInteractionMode('draggingCollider');
             setTransformStart({
                mouse: p,
                center: { x: col.x ?? 0, y: col.y ?? 0 },
                angle: 0,
                width: col.width ?? 100,
                height: col.height ?? 100,
                points: []
             });
             (e.target as Element).setPointerCapture(e.pointerId);
             return;
          }
       }
    }

    if (ui.selectedTool === 'select' || ui.selectedTool === 'shape') {
        // First check corner handles ONLY if a rectangle shape is selected and not in vertex mode
        if (!isVertexMode && ui.selectedStrokeId && selectionBounds) {
            const stroke = resolveActiveVisibleStroke(project, ui);
            const isRectangleShape = stroke?.shapeConfig?.type === 'rectangle';
            
            if (isRectangleShape) {
                const strokeRadii = stroke?.shapeConfig?.cornerRadii || stroke?.style?.cornerRadii || ui.cornerRadii;
                const hitCorner = getCornerGizmoHit(p, selectionBounds, strokeRadii);
                if (hitCorner) {
                    setInteractionMode('draggingCorner');
                    setActiveCornerHandle(hitCorner);
                    setTransformStart({
                        mouse: p,
                        center: { x: selectionBounds.cx, y: selectionBounds.cy },
                        angle: selectionBounds.rotation,
                        width: selectionBounds.width,
                        height: selectionBounds.height,
                        points: stroke ? stroke.points : []
                    });
                    (e.target as Element).setPointerCapture(e.pointerId);
                    return;
                }
            }
        }

        if (isVertexMode && ui.selectedStrokeId && ui.selectedTool === 'select') {
             const stroke = resolveActiveVisibleStroke(project, ui);
             
             if (stroke) {
                 const vertexIndex = getVertexHit(p, stroke.points);
                 
                 if (e.button === 2) { // Right click
                     if (vertexIndex !== -1 && stroke.points.length > 2) {
                         const newPoints = [...stroke.points];
                         newPoints.splice(vertexIndex, 1);
                         updateStrokeInCurrentKeyframe(ui.selectedStrokeId, newPoints);
                         ignoreNextContextMenuRef.current = true;
                     } else {
                         handleCancel();
                     }
                     return;
                 }

                 if (vertexIndex !== -1) {
                     setInteractionMode('draggingVertex');
                     setActiveVertexIndex(vertexIndex);
                     setTransformStart({
                        mouse: p, center: {x:0,y:0}, angle: 0, width: 0, height: 0, 
                        points: stroke.points 
                     });
                     (e.target as Element).setPointerCapture(e.pointerId);
                     return;
                 } else {
                     // Check if hit stroke body to add point
                     const hitStrokeId = findHitStroke(p);
                     if (hitStrokeId === ui.selectedStrokeId) {
                         let minDistance = Infinity;
                         let insertIndex = -1;
                         for (let i = 0; i < stroke.points.length - 1; i++) {
                             const p1 = stroke.points[i];
                             const p2 = stroke.points[i+1];
                             const dist = distToSegment(p, p1, p2);
                             if (dist < minDistance) {
                                 minDistance = dist;
                                 insertIndex = i + 1;
                             }
                         }
                         if (insertIndex !== -1 && minDistance < 10) {
                             const newPoints = [...stroke.points];
                             newPoints.splice(insertIndex, 0, p);
                             updateStrokeInCurrentKeyframe(ui.selectedStrokeId, newPoints);
                             
                             setInteractionMode('draggingVertex');
                             setActiveVertexIndex(insertIndex);
                             setTransformStart({
                                mouse: p, center: {x:0,y:0}, angle: 0, width: 0, height: 0, 
                                points: newPoints 
                             });
                             (e.target as Element).setPointerCapture(e.pointerId);
                             return;
                         }
                     }
                 }
             }
        }

        if (!isVertexMode && ui.selectedStrokeId && selectionBounds) {
            const hitGizmo = getGizmoHit(p, selectionBounds);
            if (hitGizmo) {
                const stroke = resolveActiveVisibleStroke(project, ui);
                if (stroke) {
                    setTransformStart({
                        mouse: p, center: { x: selectionBounds.cx, y: selectionBounds.cy },
                        angle: selectionBounds.rotation, width: selectionBounds.width, height: selectionBounds.height, points: stroke.points
                    });
                    if (hitGizmo === 'body') setInteractionMode('dragging');
                    else if (hitGizmo === 'rotator') setInteractionMode('rotating');
                    else { setInteractionMode('resizing'); setActiveHandle(hitGizmo as ResizeHandle); }
                    (e.target as Element).setPointerCapture(e.pointerId);
                }
                return;
            }
        }

        // Direct Hit Testing across layers
        const hit = findHitStrokeAcrossLayers(p);
        if (hit) {
             if (hit.layerId !== ui.selectedLayerId) {
                 selectLayer(hit.layerId);
             }
             selectStroke(hit.strokeId); 
             return;
        } else {
             if (ui.selectedTool === 'shape') {
                 // Start drawing a new shape on click-drag
                 const snappedP = getSnappedPoint(p);
                 setInteractionMode('drawingShape');
                 setShapeDragStart({ startPoint: snappedP, currentPoint: snappedP });
                 selectStroke(null);
                 (e.target as Element).setPointerCapture(e.pointerId);
                 return;
             }
             // Clicked on empty canvas: deselect cleanly and exit vertex editing mode
             selectStroke(null);
             setTransformMode('object'); 
             return;
        }
        return;
    }

    if (ui.selectedTool === 'polyline') {
       const snappedP = getSnappedPoint(p);
       setPolylinePoints(prev => [...prev, snappedP]);
       return;
    }

    if (ui.selectedTool === 'pen') {
      setInteractionMode('drawing'); 
      const startPt = ui.snapToGrid ? getSnappedPoint(p) : p;
      currentPointsRef.current = [startPt];
      (e.target as Element).setPointerCapture(e.pointerId);
    } 
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const p = getCanvasPoint(e);
    setMousePos(getSnappedPoint(p));

    if (ui.mode === 'play') {
       // State Machine Hover detection
       let hoveredLayerId: string | null = null;
       for (const l of project.layers) {
          if (!l.visible) continue;
          const strokes = resolveLayerVisibleStrokes(project, ui, l.id);
          const isHit = strokes.some(s => isPointInStroke(p, s.points) || ((s.closed || s.shapeConfig || (s.style?.fillColor && s.style?.fillColor !== 'none')) && isPointInsidePolygon(p, s.points)));
          if (isHit) {
             hoveredLayerId = l.id;
             break;
          }
       }

       if (hoveredLayerId !== lastHoveredLayerRef.current) {
          if (hoveredLayerId) {
             triggerStateMachineEvent({ type: 'hover_enter', layerId: hoveredLayerId, point: p });
          } else if (lastHoveredLayerRef.current) {
             triggerStateMachineEvent({ type: 'hover_leave', layerId: lastHoveredLayerRef.current, point: p });
          }
          lastHoveredLayerRef.current = hoveredLayerId;
       }

       // Interactive State Machine Trigger on Hover (Enter / Leave) with Collider support (legacy backwards compatibility)
       if (project.interactions && project.interactions.length > 0) {
          const targetKf = project.keyframes.find(k => k.id === ui.selectedKeyframeId) || project.keyframes[0];
          const currentHovered = new Set<string>();

          project.interactions.forEach(i => {
             const targetStrokes = targetKf?.layerStates.find(ls => ls.layerId === i.layerId)?.strokes || [];
             if (testPointInCollider(p, i.collider, targetStrokes)) {
                currentHovered.add(i.id);
             }
          });

          // Check newly entered interactions
          currentHovered.forEach(intId => {
             if (!hoveredInteractionsRef.current.has(intId)) {
                const enterRule = project.interactions.find(i => i.id === intId && i.trigger === 'hover_enter');
                if (enterRule) {
                   if (enterRule.action.type === 'play_animation' && enterRule.action.targetAnimationId) {
                      useStore.getState().setActiveAnimation(enterRule.action.targetAnimationId);
                      useStore.getState().setTimelinePlaying(true);
                   } else if (enterRule.action.type === 'go_to_keyframe' && enterRule.action.targetKeyframeId) {
                      const targetKfObj = project.keyframes.find(k => k.id === enterRule.action.targetKeyframeId);
                      if (targetKfObj) {
                         interactiveTransitionRef.current = {
                            startPos: { ...targetAxesRef.current },
                            targetPos: { ...targetKfObj.axisValues },
                            startTime: performance.now(),
                            duration: enterRule.action.duration || 350,
                            easing: enterRule.action.easing || 'easeInOut'
                         };
                      }
                   }
                }
             }
          });

          // Check left interactions
          hoveredInteractionsRef.current.forEach(intId => {
             if (!currentHovered.has(intId)) {
                const leaveRule = project.interactions.find(i => i.id === intId && i.trigger === 'hover_leave');
                if (leaveRule) {
                   if (leaveRule.action.type === 'play_animation' && leaveRule.action.targetAnimationId) {
                      useStore.getState().setActiveAnimation(leaveRule.action.targetAnimationId);
                      useStore.getState().setTimelinePlaying(true);
                   } else if (leaveRule.action.type === 'go_to_keyframe' && leaveRule.action.targetKeyframeId) {
                      const targetKfObj = project.keyframes.find(k => k.id === leaveRule.action.targetKeyframeId);
                      if (targetKfObj) {
                         interactiveTransitionRef.current = {
                            startPos: { ...targetAxesRef.current },
                            targetPos: { ...targetKfObj.axisValues },
                            startTime: performance.now(),
                            duration: leaveRule.action.duration || 350,
                            easing: leaveRule.action.easing || 'easeInOut'
                         };
                      }
                   }
                }
             }
          });

          hoveredInteractionsRef.current = currentHovered;
       }
       return;
    }

    if (interactionModeRef.current === 'draggingCollider' && transformStart) {
       if (ui.editingColliderInteractionId) {
          const activeInteraction = project.interactions?.find(i => i.id === ui.editingColliderInteractionId);
          if (activeInteraction && activeInteraction.collider) {
             const col = activeInteraction.collider;
             const dx = p.x - transformStart.mouse.x;
             const dy = p.y - transformStart.mouse.y;
             const origX = transformStart.center.x;
             const origY = transformStart.center.y;
             setInteractionCollider(activeInteraction.id, {
                ...col,
                x: Math.round(origX + dx),
                y: Math.round(origY + dy)
             });
          }
          return;
       } else if (ui.selectedGraphTransitionId) {
          const sm = project.stateMachines?.find(s => s.id === project.activeStateMachineId) || project.stateMachines?.[0];
          const activeTrans = sm?.transitions.find(t => t.id === ui.selectedGraphTransitionId);
          if (activeTrans && activeTrans.params?.collider) {
             const col = activeTrans.params.collider;
             const dx = p.x - transformStart.mouse.x;
             const dy = p.y - transformStart.mouse.y;
             const origX = transformStart.center.x;
             const origY = transformStart.center.y;
             useStore.getState().updateStateTransition(activeTrans.id, {
                params: {
                   ...activeTrans.params,
                   collider: {
                      ...col,
                      x: Math.round(origX + dx),
                      y: Math.round(origY + dy)
                   }
                }
             });
          }
          return;
       }
    }

    if (interactionModeRef.current === 'drawingShape' && shapeDragStart) {
        let currentP = p;
        if (ui.snapToGrid) currentP = getSnappedPoint(p);
        if (e.shiftKey) {
            // Square constraint
            const dx = currentP.x - shapeDragStart.startPoint.x;
            const dy = currentP.y - shapeDragStart.startPoint.y;
            const size = Math.max(Math.abs(dx), Math.abs(dy));
            currentP = {
                x: shapeDragStart.startPoint.x + Math.sign(dx || 1) * size,
                y: shapeDragStart.startPoint.y + Math.sign(dy || 1) * size
            };
        }
        setShapeDragStart({ ...shapeDragStart, currentPoint: currentP });
        return;
    }

    if (interactionModeRef.current === 'draggingCorner' && activeCornerHandle && selectionBounds) {
        const { cx, cy, width, height, rotation } = selectionBounds;
        const localP = rotatePoint(p, { x: cx, y: cy }, -rotation);
        const hw = width / 2;
        const hh = height / 2;
        const maxR = Math.min(hw, hh);

        // Distance from corner outer vertex towards center (Figma-style drag)
        // relX is between -hw and +hw, relY is between -hh and +hh
        const relX = localP.x - cx;
        const relY = localP.y - cy;

        let distFromOuter = 0;
        if (activeCornerHandle === 'topLeft') {
            const dx = relX + hw;
            const dy = relY + hh;
            distFromOuter = (dx + dy) / 2;
        } else if (activeCornerHandle === 'topRight') {
            const dx = hw - relX;
            const dy = relY + hh;
            distFromOuter = (dx + dy) / 2;
        } else if (activeCornerHandle === 'bottomRight') {
            const dx = hw - relX;
            const dy = hh - relY;
            distFromOuter = (dx + dy) / 2;
        } else if (activeCornerHandle === 'bottomLeft') {
            const dx = relX + hw;
            const dy = hh - relY;
            distFromOuter = (dx + dy) / 2;
        }

        // Smooth continuous mapping from outer edge (r=0) to max radius (r=maxR)
        const minInset = Math.min(14, maxR * 0.4);
        const startThreshold = minInset * 0.35;
        let calculatedR = 0;
        if (distFromOuter <= startThreshold) {
            calculatedR = 0;
        } else {
            const t = Math.min(1, Math.max(0, (distFromOuter - startThreshold) / Math.max(1, maxR - startThreshold)));
            calculatedR = Math.round(t * maxR);
        }

        // If Alt/Option key is held down, change ONLY this single corner. Otherwise change all 4!
        if (e.altKey) {
            setCornerRadius(activeCornerHandle, calculatedR);
        } else {
            setCornerRadius('all', calculatedR);
        }

        // Real-time update of the shape points in the active keyframe if stroke is a shape
        if (ui.selectedStrokeId) {
            const stroke = resolveActiveVisibleStroke(project, ui);
            if (stroke) {
                const currentRadii = stroke.shapeConfig?.cornerRadii || ui.cornerRadii || { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 };
                const newRadii = e.altKey 
                    ? { ...currentRadii, [activeCornerHandle]: calculatedR }
                    : { topLeft: calculatedR, topRight: calculatedR, bottomRight: calculatedR, bottomLeft: calculatedR };
                
                const newConfig: ShapeConfig = {
                    type: stroke.shapeConfig?.type || 'rectangle',
                    minX: cx - width / 2,
                    minY: cy - height / 2,
                    width,
                    height,
                    cornerRadii: newRadii,
                    rotation
                };
                updateStrokeInCurrentKeyframe(ui.selectedStrokeId, stroke.points, newConfig);
            }
        }
        return;
    }

    if (interactionModeRef.current === 'draggingVertex' && transformStart && activeVertexIndex !== null) {
        let draggedPos = p;
        if (ui.snapToGrid) draggedPos = getSnappedPoint(p);

        const newPoints = [...transformStart.points];
        newPoints[activeVertexIndex] = { ...newPoints[activeVertexIndex], x: draggedPos.x, y: draggedPos.y };
        
        if (ui.selectedStrokeId) {
            updateStrokeInCurrentKeyframe(ui.selectedStrokeId, newPoints);
             setTransformStart({
                 ...transformStart,
                 points: newPoints
             });
        }
        return;
    }

    if (interactionModeRef.current !== 'none' && transformStart && selectionBounds) {
        if (interactionModeRef.current === 'dragging') {
            let dx = p.x - transformStart.mouse.x; 
            let dy = p.y - transformStart.mouse.y;

            if (ui.snapToGrid) {
                dx = Math.round(dx / ui.gridSize) * ui.gridSize;
                dy = Math.round(dy / ui.gridSize) * ui.gridSize;
            }
            
            setSelectionBounds({ ...selectionBounds, cx: transformStart.center.x + dx, cy: transformStart.center.y + dy });

        } else if (interactionModeRef.current === 'rotating') {
            const currentAngle = Math.atan2(p.y - selectionBounds.cy, p.x - selectionBounds.cx);
            const startAngle = Math.atan2(transformStart.mouse.y - selectionBounds.cy, transformStart.mouse.x - selectionBounds.cx);
            let dAngle = currentAngle - startAngle; let newRotation = transformStart.angle + dAngle;
            if (e.shiftKey) { const step = Math.PI / 12; newRotation = Math.round(newRotation / step) * step; }
            setSelectionBounds({ ...selectionBounds, rotation: newRotation });
        } else if (interactionModeRef.current === 'resizing' && activeHandle) {
            const unrotatedMouse = rotatePoint(p, transformStart.center, -transformStart.angle);
            const unrotatedStart = rotatePoint(transformStart.mouse, transformStart.center, -transformStart.angle);
            let dx = unrotatedMouse.x - unrotatedStart.x; 
            let dy = unrotatedMouse.y - unrotatedStart.y;
            
            if (e.shiftKey) { 
                const aspect = transformStart.width / transformStart.height; 
                dy = (activeHandle === 'br' || activeHandle === 'tl') ? dx / aspect : -dx / aspect; 
            }
            if (ui.snapToGrid && !e.shiftKey) { 
                dx = Math.round(dx / ui.gridSize) * ui.gridSize; 
                dy = Math.round(dy / ui.gridSize) * ui.gridSize; 
            }

            let newW = transformStart.width; 
            let newH = transformStart.height;
            let dcx = 0; // delta center x in unrotated space
            let dcy = 0; // delta center y in unrotated space

            if (e.altKey) {
                // Option/Alt key held: Symmetric resize anchored at center
                if (activeHandle === 'br') { newW += dx * 2; newH += dy * 2; }
                if (activeHandle === 'tl') { newW -= dx * 2; newH -= dy * 2; }
                if (activeHandle === 'tr') { newW += dx * 2; newH -= dy * 2; }
                if (activeHandle === 'bl') { newW -= dx * 2; newH += dy * 2; }
            } else {
                // Default: Non-symmetric resize anchored at opposite corner
                if (activeHandle === 'br') { newW += dx; newH += dy; dcx = dx / 2; dcy = dy / 2; }
                if (activeHandle === 'tl') { newW -= dx; newH -= dy; dcx = dx / 2; dcy = dy / 2; }
                if (activeHandle === 'tr') { newW += dx; newH -= dy; dcx = dx / 2; dcy = dy / 2; }
                if (activeHandle === 'bl') { newW -= dx; newH += dy; dcx = dx / 2; dcy = dy / 2; }
            }
            
            if (e.shiftKey && ui.snapScale) {
                const SCALE_SNAP_STEP = 0.25;
                const MIN_SCALE = 0.25;
                const MAX_SCALE = 10.0;
                
                let rawScaleX = newW / transformStart.width;
                let rawScaleY = newH / transformStart.height;
                
                let snappedScaleX = Math.round(rawScaleX / SCALE_SNAP_STEP) * SCALE_SNAP_STEP;
                let snappedScaleY = Math.round(rawScaleY / SCALE_SNAP_STEP) * SCALE_SNAP_STEP;
                
                snappedScaleX = Math.max(MIN_SCALE, Math.min(MAX_SCALE, snappedScaleX));
                snappedScaleY = Math.max(MIN_SCALE, Math.min(MAX_SCALE, snappedScaleY));
                
                const snappedW = transformStart.width * snappedScaleX;
                const snappedH = transformStart.height * snappedScaleY;
                
                // Adjust dcx and dcy based on the snapped width/height difference
                if (!e.altKey) {
                    const diffW = snappedW - newW;
                    const diffH = snappedH - newH;
                    if (activeHandle === 'br') { dcx += diffW / 2; dcy += diffH / 2; }
                    if (activeHandle === 'tl') { dcx -= diffW / 2; dcy -= diffH / 2; }
                    if (activeHandle === 'tr') { dcx += diffW / 2; dcy -= diffH / 2; }
                    if (activeHandle === 'bl') { dcx -= diffW / 2; dcy += diffH / 2; }
                }
                newW = snappedW;
                newH = snappedH;
            }

            if (newW < 1) {
                const diffW = 1 - newW;
                newW = 1;
                if (!e.altKey) {
                    if (activeHandle === 'br' || activeHandle === 'tr') dcx += diffW / 2;
                    if (activeHandle === 'tl' || activeHandle === 'bl') dcx -= diffW / 2;
                }
            }
            if (newH < 1) {
                const diffH = 1 - newH;
                newH = 1;
                if (!e.altKey) {
                    if (activeHandle === 'br' || activeHandle === 'bl') dcy += diffH / 2;
                    if (activeHandle === 'tl' || activeHandle === 'tr') dcy -= diffH / 2;
                }
            }

            const rotatedCenter = rotatePoint(
                { x: transformStart.center.x + dcx, y: transformStart.center.y + dcy }, 
                transformStart.center, 
                transformStart.angle
            );

            setSelectionBounds({ 
                ...selectionBounds, 
                width: newW, 
                height: newH,
                cx: rotatedCenter.x,
                cy: rotatedCenter.y
            });
        }
        return;
    }

    if (interactionModeRef.current === 'drawing') {
        const pt = ui.snapToGrid ? getSnappedPoint(p) : p;
        const pts = currentPointsRef.current;
        if (pts.length === 0 || distance(pt, pts[pts.length - 1]) > 0.1) {
            pts.push(pt);
        }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (ui.mode === 'play') {
       const p = getCanvasPoint(e);
       triggerStateMachineEvent({
          type: 'pointer_up',
          layerId: lastHoveredLayerRef.current || 'canvas',
          point: p
       });
       return;
    }
    (e.target as Element).releasePointerCapture(e.pointerId);

    if (interactionModeRef.current === 'drawingShape' && shapeDragStart) {
        const startP = shapeDragStart.startPoint;
        const endP = shapeDragStart.currentPoint;
        const minX = Math.min(startP.x, endP.x);
        const minY = Math.min(startP.y, endP.y);
        const width = Math.abs(endP.x - startP.x);
        const height = Math.abs(endP.y - startP.y);
        const dragDist = Math.hypot(endP.x - startP.x, endP.y - startP.y);

        // Require a minimum drag movement (at least 6px) to create or redraw a shape
        const MIN_DRAG_THRESHOLD = 6;
        if (dragDist < MIN_DRAG_THRESHOLD || (width < 6 && height < 6)) {
            // User just clicked without moving -> cancel without creating a shape
            setShapeDragStart(null);
            setInteractionMode('none');
            return;
        }

        const shapeType = ui.shapeType || 'rectangle';
        const sides = ui.shapeSides || 5;
        const cornerRadii = ui.cornerRadii || { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 };

        const config: ShapeConfig = {
            type: shapeType,
            minX,
            minY,
            width: Math.max(10, width),
            height: Math.max(10, height),
            cornerRadii: shapeType === 'rectangle' ? cornerRadii : undefined,
            sides: shapeType === 'polygon' ? sides : undefined,
            rotation: 0
        };

        addOrUpdateShapeStroke(config);
        setShapeDragStart(null);
    }
    
    if ((interactionModeRef.current === 'dragging' || interactionModeRef.current === 'rotating' || interactionModeRef.current === 'resizing') && transformStart && selectionBounds && ui.selectedStrokeId) {
        const scaleX = selectionBounds.width / transformStart.width;
        const scaleY = selectionBounds.height / transformStart.height;
        const dRot = selectionBounds.rotation - transformStart.angle;
        const dX = selectionBounds.cx - transformStart.center.x;
        const dY = selectionBounds.cy - transformStart.center.y;
        const newPoints = transformStart.points.map(pt => {
            let x = pt.x - transformStart.center.x; let y = pt.y - transformStart.center.y;
            x *= scaleX; y *= scaleY;
            const cos = Math.cos(dRot); const sin = Math.sin(dRot);
            const rx = x * cos - y * sin; const ry = x * sin + y * cos;
            return { x: rx + transformStart.center.x + dX, y: ry + transformStart.center.y + dY, pressure: pt.pressure };
        });

        // Find existing stroke in active keyframe / state
        const stroke = resolveActiveVisibleStroke(project, ui);

        let updatedShapeConfig: ShapeConfig | undefined = undefined;
        if (stroke?.shapeConfig) {
            updatedShapeConfig = {
                ...stroke.shapeConfig,
                minX: selectionBounds.cx - selectionBounds.width / 2,
                minY: selectionBounds.cy - selectionBounds.height / 2,
                width: selectionBounds.width,
                height: selectionBounds.height,
                rotation: selectionBounds.rotation
            };
        }

        updateStrokeInCurrentKeyframe(ui.selectedStrokeId, newPoints, updatedShapeConfig);
    }
    
    if (interactionModeRef.current === 'drawing' && currentPointsRef.current.length > 1) {
        const points = [...currentPointsRef.current];
        addStrokeToCurrentKeyframe(points, false);
    }
    setInteractionMode('none'); 
    setActiveHandle(null); 
    setActiveCornerHandle(null);
    setTransformStart(null); 
    setActiveVertexIndex(null); 
    currentPointsRef.current = [];
  };

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = (time: number) => {
      if (!lastFrameTimeRef.current) lastFrameTimeRef.current = time;
      const dt = Math.min((time - lastFrameTimeRef.current) / 1000, 0.1); 
      lastFrameTimeRef.current = time;

      const currentProject = projectRef.current;
      const currentUI = uiRef.current;
      const activeVertIdx = activeVertexIndexRef.current;
      const isVertexModeActive = isVertexModeRef.current; 
      
      const currentPolyline = polylinePointsRef.current;
      const currentSelectionBounds = selectionBoundsRef.current;
      const currentMousePos = mousePosRef.current;
      
      const dpr = currentUI.resolutionScale || window.devicePixelRatio || 1;
      const baseResolution = currentUI.strokeResolution || 400;
      const interpolationTargetCount = currentUI.performanceMode 
          ? Math.max(40, Math.min(120, Math.round(baseResolution * 0.35))) 
          : baseResolution;

      if (canvas.width !== CANVAS_WIDTH * dpr || canvas.height !== CANVAS_HEIGHT * dpr) {
          canvas.width = CANVAS_WIDTH * dpr;
          canvas.height = CANVAS_HEIGHT * dpr;
          ctx.scale(dpr, dpr);
      }

      // --- TIMELINE & INTERACTIVE STATE MACHINE CALCULATION ---
      const activeAnim = currentProject.animations?.find(a => a.id === (currentUI.activeAnimationId || currentProject.activeAnimationId));
      
      // 1. Interactive Transition (e.g. click trigger transition to a keyframe)
      if (interactiveTransitionRef.current) {
        const trans = interactiveTransitionRef.current;
        const elapsed = performance.now() - trans.startTime;
        const progress = Math.min(1, elapsed / Math.max(1, trans.duration));
        const eased = evaluateEasing(progress, trans.easing || 'easeInOut');
        
        const nextTarget: Record<string, number> = {};
        const axesKeys = new Set([...Object.keys(trans.startPos), ...Object.keys(trans.targetPos)]);
        axesKeys.forEach(k => {
          const v0 = trans.startPos[k] ?? 0.5;
          const v1 = trans.targetPos[k] ?? 0.5;
          nextTarget[k] = v0 + (v1 - v0) * eased;
        });
        targetAxesRef.current = { ...targetAxesRef.current, ...nextTarget };

        if (progress >= 1) {
          interactiveTransitionRef.current = null;
        }
      } 

      // 1b. State Machine Morph Transition
      if (stateMachineTransitionRef.current) {
        const smTrans = stateMachineTransitionRef.current;
        const elapsed = performance.now() - smTrans.startTime;
        const progress = Math.min(1, elapsed / Math.max(1, smTrans.duration));
        if (progress >= 1) {
          if (smTrans.targetClipAnimationId) {
            useStore.getState().setActiveAnimation(smTrans.targetClipAnimationId);
            useStore.getState().setTimelineCurrentTime(0);
            useStore.getState().setTimelinePlaying(true);
          }
          stateMachineTransitionRef.current = null;
        }
      }

      // 1c. State Machine Scroll Scrubbing for Clip Nodes
      if (currentUI.mode === 'play' && activeAnim && currentUI.runtimeScrollProgress !== undefined) {
        const sm = currentProject.stateMachines?.find(s => s.id === currentProject.activeStateMachineId) || currentProject.stateMachines?.[0];
        const activeNodeId = currentUI.activeStateNodeId || sm?.entryNodeId;
        const activeNode = sm?.nodes.find(n => n.id === activeNodeId);
        if (activeNode?.type === 'clip') {
          const hasScrub = sm?.transitions.some(t => (t.toNodeId === activeNode.id || t.fromNodeId === activeNode.id) && t.trigger === 'scroll_scrub');
          if (hasScrub) {
            const scrubbedTime = currentUI.runtimeScrollProgress * activeAnim.duration;
            useStore.getState().setTimelineCurrentTime(scrubbedTime);
          }
        }
      }

      // 2. Timeline Playback Driver
      const smForTimeline = currentProject.stateMachines?.find(s => s.id === currentProject.activeStateMachineId) || currentProject.stateMachines?.[0];
      const activeNodeForTimeline = smForTimeline?.nodes.find(n => n.id === (currentUI.activeStateNodeId || smForTimeline?.entryNodeId));
      const hasTimelineLayers = currentProject.layers.some(l => l.driverMode === 'timeline');
      const isClipActive = activeNodeForTimeline?.type === 'clip';

      const shouldPlayTimeline = currentUI.timelinePlaying || (
        currentUI.mode === 'play' && (hasTimelineLayers || isClipActive)
      );

      if (shouldPlayTimeline && activeAnim) {
        const { newTime, newDirection, isEnded } = advanceTimelineTime(
          currentUI.timelineCurrentTime,
          activeAnim.duration,
          dt,
          activeAnim.loopMode,
          timelinePingPongDirRef.current
        );
        timelinePingPongDirRef.current = newDirection;
        
        // Sync timeline playhead smoothly
        useStore.getState().setTimelineCurrentTime(newTime);

        if (isEnded) {
          useStore.getState().setTimelinePlaying(false);
          // Trigger State Machine animation_end event
          triggerStateMachineEvent({ type: 'animation_end' });
          // Check for 'animation_end' interactions (legacy)
          if (currentProject.interactions) {
            const endInteraction = currentProject.interactions.find(i => 
              i.trigger === 'animation_end' && (!i.action.targetAnimationId || i.action.targetAnimationId === activeAnim.id)
            );
            if (endInteraction) {
              if (endInteraction.action.type === 'play_animation' && endInteraction.action.targetAnimationId) {
                useStore.getState().setActiveAnimation(endInteraction.action.targetAnimationId);
                useStore.getState().setTimelinePlaying(true);
              } else if (endInteraction.action.type === 'go_to_keyframe' && endInteraction.action.targetKeyframeId) {
                const targetKf = currentProject.keyframes.find(k => k.id === endInteraction.action.targetKeyframeId);
                if (targetKf) {
                  interactiveTransitionRef.current = {
                    startPos: { ...targetAxesRef.current },
                    targetPos: { ...targetKf.axisValues },
                    startTime: performance.now(),
                    duration: endInteraction.action.duration || 350,
                    easing: endInteraction.action.easing || 'easeInOut'
                  };
                }
              }
            }
          }
        }
      }

      // --- AXIS & PHYSICS CALCULATION ---
      const currentAxesDict: Record<string, number> = {};

      if (currentUI.mode === 'play') {
          // Play Mode: Use local physics refs, do NOT update Store.
          const axisX = currentProject.axes.find(a => a.id === 'axis-x');
          const axisY = currentProject.axes.find(a => a.id === 'axis-y');
          
          if (axisX && axisY) {
              const targetX = targetAxesRef.current['axis-x'];
              const targetY = targetAxesRef.current['axis-y'];
              
              let nextX = playModeAxesRef.current['axis-x'];
              let nextY = playModeAxesRef.current['axis-y'];

              if (currentUI.playModePhysics) {
                  const stiffness = currentUI.springStiffness || 120;
                  let damping = currentUI.springDamping || 20;
                  
                  // OPTION A: Bounciness / Harmonic Spring Overshoot (Underdamped factor)
                  if (currentUI.overshootBouncinessEnabled) {
                      const bounciness = currentUI.overshootBounciness ?? 0.5;
                      // Critical damping coefficient c_critical = 2 * sqrt(stiffness) (assuming unit mass m=1)
                      const criticalDamping = 2 * Math.sqrt(stiffness);
                      // As bounciness approaches 1, damping drops down towards 15% of critical damping, causing strong springy overshoots
                      const minDamping = criticalDamping * 0.15;
                      const maxDamping = criticalDamping * 1.2;
                      // Interpolate between base damping and bouncy underdamped curve
                      const targetUnderdamping = maxDamping - bounciness * (maxDamping - minDamping);
                      damping = Math.min(damping, targetUnderdamping);
                  }
                  
                  const forceX = (targetX - nextX) * stiffness - velocityRef.current.x * damping;
                  const forceY = (targetY - nextY) * stiffness - velocityRef.current.y * damping;
                  
                  velocityRef.current.x += forceX * dt;
                  velocityRef.current.y += forceY * dt;
                  
                  nextX += velocityRef.current.x * dt;
                  nextY += velocityRef.current.y * dt;

                  if (Math.abs(velocityRef.current.x) < 0.0001 && Math.abs(targetX - nextX) < 0.0001) {
                      nextX = targetX;
                      velocityRef.current.x = 0;
                  }
                  if (Math.abs(velocityRef.current.y) < 0.0001 && Math.abs(targetY - nextY) < 0.0001) {
                      nextY = targetY;
                      velocityRef.current.y = 0;
                  }
              } else {
                  nextX = targetX;
                  nextY = targetY;
                  velocityRef.current = { x: 0, y: 0 };
              }

              // Clamp
              nextX = Math.max(0, Math.min(1, nextX));
              nextY = Math.max(0, Math.min(1, nextY));

              playModeAxesRef.current = { 'axis-x': nextX, 'axis-y': nextY };
              
              currentAxesDict['axis-x'] = nextX;
              currentAxesDict['axis-y'] = nextY;
          }
      } else {
           // Edit Mode: Use Store Axes directly
           currentProject.axes.forEach(a => currentAxesDict[a.id] = a.currentValue);
           
           // Sync Physics refs to current state so they don't jump when play starts
           const curX = currentAxesDict['axis-x'] || 0.5;
           const curY = currentAxesDict['axis-y'] || 0.5;
           targetAxesRef.current = { 'axis-x': curX, 'axis-y': curY };
           playModeAxesRef.current = { 'axis-x': curX, 'axis-y': curY };
           velocityRef.current = { x: 0, y: 0 };
      }

      // --- RENDERING ---

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = currentUI.theme.canvasBg;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      if (currentUI.showGrid && currentUI.mode === 'edit') {
        ctx.fillStyle = currentUI.theme.gridColor;
        const gridSize = currentUI.gridSize;
        const centerX = CANVAS_WIDTH / 2;
        const centerY = CANVAS_HEIGHT / 2;
        const startX = (centerX % gridSize);
        const startY = (centerY % gridSize);
        for (let x = startX; x <= CANVAS_WIDTH; x += gridSize) {
           for (let y = startY; y <= CANVAS_HEIGHT; y += gridSize) {
              ctx.beginPath();
              ctx.arc(x, y, 1.5, 0, Math.PI * 2);
              ctx.fill();
           }
        }
      }

      // --- SYMMETRY GUIDES (Visual axis feedback) ---
      if (currentUI.symmetryEnabled && currentUI.showSymmetryAxis && currentUI.mode === 'edit') {
        ctx.save();
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.45)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);

        const ax = currentUI.symmetryAxisX ?? (CANVAS_WIDTH / 2);
        const ay = currentUI.symmetryAxisY ?? (CANVAS_HEIGHT / 2);

        if (currentUI.symmetryType === 'vertical' || currentUI.symmetryType === 'quad') {
          ctx.beginPath();
          ctx.moveTo(ax, 0);
          ctx.lineTo(ax, CANVAS_HEIGHT);
          ctx.stroke();
        }

        if (currentUI.symmetryType === 'horizontal' || currentUI.symmetryType === 'quad') {
          ctx.beginPath();
          ctx.moveTo(0, ay);
          ctx.lineTo(CANVAS_WIDTH, ay);
          ctx.stroke();
        }

        if (currentUI.symmetryType === 'radial') {
          const count = Math.max(2, Math.min(12, currentUI.symmetryRadialCount || 4));
          const maxR = Math.hypot(CANVAS_WIDTH, CANVAS_HEIGHT);
          for (let k = 0; k < count; k++) {
            const angle = (k * 2 * Math.PI) / count;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax + Math.cos(angle) * maxR, ay + Math.sin(angle) * maxR);
            ctx.stroke();
          }
        }

        // Draw center origin marker
        ctx.setLineDash([]);
        ctx.fillStyle = '#3B82F6';
        ctx.beginPath();
        ctx.arc(ax, ay, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      if (currentUI.onionSkinEnabled && currentUI.mode === 'edit') {
         const onionMode = currentUI.onionSkinMode || 'both';

         // 1. STATE MACHINE POSE ONION SKINNING
         const sm = currentProject.stateMachines?.find(s => s.id === currentProject.activeStateMachineId) || currentProject.stateMachines?.[0];
         const activePoseNodeId = currentUI.activeStateNodeId || currentUI.selectedGraphNodeId;
         const activePoseNode = sm?.nodes.find(n => n.id === activePoseNodeId && n.type === 'pose');
         const currentSelectedLayer = currentProject.layers.find(l => l.id === currentUI.selectedLayerId);
         const isPoseMode = activePoseNode || currentSelectedLayer?.driverMode === 'pose';

         if (isPoseMode && sm) {
           const targetPose = activePoseNode || sm.nodes.find(n => n.type === 'pose' && (n.targetLayerId === currentUI.selectedLayerId || !n.targetLayerId));
           const incomingNodeIds = targetPose ? sm.transitions.filter(t => t.toNodeId === targetPose.id).map(t => t.fromNodeId) : [];
           const outgoingNodeIds = targetPose ? sm.transitions.filter(t => t.fromNodeId === targetPose.id).map(t => t.toNodeId) : [];

           const posesToRender: { node: typeof sm.nodes[0]; color: string; label: string }[] = [];

           sm.nodes.forEach(n => {
             if (n.type !== 'pose' || !n.poseData?.layerStates || n.poseData.layerStates.length === 0) return;
             if (targetPose && n.id === targetPose.id) return;

             if (incomingNodeIds.includes(n.id)) {
               if (onionMode === 'both' || onionMode === 'prev') {
                 posesToRender.push({ node: n, color: '#06B6D4', label: 'Pose Précédente' });
               }
             } else if (outgoingNodeIds.includes(n.id)) {
               if (onionMode === 'both' || onionMode === 'next') {
                 posesToRender.push({ node: n, color: '#F97316', label: 'Pose Suivante' });
               }
             } else if (incomingNodeIds.length === 0 && outgoingNodeIds.length === 0) {
               // If no transitions exist, render other poses of this layer
               const sameLayer = (!n.targetLayerId && !targetPose?.targetLayerId) ||
                                 (n.targetLayerId === targetPose?.targetLayerId) ||
                                 (n.targetLayerId === currentUI.selectedLayerId);
               if (sameLayer) {
                 posesToRender.push({ node: n, color: '#8B5CF6', label: 'Autre Pose' });
               }
             }
           });

           posesToRender.forEach(({ node, color }) => {
             node.poseData?.layerStates.forEach(ls => {
               const targetLayer = currentProject.layers.find(l => l.id === ls.layerId);
               if (!targetLayer || !targetLayer.visible) return;

               const isLayerActive = targetLayer.id === currentUI.selectedLayerId;
               if (!isLayerActive && currentUI.inactiveLayerMode === 'hidden') return;

               ls.strokes.forEach(s => {
                 if (!s.points || s.points.length === 0) return;
                 const isSpline = targetLayer.interpolationMode === 'spline';
                 const resolvedStyle = resolveStrokeStyle(s, targetLayer);
                 const cornerRoundness = resolvedStyle.cornerRoundness ?? 0;
                 const strokeRadii = s.shapeConfig?.cornerRadii || resolvedStyle.cornerRadii;
                 const isQuadShape = s.points.length === 4 || s.points.length === 5;

                 ctx.save();
                 ctx.globalAlpha = Math.min(0.8, (currentUI.onionSkinOpacity ?? 0.35) * (targetLayer.opacity ?? 1));

                 if (isSpline) {
                   drawCatmullRomSpline(ctx, s.points, 0.5);
                 } else if (isQuadShape && (strokeRadii || cornerRoundness > 0)) {
                   drawRoundedRectangle(ctx, s.points, strokeRadii, cornerRoundness);
                 } else {
                   ctx.beginPath();
                   if (cornerRoundness > 0) {
                     drawCornerRoundedPath(ctx, s.points, cornerRoundness);
                   } else {
                     ctx.moveTo(s.points[0].x, s.points[0].y);
                     for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
                   }
                   if (s.closed) ctx.closePath();
                 }

                 ctx.strokeStyle = color;
                 ctx.lineWidth = Math.max(1.5, (resolvedStyle.strokeWidth || 2) * 0.8);
                 ctx.setLineDash([4, 4]);
                 ctx.stroke();
                 ctx.restore();
               });
             });
           });
         } else if (currentUI.isTimelineOpen) {
           // TIMELINE ONION SKINNING: Show previous keyframe pose (cyan) and next keyframe pose (orange)
           const activeAnim = currentProject.animations?.find(a => a.id === currentUI.activeAnimationId) || currentProject.animations?.[0];
           const currentTime = currentUI.timelineCurrentTime ?? 0;

           currentProject.layers.forEach(layer => {
             if (!layer.visible) return;
             const isLayerActive = layer.id === currentUI.selectedLayerId;
             if (!isLayerActive && currentUI.inactiveLayerMode === 'hidden') return;

             const track = activeAnim?.tracks?.find(t => t.layerId === layer.id);
             if (!track || !track.keyframes || track.keyframes.length < 2) return;

             const sorted = [...track.keyframes].sort((a, b) => a.time - b.time);
             const prevKf = sorted.filter(k => k.time < currentTime - 0.02).pop();
             const nextKf = sorted.find(k => k.time > currentTime + 0.02);

             const posesToRender = [
               { kf: prevKf, color: '#06B6D4', label: 'Précédent' },
               { kf: nextKf, color: '#F97316', label: 'Suivant' }
             ].filter(p => p.kf && p.kf.strokes && p.kf.strokes.length > 0);

             posesToRender.forEach(({ kf, color }) => {
               if (!kf || !kf.strokes) return;
               kf.strokes.forEach(s => {
                 if (!s.points || s.points.length === 0) return;
                 const isSpline = layer.interpolationMode === 'spline';
                 const resolvedStyle = resolveStrokeStyle(s, layer);
                 const cornerRoundness = resolvedStyle.cornerRoundness ?? 0;
                 const strokeRadii = s.shapeConfig?.cornerRadii || resolvedStyle.cornerRadii;
                 const isQuadShape = s.points.length === 4 || s.points.length === 5;

                 ctx.save();
                 ctx.globalAlpha = Math.min(0.8, (currentUI.onionSkinOpacity ?? 0.35) * (layer.opacity ?? 1));

                 if (isSpline) {
                   drawCatmullRomSpline(ctx, s.points, 0.5);
                 } else if (isQuadShape && (strokeRadii || cornerRoundness > 0)) {
                   drawRoundedRectangle(ctx, s.points, strokeRadii, cornerRoundness);
                 } else {
                   ctx.beginPath();
                   if (cornerRoundness > 0) {
                     drawCornerRoundedPath(ctx, s.points, cornerRoundness);
                   } else {
                     ctx.moveTo(s.points[0].x, s.points[0].y);
                     for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
                   }
                 }

                 ctx.strokeStyle = color;
                 ctx.lineWidth = Math.max(1.5, (resolvedStyle.strokeWidth || 2) * 0.8);
                 ctx.setLineDash([4, 4]);
                 ctx.stroke();
                 ctx.restore();
               });
             });
           });
         } else {
           // MATRIX ONION SKINNING
           currentProject.keyframes.forEach(kf => {
            if (kf.id === currentUI.selectedKeyframeId) return; 
            
            kf.layerStates.forEach(ls => {
               const targetLayer = currentProject.layers.find(l => l.id === ls.layerId);
               if (!targetLayer || !targetLayer.visible) return;

               const isLayerActive = targetLayer.id === currentUI.selectedLayerId;
               if (!isLayerActive && currentUI.inactiveLayerMode === 'hidden') return;

               const inactiveMultiplier = isLayerActive ? 1.0 : (currentUI.inactiveLayerOpacity ?? 0.35);
               const stroke = ls.strokes[0];
               if (stroke && stroke.points.length > 1) {
                 const isSpline = targetLayer?.interpolationMode === 'spline';
                 const resolvedStyle = resolveStrokeStyle(stroke, targetLayer);
                 const cornerRoundness = resolvedStyle.cornerRoundness ?? 0;

                 const layerSym = targetLayer?.symmetry?.enabled ? targetLayer.symmetry : (
                   (targetLayer?.id === currentUI.selectedLayerId && currentUI.symmetryEnabled && currentUI.symmetryTarget !== 'merge') ? {
                     enabled: true,
                     type: currentUI.symmetryType,
                     axisX: currentUI.symmetryAxisX ?? (CANVAS_WIDTH / 2),
                     axisY: currentUI.symmetryAxisY ?? (CANVAS_HEIGHT / 2),
                     radialCount: currentUI.symmetryRadialCount || 4
                   } : null
                 );

                 const onionPaths = [stroke.points];
                 if (layerSym && layerSym.enabled) {
                   const ax = layerSym.axisX ?? (CANVAS_WIDTH / 2);
                   const ay = layerSym.axisY ?? (CANVAS_HEIGHT / 2);
                   onionPaths.push(...getSymmetricPoints(stroke.points, layerSym.type, ax, ay, layerSym.radialCount || 4));
                 }

                 onionPaths.forEach(pts => {
                   if (pts.length === 0) return;
                   
                   const strokeRadii = stroke.shapeConfig?.cornerRadii || resolvedStyle.cornerRadii;
                   const isQuadShape = pts.length === 4 || pts.length === 5;

                   const renderPath = () => {
                     if (isSpline) {
                       drawCatmullRomSpline(ctx, pts, 0.5);
                     } else if (isQuadShape && (strokeRadii || cornerRoundness > 0)) {
                       drawRoundedRectangle(ctx, pts, strokeRadii, cornerRoundness);
                     } else {
                       ctx.beginPath();
                       if (cornerRoundness > 0) {
                         drawCornerRoundedPath(ctx, pts, cornerRoundness);
                       } else {
                         ctx.moveTo(pts[0].x, pts[0].y);
                         for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
                       }
                     }
                   };

                   // 1. Translucent Styled representation
                   if (onionMode === 'styled' || onionMode === 'both') {
                     ctx.save();
                     ctx.globalAlpha = currentUI.onionSkinOpacity * (targetLayer?.opacity ?? 1) * inactiveMultiplier;
                     renderPath();
                     if (resolvedStyle.fillColor && resolvedStyle.fillColor !== 'none') {
                       ctx.fillStyle = resolvedStyle.fillColor;
                       ctx.fill();
                     }
                     if (resolvedStyle.strokeColor && resolvedStyle.strokeColor !== 'none') {
                       ctx.lineCap = currentUI.strokeCap || 'round';
                       ctx.lineJoin = 'round';
                       ctx.strokeStyle = resolvedStyle.strokeColor;
                       ctx.lineWidth = resolvedStyle.strokeWidth;
                       ctx.stroke();
                     }
                     ctx.restore();
                   }

                   // 2. Wireframe Thin line
                   if (onionMode === 'wireframe' || onionMode === 'both') {
                     ctx.save();
                     ctx.globalAlpha = Math.min(1.0, (currentUI.onionSkinOpacity * 2.5 + 0.2) * inactiveMultiplier);
                     renderPath();
                     ctx.strokeStyle = isLayerActive ? '#3B82F6' : '#64748B';
                     ctx.lineWidth = 1;
                     ctx.setLineDash([]);
                     ctx.stroke();
                     ctx.restore();
                   }
                 });
               }
            });
          });
         }
      }

      currentProject.layers.forEach(layer => {
        if (!layer.visible) return;
        
        const isLayerActive = layer.id === currentUI.selectedLayerId;
        const isCreatingNewState = currentUI.selectedKeyframeId === null;
        const isActivelyDrawingOnThisLayer = (interactionModeRef.current === 'drawing' || currentPolyline.length > 0) && isLayerActive;

        // Inactive layer visibility modes
        if (!isLayerActive && currentUI.mode !== 'play') {
          if (currentUI.inactiveLayerMode === 'hidden') return;
        }

        let layerGlobalAlpha = layer.opacity;
        let isInactiveWireframe = false;

        if (!isLayerActive && currentUI.mode !== 'play') {
          if (currentUI.inactiveLayerMode === 'wireframe') {
            isInactiveWireframe = true;
            layerGlobalAlpha *= (currentUI.inactiveLayerOpacity ?? 0.3);
          } else if (currentUI.inactiveLayerMode === 'normal') {
            layerGlobalAlpha = layer.opacity;
          } else {
            // 'dimmed' (default)
            layerGlobalAlpha *= (currentUI.inactiveLayerOpacity ?? 0.3);
          }
        }

        if (isLayerActive) {
          if (isActivelyDrawingOnThisLayer && !layer.isGuide) {
            // Dim existing stroke while redrawing new stroke over it
            layerGlobalAlpha *= (currentUI.redrawGhostOpacity ?? 0.25);
          } else if (isCreatingNewState && currentUI.mode === 'edit' && !layer.isGuide) {
            layerGlobalAlpha *= (currentUI.ghostStrokeOpacity ?? 0.4);
          }
        }

        const layerRelevantKeyframes = currentProject.keyframes.filter(kf => {
            const ls = kf.layerStates.find(s => s.layerId === layer.id);
            return ls && ls.strokes.length > 0;
        });

        if (layer.isGuide) {
          // Guide / Reference Layer rendering
          
          let strokesToRender: Stroke[] = [];

          if (currentUI.mode === 'play' && layerRelevantKeyframes.length > 0) {
            // PLAY MODE (Nearest State / Discrete Selection)
            // No interpolation. Find the keyframe with the absolute highest weight based on matrix cursor position.
            const weights = calculateInterpolationWeights(
              currentAxesDict, 
              layerRelevantKeyframes, 
              currentUI.interpolationExponent, 
              currentUI.interpolationStrategy,
              false, // allowExtrapolation
              0, // extrapolationFactor
              currentUI.gridCurvature
            );

            let maxWeight = -Infinity;
            let nearestKfId = '';
            for (const [kfId, weight] of Object.entries(weights)) {
               if (weight > maxWeight) {
                   maxWeight = weight;
                   nearestKfId = kfId;
               }
            }

            const nearestKf = layerRelevantKeyframes.find(k => k.id === nearestKfId);
            if (nearestKf) {
                strokesToRender = nearestKf.layerStates.find(ls => ls.layerId === layer.id)?.strokes || [];
            }
          } else {
            // EDIT MODE: show selected keyframe's guide state
            const selectedKf = currentProject.keyframes.find(k => k.id === currentUI.selectedKeyframeId) || currentProject.keyframes[0];
            const kfStrokes = selectedKf?.layerStates.find(ls => ls.layerId === layer.id)?.strokes;
            strokesToRender = kfStrokes || [];
            
            // Legacy/fallback: only if NO keyframes contain ANY strokes for this guide layer
            if (layerRelevantKeyframes.length === 0 && layer.guideStrokes) {
               strokesToRender = layer.guideStrokes;
            }
          }

          // Guide Onion Skin Rendering
          let renderedKfId = currentUI.mode === 'play' ? null : currentUI.selectedKeyframeId;
          if (currentUI.mode === 'play') {
            // Find which one was actually used
            const match = layerRelevantKeyframes.find(k => k.layerStates.find(ls => ls.layerId === layer.id)?.strokes === strokesToRender);
            if (match) renderedKfId = match.id;
          }

          if (currentUI.guideOnionSkinEnabled && (currentUI.mode === 'edit' || currentUI.guideOnionSkinInPlayMode) && layerRelevantKeyframes.length > 0) {
            const onionMode = currentUI.onionSkinMode || 'both';
            
            const activeKf = currentProject.keyframes.find(k => k.id === renderedKfId);
            const axisXId = currentProject.axes[0]?.id;
            const axisYId = currentProject.axes[1]?.id;

            layerRelevantKeyframes.forEach(kf => {
              if (kf.id === renderedKfId) return; // Skip the actively rendered one
              
              let alphaMultiplier = 1;
              let tintColor: string | null = null;
              
              if (axisXId || axisYId) {
                 const currX = axisXId ? ((currentUI.mode === 'play' ? currentAxesDict[axisXId] : activeKf?.axisValues[axisXId]) ?? 0) : 0;
                 const currY = axisYId ? ((currentUI.mode === 'play' ? currentAxesDict[axisYId] : activeKf?.axisValues[axisYId]) ?? 0) : 0;
                 
                 const kfX = axisXId ? (kf.axisValues[axisXId] ?? 0) : 0;
                 const kfY = axisYId ? (kf.axisValues[axisYId] ?? 0) : 0;
                 
                 const dx = kfX - currX;
                 const dy = kfY - currY;
                 
                 if (currentUI.guideOnionDistanceOpacity) {
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const range = currentUI.guideOnionDistanceRange || 2.0;
                    alphaMultiplier = Math.max(0, 1 - (dist / range));
                 }
                 
                 if (currentUI.guideOnionDirectionalTint) {
                    if (Math.abs(dx) > Math.abs(dy)) {
                       tintColor = dx > 0 ? (currentUI.guideOnionColorRight || '#3b82f6') : (currentUI.guideOnionColorLeft || '#ef4444');
                    } else if (Math.abs(dy) > Math.abs(dx)) {
                       // Assuming matrix positive Y is typically mapped to 'Down' in user perception
                       tintColor = dy > 0 ? (currentUI.guideOnionColorDown || '#f97316') : (currentUI.guideOnionColorUp || '#22c55e');
                    } else {
                       // Diagonal or same point?
                       if (dx !== 0 || dy !== 0) {
                           tintColor = dx > 0 ? (currentUI.guideOnionColorRight || '#3b82f6') : (currentUI.guideOnionColorLeft || '#ef4444');
                       }
                    }
                 }
              }
              
              if (alphaMultiplier <= 0) return;

              const kfStrokes = kf.layerStates.find(ls => ls.layerId === layer.id)?.strokes || [];
              kfStrokes.forEach(s => {
                 if (!s.points || s.points.length === 0) return;
                 const resolvedStyle = resolveStrokeStyle(s, layer);
                 const rRoundness = resolvedStyle.cornerRoundness ?? 0;
                 const rRadii = s.shapeConfig?.cornerRadii || resolvedStyle.cornerRadii;
                 const isRectangleShape = s.shapeConfig?.type === 'rectangle';
                 const isSpline = layer.interpolationMode === 'spline';

                 const renderPath = () => {
                   if (isSpline) {
                     drawCatmullRomSpline(ctx, s.points, 0.5);
                   } else if (isRectangleShape && (rRadii || rRoundness > 0)) {
                     drawRoundedRectangle(ctx, s.points, rRadii, rRoundness);
                   } else {
                     ctx.beginPath();
                     if (rRoundness > 0) {
                       drawCornerRoundedPath(ctx, s.points, rRoundness);
                     } else {
                       ctx.moveTo(s.points[0].x, s.points[0].y);
                       for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
                     }
                   }
                 };

                 // Translucent Styled representation
                 if (onionMode === 'styled' || onionMode === 'both') {
                   ctx.save();
                   ctx.globalAlpha = (currentUI.onionSkinOpacity ?? 0.2) * (layer.opacity ?? 1) * alphaMultiplier;
                   renderPath();
                   if (resolvedStyle.fillColor && resolvedStyle.fillColor !== 'none') {
                     ctx.fillStyle = tintColor || resolvedStyle.fillColor;
                     ctx.fill();
                   }
                   if (resolvedStyle.strokeColor && resolvedStyle.strokeColor !== 'none') {
                     ctx.lineCap = currentUI.strokeCap || 'round';
                     ctx.lineJoin = 'round';
                     ctx.strokeStyle = tintColor || resolvedStyle.strokeColor;
                     ctx.lineWidth = resolvedStyle.strokeWidth;
                     ctx.stroke();
                   }
                   ctx.restore();
                 }

                 // Wireframe representation
                 if (onionMode === 'wireframe' || onionMode === 'both') {
                   ctx.save();
                   ctx.globalAlpha = Math.min(1.0, ((currentUI.onionSkinOpacity ?? 0.2) * 2.5 + 0.2)) * alphaMultiplier;
                   renderPath();
                   ctx.strokeStyle = tintColor || '#64748B';
                   ctx.lineWidth = 1;
                   ctx.stroke();
                   ctx.restore();
                 }
              });
            });
          }

          strokesToRender.forEach(s => {
            if (!s.points || s.points.length === 0) return;
            const resolvedStyle = resolveStrokeStyle(s, layer);
            let sFill = isInactiveWireframe ? 'none' : resolvedStyle.fillColor;
            let sColor = resolvedStyle.strokeColor;
            let sWidth = isInactiveWireframe ? 1 : resolvedStyle.strokeWidth;
            const rRoundness = resolvedStyle.cornerRoundness ?? 0;
            const rRadii = s.shapeConfig?.cornerRadii || resolvedStyle.cornerRadii;
            const isRectangleShape = s.shapeConfig?.type === 'rectangle';

            if (layer.interpolationMode === 'spline') {
              drawCatmullRomSpline(ctx, s.points, 0.5);
            } else if (isRectangleShape && (rRadii || rRoundness > 0)) {
              drawRoundedRectangle(ctx, s.points, rRadii, rRoundness);
            } else {
              ctx.beginPath();
              if (rRoundness > 0) {
                drawCornerRoundedPath(ctx, s.points, rRoundness);
              } else {
                ctx.moveTo(s.points[0].x, s.points[0].y);
                for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
              }
            }

            ctx.globalAlpha = layerGlobalAlpha;
            switch(layer.blendMode) {
              case 'multiply': ctx.globalCompositeOperation = 'multiply'; break;
              case 'screen': ctx.globalCompositeOperation = 'screen'; break;
              case 'overlay': ctx.globalCompositeOperation = 'overlay'; break;
              case 'difference': ctx.globalCompositeOperation = 'difference'; break;
              case 'exclusion': ctx.globalCompositeOperation = 'exclusion'; break;
              default: ctx.globalCompositeOperation = 'source-over';
            }

            if (sFill && sFill !== 'none') {
              ctx.fillStyle = sFill;
              ctx.fill();
            }
            if (sColor && sColor !== 'none') {
              ctx.lineCap = currentUI.strokeCap || 'round';
              ctx.lineJoin = 'round';
              ctx.strokeStyle = sColor;
              ctx.lineWidth = sWidth;
              ctx.stroke();
            }
          });

          ctx.globalAlpha = 1.0;
          ctx.globalCompositeOperation = 'source-over';
          return;
        }

        // State Machine Pose / Transition Interpolation in Play Mode or when State Machine is active/open
        if ((currentUI.mode === 'play' || currentUI.isStateMachineOpen || currentUI.activeStateNodeId) && currentProject.stateMachines && currentProject.stateMachines.length > 0) {
          let smStrokes: Stroke[] | null = null;
          const sm = currentProject.stateMachines.find(s => s.id === currentProject.activeStateMachineId) || currentProject.stateMachines[0];
          const activeNodeId = currentUI.activeStateNodeId || (currentUI.mode === 'play' ? sm.entryNodeId : null);
          const activeNode = activeNodeId ? sm.nodes.find(n => n.id === activeNodeId) : null;
          const isLayerTargeted = !activeNode?.targetLayerId || activeNode.targetLayerId === 'all' || activeNode.targetLayerId === layer.id;

          if (stateMachineTransitionRef.current) {
            const trans = stateMachineTransitionRef.current;
            const isTransitionTargeted = !trans.targetLayerId || trans.targetLayerId === 'all' || trans.targetLayerId === layer.id;
            if (isTransitionTargeted) {
              const elapsed = performance.now() - trans.startTime;
              const prog = Math.min(1, elapsed / Math.max(1, trans.duration));
              const easedProg = evaluateEasing(prog, trans.easing || 'easeInOut');
              const strokesA = trans.fromStrokesMap[layer.id] || [];
              const strokesB = trans.toStrokesMap[layer.id] || [];
              if (strokesA.length > 0 || strokesB.length > 0) {
                smStrokes = interpolateStrokesDirect(strokesA, strokesB, easedProg, layer.interpolationMode || 'linear', layer);
              }
            }
          } else if (isLayerTargeted && activeNode) {
            if (activeNode.type === 'pose' && activeNode.poseData?.layerStates) {
              const ls = activeNode.poseData.layerStates.find(s => s.layerId === layer.id);
              if (ls && ls.strokes && ls.strokes.length > 0) {
                smStrokes = ls.strokes;
              }
            }
          }

          if (smStrokes && smStrokes.length > 0) {
            smStrokes.forEach(s => {
              if (!s.points || s.points.length === 0) return;
              const resolvedStyle = resolveStrokeStyle(s, layer);
              let sFill = isInactiveWireframe ? 'none' : resolvedStyle.fillColor;
              let sColor = resolvedStyle.strokeColor;
              let sWidth = isInactiveWireframe ? 1 : resolvedStyle.strokeWidth;
              const rRoundness = resolvedStyle.cornerRoundness ?? 0;
              const rRadii = s.shapeConfig?.cornerRadii || resolvedStyle.cornerRadii;
              const isRectangleShape = s.shapeConfig?.type === 'rectangle';

              if (layer.interpolationMode === 'spline') {
                drawCatmullRomSpline(ctx, s.points, 0.5);
              } else if (isRectangleShape && (rRadii || rRoundness > 0)) {
                drawRoundedRectangle(ctx, s.points, rRadii, rRoundness);
              } else {
                ctx.beginPath();
                if (rRoundness > 0) {
                  drawCornerRoundedPath(ctx, s.points, rRoundness);
                } else {
                  ctx.moveTo(s.points[0].x, s.points[0].y);
                  for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
                }
                if (s.closed) ctx.closePath();
              }

              ctx.globalAlpha = layerGlobalAlpha;
              switch(layer.blendMode) {
                case 'multiply': ctx.globalCompositeOperation = 'multiply'; break;
                case 'screen': ctx.globalCompositeOperation = 'screen'; break;
                case 'overlay': ctx.globalCompositeOperation = 'overlay'; break;
                case 'difference': ctx.globalCompositeOperation = 'difference'; break;
                case 'exclusion': ctx.globalCompositeOperation = 'exclusion'; break;
                default: ctx.globalCompositeOperation = 'source-over';
              }

              if (sFill && sFill !== 'none') {
                ctx.fillStyle = sFill;
                ctx.fill();
              }
              if (sColor && sColor !== 'none') {
                ctx.lineCap = currentUI.strokeCap || 'round';
                ctx.lineJoin = 'round';
                ctx.strokeStyle = sColor;
                ctx.lineWidth = sWidth;
                ctx.stroke();
              }
            });

            ctx.globalAlpha = 1.0;
            ctx.globalCompositeOperation = 'source-over';
            return;
          }
        }

        // Timeline Driver Mode: evaluate layer temporally from its timeline track
        const smForTrack = currentProject.stateMachines?.find(s => s.id === currentProject.activeStateMachineId) || currentProject.stateMachines?.[0];
        const activeNodeForTrack = smForTrack ? smForTrack.nodes.find(n => n.id === (currentUI.activeStateNodeId || (currentUI.mode === 'play' ? smForTrack.entryNodeId : null))) : null;
        const activeAnim = currentProject.animations?.find(a => a.id === currentUI.activeAnimationId) || currentProject.animations?.[0];
        const track = activeAnim?.tracks?.find(t => t.layerId === layer.id);
        const hasTrack = !!(track && track.keyframes && track.keyframes.length > 0);

        const isTimelineDriving = 
          (layer.driverMode === 'timeline' && hasTrack) ||
          (currentUI.timelinePlaying && hasTrack) ||
          (currentUI.isTimelineOpen && hasTrack) ||
          (currentUI.mode === 'play' && hasTrack && (!activeNodeForTrack || activeNodeForTrack.type === 'clip' || (activeNodeForTrack.type === 'pose' && activeNodeForTrack.targetLayerId !== layer.id)));

        if (isTimelineDriving) {
          if (track && track.keyframes && track.keyframes.length > 0) {
            const tTime = currentUI.timelineCurrentTime ?? 0;
            const evalStrokes = evaluateLayerTimelineStrokes(
              track,
              tTime,
              layer.interpolationMode || 'linear',
              interpolationTargetCount,
              activeAnim?.loopMode || 'loop',
              activeAnim?.duration || 2.0,
              layer // Add the missing layer argument here
            );

            if (evalStrokes && evalStrokes.length > 0) {
              evalStrokes.forEach(s => {
                if (!s.points || s.points.length === 0) return;
                const resolvedStyle = resolveStrokeStyle(s, layer);
                let sFill = isInactiveWireframe ? 'none' : resolvedStyle.fillColor;
                let sColor = resolvedStyle.strokeColor;
                let sWidth = isInactiveWireframe ? 1 : resolvedStyle.strokeWidth;
                const rRoundness = resolvedStyle.cornerRoundness ?? 0;
                const rRadii = s.shapeConfig?.cornerRadii || resolvedStyle.cornerRadii;
                const isRectangleShape = s.shapeConfig?.type === 'rectangle';

                if (layer.interpolationMode === 'spline') {
                  drawCatmullRomSpline(ctx, s.points, 0.5);
                } else if (isRectangleShape && (rRadii || rRoundness > 0)) {
                  drawRoundedRectangle(ctx, s.points, rRadii, rRoundness);
                } else {
                  ctx.beginPath();
                  if (rRoundness > 0) {
                    drawCornerRoundedPath(ctx, s.points, rRoundness);
                  } else {
                    ctx.moveTo(s.points[0].x, s.points[0].y);
                    for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
                  }
                  if (s.closed) ctx.closePath();
                }

                ctx.globalAlpha = layerGlobalAlpha;
                switch(layer.blendMode) {
                  case 'multiply': ctx.globalCompositeOperation = 'multiply'; break;
                  case 'screen': ctx.globalCompositeOperation = 'screen'; break;
                  case 'overlay': ctx.globalCompositeOperation = 'overlay'; break;
                  case 'difference': ctx.globalCompositeOperation = 'difference'; break;
                  case 'exclusion': ctx.globalCompositeOperation = 'exclusion'; break;
                  default: ctx.globalCompositeOperation = 'source-over';
                }

                if (sFill && sFill !== 'none') {
                  ctx.fillStyle = sFill;
                  ctx.fill();
                }
                if (sColor && sColor !== 'none') {
                  ctx.lineCap = currentUI.strokeCap || 'round';
                  ctx.lineJoin = 'round';
                  ctx.strokeStyle = sColor;
                  ctx.lineWidth = sWidth;
                  ctx.stroke();
                }
              });

              ctx.globalAlpha = 1.0;
              ctx.globalCompositeOperation = 'source-over';
              return;
            }
          }
        }

        if (layerRelevantKeyframes.length === 0) return;

        // In Edit Mode with a selected keyframe:
        // For the ACTIVE layer, if this keyframe does NOT have a stroke yet (an unkeyed/empty state on this layer),
        // do not render a phantom solid stroke for it. (Other layers remain visible in their inactive transparency mode).
        if (isLayerActive && currentUI.mode === 'edit' && currentUI.selectedKeyframeId) {
            const currentKf = currentProject.keyframes.find(k => k.id === currentUI.selectedKeyframeId);
            const currentLayerState = currentKf?.layerStates.find(s => s.layerId === layer.id);
            const hasStrokeInCurrentKf = (currentLayerState?.strokes.length || 0) > 0;
            if (!hasStrokeInCurrentKf) {
                return;
            }
        }

        const allowExtrapolation = currentUI.overshootExtrapolationEnabled ?? true;
        const extrapolationFactor = currentUI.overshootExtrapolationFactor ?? 0.2;

        const weights = calculateInterpolationWeights(
            currentAxesDict, 
            layerRelevantKeyframes, 
            currentUI.interpolationExponent, 
            currentUI.interpolationStrategy,
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
                cornerRadii: s?.shapeConfig?.cornerRadii || resolvedStyle.cornerRadii
            };
        });

        const sortedByWeight = [...strokeData].sort((a,b) => b.weight - a.weight);
        const primaryStroke = sortedByWeight.find(sd => sd.style)?.style;
        if (!primaryStroke) return;

        let { points: interpolatedPoints, color: interpolatedColor, fillColor: interpolatedFill, width: interpolatedWidth, cornerRoundness: interpolatedCornerRoundness, cornerRadii: interpolatedCornerRadii } = interpolateStrokePoints(
            strokeId, 
            primaryStroke.points, 
            strokeData, 
            layer.interpolationMode,
            interpolationTargetCount,
            {
                exaggerationEnabled: currentUI.overshootExaggerationEnabled,
                exaggerationFactor: currentUI.overshootExaggerationFactor ?? 1.25
            }
        );

        // Approach B: Dynamic Vertex Inertial Velocity / Jiggle (Disney Follow-Through)
        if (currentUI.overshootVertexInertiaEnabled && interpolatedPoints.length > 0 && currentUI.mode === 'play') {
            const stiffness = (currentUI.overshootVertexInertiaFactor ?? 0.6) * 120.0;
            const damping = (currentUI.overshootVertexDamping ?? 0.75) * 35.0;
            const mass = Math.max(0.1, currentUI.overshootVertexMass ?? 1.0);
            const inertiaKey = `layer-${layer.id}-stroke-${strokeId}`;
            let stored = vertexInertiaRef.current.get(inertiaKey);

            if (!stored || stored.current.length !== interpolatedPoints.length) {
                stored = {
                    current: interpolatedPoints.map(p => ({ ...p })),
                    velocity: interpolatedPoints.map(() => ({ x: 0, y: 0 }))
                };
                vertexInertiaRef.current.set(inertiaKey, stored);
            } else {
                const subSteps = 2;
                const subDt = Math.min(dt, 0.05) / subSteps;
                const snapProtection = currentUI.overshootVertexSnapProtection ?? 0.75;

                for (let step = 0; step < subSteps; step++) {
                    for (let i = 0; i < interpolatedPoints.length; i++) {
                        const targetPt = interpolatedPoints[i];
                        const curPt = stored.current[i];
                        const vel = stored.velocity[i];

                        const dx = targetPt.x - curPt.x;
                        const dy = targetPt.y - curPt.y;
                        const dist = Math.hypot(dx, dy);

                        // Adaptive damping: when distant (high displacement), dynamically increase damping to avoid runaway oscillation/whipping
                        const effectiveDamping = snapProtection > 0 
                            ? damping * (1 + snapProtection * Math.min(3.0, dist / 80.0))
                            : damping;

                        // Second-order Spring-Damper-Mass Force: F = k*(target - cur) - c*vel
                        let springF_x = dx * stiffness - vel.x * effectiveDamping;
                        let springF_y = dy * stiffness - vel.y * effectiveDamping;

                        if (snapProtection > 0) {
                            // Clamp max acceleration to prevent sudden explosive snaps
                            const maxAcc = 20000 * (1 - snapProtection * 0.4);
                            const currentAcc = Math.hypot(springF_x / mass, springF_y / mass);
                            if (currentAcc > maxAcc) {
                                const ratio = maxAcc / currentAcc;
                                springF_x *= ratio;
                                springF_y *= ratio;
                            }
                        }

                        vel.x += (springF_x / mass) * subDt;
                        vel.y += (springF_y / mass) * subDt;

                        if (snapProtection > 0) {
                            // Clamp max velocity to prevent vertex whipping
                            const maxVel = 2500 * (1 - snapProtection * 0.35);
                            const currentVel = Math.hypot(vel.x, vel.y);
                            if (currentVel > maxVel) {
                                const ratio = maxVel / currentVel;
                                vel.x *= ratio;
                                vel.y *= ratio;
                            }
                        }

                        curPt.x += vel.x * subDt;
                        curPt.y += vel.y * subDt;
                        curPt.pressure = targetPt.pressure;
                    }
                }
                interpolatedPoints = stored.current.map(p => ({ ...p }));
            }
        } else if (currentUI.mode !== 'play') {
            vertexInertiaRef.current.clear();
        }

        if (isInactiveWireframe) {
          interpolatedFill = 'none';
          interpolatedWidth = 1;
        }

        if (interpolatedPoints.length > 0) {
            const layerSym = layer.symmetry?.enabled ? layer.symmetry : (
              (layer.id === currentUI.selectedLayerId && currentUI.symmetryEnabled && currentUI.symmetryTarget !== 'merge') ? {
                enabled: true,
                type: currentUI.symmetryType,
                axisX: currentUI.symmetryAxisX ?? (CANVAS_WIDTH / 2),
                axisY: currentUI.symmetryAxisY ?? (CANVAS_HEIGHT / 2),
                radialCount: currentUI.symmetryRadialCount || 4
              } : null
            );

            const allInterpolatedPaths = [interpolatedPoints];
            if (layerSym && layerSym.enabled) {
              const ax = layerSym.axisX ?? (CANVAS_WIDTH / 2);
              const ay = layerSym.axisY ?? (CANVAS_HEIGHT / 2);
              const symVariants = getSymmetricPoints(interpolatedPoints, layerSym.type, ax, ay, layerSym.radialCount || 4);
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
              
              ctx.globalAlpha = layerGlobalAlpha;
              switch(layer.blendMode) {
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
                  ctx.lineCap = currentUI.strokeCap || 'round';
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

      if (interactionModeRef.current === 'drawing' && currentPointsRef.current.length > 0) {
        ctx.globalAlpha = 1.0; 

        const pts = currentPointsRef.current;
        const currentLayer = currentProject.layers.find(l => l.id === currentUI.selectedLayerId);
        const cornerRoundness = currentLayer?.baseStyle?.cornerRoundness || 0;

        const allPathsToRender = [pts];
        if (currentUI.symmetryEnabled) {
          const symVariants = getSymmetricPoints(
            pts,
            currentUI.symmetryType,
            currentUI.symmetryAxisX ?? (CANVAS_WIDTH / 2),
            currentUI.symmetryAxisY ?? (CANVAS_HEIGHT / 2),
            currentUI.symmetryRadialCount
          );
          allPathsToRender.push(...symVariants);
        }

        ctx.strokeStyle = currentUI.brushColor !== 'none' ? currentUI.brushColor : 'rgba(0,0,0,0.5)';
        ctx.lineWidth = currentUI.brushSize;
        ctx.lineCap = currentUI.strokeCap || 'round';
        ctx.lineJoin = 'round';

        allPathsToRender.forEach(pathPts => {
          if (pathPts.length === 0) return;
          ctx.beginPath();
          if (cornerRoundness > 0) {
            drawCornerRoundedPath(ctx, pathPts, cornerRoundness);
          } else {
            ctx.moveTo(pathPts[0].x, pathPts[0].y);
            for (let i = 1; i < pathPts.length; i++) ctx.lineTo(pathPts[i].x, pathPts[i].y);
          }
          ctx.stroke();
        });

        ctx.globalAlpha = 1.0; 
      }

      if (currentPolyline.length > 0) {
         const isGhostState = currentUI.selectedKeyframeId === null;
         
         const polyPreview = currentMousePos ? [...currentPolyline, currentMousePos] : currentPolyline;
         
         const currentLayer = currentProject.layers.find(l => l.id === currentUI.selectedLayerId);
         const isSpline = currentLayer?.interpolationMode === 'spline';
         const cornerRoundness = currentLayer?.baseStyle?.cornerRoundness || 0;

         const allPolyPreviews = [polyPreview];
         const allPolyAnchors = [currentPolyline];
         if (currentUI.symmetryEnabled) {
           const ax = currentUI.symmetryAxisX ?? (CANVAS_WIDTH / 2);
           const ay = currentUI.symmetryAxisY ?? (CANVAS_HEIGHT / 2);

           const symPreviews = getSymmetricPoints(
             polyPreview,
             currentUI.symmetryType,
             ax,
             ay,
             currentUI.symmetryRadialCount
           );
           allPolyPreviews.push(...symPreviews);

           const symAnchors = getSymmetricPoints(
             currentPolyline,
             currentUI.symmetryType,
             ax,
             ay,
             currentUI.symmetryRadialCount
           );
           allPolyAnchors.push(...symAnchors);
         }

         allPolyPreviews.forEach(previewPts => {
           if (previewPts.length === 0) return;
           if (isSpline) {
               drawCatmullRomSpline(ctx, previewPts, 0.5);
           } else {
               ctx.beginPath();
               if (cornerRoundness > 0) {
                   drawCornerRoundedPath(ctx, previewPts, cornerRoundness);
               } else {
                   ctx.moveTo(previewPts[0].x, previewPts[0].y);
                   for (let i = 1; i < previewPts.length; i++) ctx.lineTo(previewPts[i].x, previewPts[i].y);
               }
           }

           if (currentUI.fillColor !== 'none') {
               ctx.fillStyle = currentUI.fillColor;
               ctx.globalAlpha = isGhostState ? currentUI.ghostStrokeOpacity * 0.8 : 0.5;
               ctx.fill();
           }

           ctx.globalAlpha = 1.0;
           ctx.strokeStyle = currentUI.brushColor !== 'none' ? currentUI.brushColor : 'rgba(0,0,0,0.5)';
           ctx.lineWidth = currentUI.brushSize;
           ctx.stroke();
         });
         
         ctx.fillStyle = currentUI.brushColor !== 'none' ? currentUI.brushColor : 'rgba(0,0,0,0.5)';
         allPolyAnchors.forEach(anchors => {
           anchors.forEach((p, index) => {
              ctx.beginPath();
              const r = (index === 0) ? 5 : 3; 
              ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
              ctx.fill();
           });
         });
         ctx.globalAlpha = 1.0; 
      }

      // Live Shape Drawing Preview
      if (shapeDragStartRef.current && currentUI.mode === 'edit') {
        const startP = shapeDragStartRef.current.startPoint;
        const endP = shapeDragStartRef.current.currentPoint;
        const minX = Math.min(startP.x, endP.x);
        const minY = Math.min(startP.y, endP.y);
        const width = Math.max(1, Math.abs(endP.x - startP.x));
        const height = Math.max(1, Math.abs(endP.y - startP.y));
        const shapeType = currentUI.shapeType || 'rectangle';
        const sides = currentUI.shapeSides || 5;
        const cornerRadii = currentUI.cornerRadii || { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 };

        const previewConfig: ShapeConfig = {
          type: shapeType,
          minX,
          minY,
          width,
          height,
          cornerRadii: shapeType === 'rectangle' ? cornerRadii : undefined,
          sides: shapeType === 'polygon' ? sides : undefined,
          rotation: 0
        };

        const previewPts = generateShapePoints(previewConfig);
        if (previewPts.length > 0) {
          ctx.save();
          if (shapeType === 'rectangle' || shapeType === 'ellipse') {
            drawRoundedRectangle(ctx, previewPts, previewConfig.cornerRadii);
          } else {
            ctx.beginPath();
            ctx.moveTo(previewPts[0].x, previewPts[0].y);
            for (let i = 1; i < previewPts.length; i++) ctx.lineTo(previewPts[i].x, previewPts[i].y);
            ctx.closePath();
          }

          if (currentUI.fillColor !== 'none') {
            ctx.fillStyle = currentUI.fillColor;
            ctx.globalAlpha = 0.4;
            ctx.fill();
          }

          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = currentUI.brushColor !== 'none' ? currentUI.brushColor : '#3B82F6';
          ctx.lineWidth = currentUI.brushSize || 2;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.restore();
        }
      }

      if (currentSelectionBounds && (currentUI.selectedTool === 'select' || currentUI.selectedTool === 'shape') && currentUI.mode === 'edit') {
          const { cx, cy, width, height, rotation } = currentSelectionBounds;
          
          if (!isVertexModeActive) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(rotation);
            
            ctx.beginPath();
            ctx.strokeStyle = '#3B82F6';
            ctx.lineWidth = 1;
            ctx.rect(-width/2, -height/2, width, height);
            ctx.stroke();

            const HANDLE_SIZE = 8; 
            ctx.fillStyle = '#FFFFFF';
            ctx.strokeStyle = '#3B82F6';
            
            const drawHandle = (x: number, y: number) => {
                ctx.beginPath();
                ctx.rect(x - HANDLE_SIZE/2, y - HANDLE_SIZE/2, HANDLE_SIZE, HANDLE_SIZE);
                ctx.fill();
                ctx.stroke();
            };

            drawHandle(-width/2, -height/2);
            drawHandle(width/2, -height/2);
            drawHandle(-width/2, height/2);
            drawHandle(width/2, height/2);

            ctx.beginPath();
            ctx.moveTo(0, -height/2);
            ctx.lineTo(0, -height/2 - 25);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(0, -height/2 - 25, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#3B82F6';
            ctx.fill();

            // Render Figma-like inner Corner Handles ONLY for Rectangle shapes
            const activeStroke = resolveActiveVisibleStroke(currentProject, currentUI);
            const isRectangleShape = activeStroke?.shapeConfig?.type === 'rectangle';

            if (isRectangleShape) {
              const strokeRadii = activeStroke?.shapeConfig?.cornerRadii || activeStroke?.style?.cornerRadii || currentUI.cornerRadii || { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 };
              
              // Calculate corner handles in local coordinates (unrotated)
              const minX = -width / 2;
              const minY = -height / 2;
              const cornerHandles = getCornerHandlePositions(
                { minX, minY, width, height, rotation: 0 },
                strokeRadii
              );

              cornerHandles.forEach(ch => {
                ctx.beginPath();
                ctx.arc(ch.x, ch.y, 4.5, 0, Math.PI * 2);
                ctx.fillStyle = '#FFFFFF';
                ctx.fill();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = '#3B82F6';
                ctx.stroke();
              });
            }

            ctx.restore();
          }

          if (isVertexModeActive) {
            const activeStroke = resolveActiveVisibleStroke(currentProject, currentUI);
            if (activeStroke) {
                const VERTEX_RADIUS = 3;
                const ACTIVE_VERTEX_RADIUS = 5;
                
                ctx.strokeStyle = '#3B82F6';
                ctx.fillStyle = '#FFFFFF';
                
                activeStroke.points.forEach((p, idx) => {
                    const isActive = idx === activeVertIdx;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, isActive ? ACTIVE_VERTEX_RADIUS : VERTEX_RADIUS, 0, Math.PI * 2);
                    ctx.fillStyle = isActive ? '#3B82F6' : '#FFFFFF';
                    ctx.fill();
                    ctx.stroke();
                });
            }
          }
      }

      // Render Visual Collider Box / Circle in Edit Mode when editing an interaction or viewing Interactions Panel
      if (currentUI.mode === 'edit' && currentUI.isInteractionsOpen && currentProject.interactions) {
        currentProject.interactions.forEach(interaction => {
          if (!interaction.collider) return;
          const col = interaction.collider;
          const isSelected = currentUI.editingColliderInteractionId === interaction.id;
          
          // Draw rect or circle if custom collider
          if (col.type === 'rect') {
            const rx = col.rect?.x ?? col.x ?? 0;
            const ry = col.rect?.y ?? col.y ?? 0;
            const rw = col.rect?.width ?? col.width ?? 100;
            const rh = col.rect?.height ?? col.height ?? 100;

            ctx.save();
            ctx.strokeStyle = isSelected ? '#3B82F6' : 'rgba(59, 130, 246, 0.4)';
            ctx.lineWidth = isSelected ? 2 : 1;
            ctx.setLineDash(isSelected ? [5, 4] : [3, 3]);
            ctx.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.12)' : 'rgba(59, 130, 246, 0.04)';
            ctx.fillRect(rx, ry, rw, rh);
            ctx.strokeRect(rx, ry, rw, rh);

            // Label
            ctx.fillStyle = isSelected ? '#2563EB' : 'rgba(37, 99, 235, 0.6)';
            ctx.font = 'bold 10px monospace';
            ctx.fillText(`[Collider: ${interaction.name || 'Zone'}]`, rx + 4, Math.max(12, ry - 4));
            ctx.restore();
          } else if (col.type === 'circle') {
            const cx = col.circle?.x ?? col.x ?? 0;
            const cy = col.circle?.y ?? col.y ?? 0;
            const cr = col.circle?.radius ?? col.radius ?? 50;

            ctx.save();
            ctx.strokeStyle = isSelected ? '#3B82F6' : 'rgba(59, 130, 246, 0.4)';
            ctx.lineWidth = isSelected ? 2 : 1;
            ctx.setLineDash(isSelected ? [5, 4] : [3, 3]);
            ctx.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.12)' : 'rgba(59, 130, 246, 0.04)';
            ctx.beginPath();
            ctx.arc(cx, cy, cr, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Label
            ctx.fillStyle = isSelected ? '#2563EB' : 'rgba(37, 99, 235, 0.6)';
            ctx.font = 'bold 10px monospace';
            ctx.fillText(`[Collider: ${interaction.name || 'Zone'}]`, cx - cr, Math.max(12, cy - cr - 4));
            ctx.restore();
          }
        });
      }

      // Render Visual Collider Box / Circle for State Machine Transitions in Edit Mode
      if (currentUI.mode === 'edit' && (currentUI.isInteractionsOpen || currentUI.isStateMachineOpen) && currentProject.stateMachines) {
        const sm = currentProject.stateMachines.find(s => s.id === currentProject.activeStateMachineId) || currentProject.stateMachines[0];
        sm?.transitions.forEach(trans => {
          if (!trans.params?.collider) return;
          const col = trans.params.collider;
          const isSelected = currentUI.selectedGraphTransitionId === trans.id;
          
          if (col.type === 'rect') {
            const rx = col.x ?? 0;
            const ry = col.y ?? 0;
            const rw = col.width ?? 100;
            const rh = col.height ?? 100;

            ctx.save();
            ctx.strokeStyle = isSelected ? '#6366F1' : 'rgba(99, 102, 241, 0.45)';
            ctx.lineWidth = isSelected ? 2 : 1;
            ctx.setLineDash(isSelected ? [5, 4] : [3, 3]);
            ctx.fillStyle = isSelected ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.05)';
            ctx.fillRect(rx, ry, rw, rh);
            ctx.strokeRect(rx, ry, rw, rh);

            // Label
            ctx.fillStyle = isSelected ? '#4F46E5' : 'rgba(79, 70, 229, 0.7)';
            ctx.font = 'bold 10px monospace';
            ctx.fillText(`[Zone: ${trans.name || 'Transition'}]`, rx + 4, Math.max(12, ry - 4));
            ctx.restore();
          } else if (col.type === 'circle') {
            const cx = col.x ?? 0;
            const cy = col.y ?? 0;
            const cr = col.radius ?? 50;

            ctx.save();
            ctx.strokeStyle = isSelected ? '#6366F1' : 'rgba(99, 102, 241, 0.45)';
            ctx.lineWidth = isSelected ? 2 : 1;
            ctx.setLineDash(isSelected ? [5, 4] : [3, 3]);
            ctx.fillStyle = isSelected ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.05)';
            ctx.beginPath();
            ctx.arc(cx, cy, cr, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Label
            ctx.fillStyle = isSelected ? '#4F46E5' : 'rgba(79, 70, 229, 0.7)';
            ctx.font = 'bold 10px monospace';
            ctx.fillText(`[Zone: ${trans.name || 'Transition'}]`, cx - cr, Math.max(12, cy - cr - 4));
            ctx.restore();
          }
        });
      }

      // Render custom dot/shape cursor if configured and in play mode
      const playCursorPos = mousePosRef.current;
      if (currentUI.mode === 'play' && currentUI.playModeCursor === 'dot' && playCursorPos) {
          ctx.save();
          const cursorShape = currentUI.playModeCursorShape || 'circle';
          const cursorSize = currentUI.playModeCursorSize ?? 4;
          const cursorColor = currentUI.playModeCursorColor || '#000000';
          const cx = playCursorPos.x;
          const cy = playCursorPos.y;

          ctx.fillStyle = cursorColor;
          ctx.strokeStyle = cursorColor;

          if (cursorShape === 'circle') {
              ctx.beginPath();
              ctx.arc(cx, cy, Math.max(0.5, cursorSize / 2), 0, Math.PI * 2);
              ctx.fill();
          } else if (cursorShape === 'square') {
              ctx.fillRect(cx - cursorSize / 2, cy - cursorSize / 2, cursorSize, cursorSize);
          } else if (cursorShape === 'ring') {
              ctx.lineWidth = Math.max(1, cursorSize <= 6 ? 1 : 1.5);
              ctx.beginPath();
              ctx.arc(cx, cy, Math.max(1, cursorSize / 2), 0, Math.PI * 2);
              ctx.stroke();
          } else if (cursorShape === 'cross') {
              const arm = Math.max(2, cursorSize / 2);
              ctx.lineWidth = Math.max(1, cursorSize <= 6 ? 1 : 1.5);
              ctx.beginPath();
              ctx.moveTo(cx - arm, cy);
              ctx.lineTo(cx + arm, cy);
              ctx.moveTo(cx, cy - arm);
              ctx.lineTo(cx, cy + arm);
              ctx.stroke();
          }
          ctx.restore();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [CANVAS_WIDTH, CANVAS_HEIGHT]); 

  return (
    <div 
      ref={containerRef} 
      className="absolute inset-0 z-0 flex items-start justify-center pt-28 pb-32 bg-[#EAEAEA] touch-none"
    >
      <div 
        style={{ 
          width: CANVAS_WIDTH, 
          height: CANVAS_HEIGHT,
          transform: `scale(${scale})`,
          boxShadow: '0 20px 50px -12px rgba(0, 0, 0, 0.15)' 
        }}
        className="bg-white rounded-xl overflow-hidden relative transition-transform duration-200 ease-out origin-center ring-4 ring-white/50"
      >
          <canvas 
            ref={canvasRef} 
            className={`block w-full h-full ${ui.mode === 'play' ? (ui.playModeCursor === 'none' || ui.playModeCursor === 'dot' ? 'cursor-none' : (ui.playModeCursor === 'crosshair' ? 'cursor-crosshair' : 'cursor-default')) : (ui.selectedTool === 'select' ? 'cursor-default' : 'cursor-crosshair')}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onDoubleClick={handleDoubleClick}
            onContextMenu={(e) => {
                e.preventDefault();
                if (ignoreNextContextMenuRef.current) {
                    ignoreNextContextMenuRef.current = false;
                    return;
                }
                const p = getCanvasPoint(e as any);
                if (ui.selectedTool === 'select' && isVertexMode && ui.selectedStrokeId) {
                    const stroke = resolveActiveVisibleStroke(project, ui);
                    if (stroke && getVertexHit(p, stroke.points) !== -1) {
                        return;
                    }
                }
                handleCancel();
            }}
          />
          
          {/* Point Count Display */}
          {ui.selectedStrokeId && ui.mode === 'edit' && ui.transformMode === 'points' && (
              <div className="absolute bottom-4 right-4 bg-black/40 backdrop-blur-sm text-white text-[10px] font-mono px-2 py-1 rounded-md pointer-events-none opacity-60">
                  {(() => {
                      const stroke = resolveActiveVisibleStroke(project, ui);
                      return stroke ? `${stroke.points.length} pts` : '';
                  })()}
              </div>
          )}
      </div>
    </div>
  );
};
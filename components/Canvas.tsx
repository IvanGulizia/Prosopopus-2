// components/Canvas.tsx
import React, { useRef, useLayoutEffect, useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { interpolateStrokePoints, snapPointToGrid, isPointInStroke, calculateInterpolationWeights, distance, getBoundingBox, rotatePoint, lerp, drawCornerRoundedPath, drawCatmullRomSpline, simplifyCollinearPoints, distToSegment } from '../utils/math';
import { resolveStrokeStyle } from '../utils/style';
import { Point } from '../types';
import { APP_COLORS } from '../constants';

type InteractionMode = 'none' | 'drawing' | 'polyline' | 'dragging' | 'resizing' | 'rotating' | 'draggingVertex';
type ResizeHandle = 'tl' | 'tr' | 'bl' | 'br';

export const Canvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const { 
      ui, project, updateAxisValue, updateMultipleAxisValues, 
      addStrokeToCurrentKeyframe, updateStrokeInCurrentKeyframe, selectStroke,
      undo, redo, deleteStroke 
  } = useStore();
  
  // -- Stable Refs for Animation Loop --
  const projectRef = useRef(project);
  const uiRef = useRef(ui);
  
  useEffect(() => { projectRef.current = project; }, [project]);
  useEffect(() => { uiRef.current = ui; }, [ui]);

  // -- Physics State (Refs to avoid re-renders) --
  const targetAxesRef = useRef<Record<string, number>>({ 'axis-x': 0.5, 'axis-y': 0.5 });
  const velocityRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 });
  
  // Play Mode Local Physics State (Decoupled from Store)
  const playModeAxesRef = useRef<Record<string, number>>({ 'axis-x': 0.5, 'axis-y': 0.5 });

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
  const [activeVertexIndex, setActiveVertexIndex] = useState<number | null>(null);
  const activeVertexIndexRef = useRef<number | null>(null);
  useEffect(() => { activeVertexIndexRef.current = activeVertexIndex; }, [activeVertexIndex]);
  
  const [isVertexMode, setIsVertexMode] = useState(false);
  const isVertexModeRef = useRef(false);
  useEffect(() => { isVertexModeRef.current = isVertexMode; }, [isVertexMode]);

  const ignoreNextContextMenuRef = useRef(false);

  useEffect(() => {
      if (!ui.selectedStrokeId) {
          setIsVertexMode(false);
      }
  }, [ui.selectedStrokeId]);

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
    }

    const handleWindowPointerMove = (e: PointerEvent) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        
        let normX = (e.clientX - rect.left) / rect.width;
        let normY = (e.clientY - rect.top) / rect.height;
        
        normX = Math.max(0, Math.min(1, normX));
        normY = Math.max(0, Math.min(1, normY));

        if (ui.snapPlayMode) {
            normX = Math.round(normX * 10) / 10;
            normY = Math.round(normY * 10) / 10;
        }
        
        targetAxesRef.current = { 'axis-x': normX, 'axis-y': normY };
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    return () => {
        window.removeEventListener('pointermove', handleWindowPointerMove);
    };
  }, [ui.mode, ui.snapPlayMode]);

  const handleDoubleClick = (e: React.MouseEvent) => {
      if (ui.selectedTool === 'polyline') {
          if (polylinePoints.length > 1) addStrokeToCurrentKeyframe(polylinePoints, false, true);
          setPolylinePoints([]);
          return;
      }

      if (ui.selectedTool === 'select' && ui.selectedStrokeId) {
           setIsVertexMode(true); 
      }
  };

  const handleCancel = () => {
      // Logic for "Return / Cancel" via Escape or Right-Click
      if (ui.selectedTool === 'polyline' && polylinePoints.length > 0) {
          // Cancel current drawing
          setPolylinePoints([]);
      } else if (isVertexMode) {
          // Exit vertex mode
          setIsVertexMode(false); 
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
              if (ui.selectedStrokeId) {
                  deleteStroke(ui.selectedStrokeId);
              }
          }

          if (ui.selectedStrokeId && ui.selectedKeyframeId && ui.selectedLayerId && (e.key.startsWith('Arrow'))) {
              e.preventDefault();
              const kf = project.keyframes.find(k => k.id === ui.selectedKeyframeId);
              const ls = kf?.layerStates.find(s => s.layerId === ui.selectedLayerId);
              const stroke = ls?.strokes.find(s => s.id === ui.selectedStrokeId);
              
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
  }, [ui.selectedTool, ui.selectedStrokeId, ui.selectedKeyframeId, ui.selectedLayerId, polylinePoints, project.keyframes, isVertexMode]);

  useEffect(() => {
    if (ui.selectedTool !== 'select' || !ui.selectedStrokeId || !ui.selectedKeyframeId) {
        setSelectionBounds(null);
        return;
    }
    const kf = project.keyframes.find(k => k.id === ui.selectedKeyframeId);
    if (!kf) return;
    const layerState = kf.layerStates.find(ls => ls.layerId === ui.selectedLayerId);
    if (!layerState) return;
    const stroke = layerState.strokes.find(s => s.id === ui.selectedStrokeId);
    if (!stroke) return;
    const bbox = getBoundingBox(stroke.points);
    setSelectionBounds({
        cx: bbox.centerX, cy: bbox.centerY, width: bbox.width, height: bbox.height, rotation: 0
    });
  }, [ui.selectedStrokeId, ui.selectedKeyframeId, ui.selectedLayerId, ui.selectedTool, project.keyframes]);

  const getGizmoHit = (p: Point, bounds: { cx: number, cy: number, width: number, height: number, rotation: number } | null) => {
      if (!bounds) return null;
      const { cx, cy, width, height, rotation } = bounds;
      const hw = width / 2; const hh = height / 2;
      const localP = rotatePoint(p, {x: cx, y: cy}, -rotation);
      const HANDLE_SIZE = 10 / scale;
      if (distance(localP, {x: cx, y: cy - hh - 25}) < HANDLE_SIZE) return 'rotator';
      if (distance(localP, {x: cx - hw, y: cy - hh}) < HANDLE_SIZE) return 'tl';
      if (distance(localP, {x: cx + hw, y: cy - hh}) < HANDLE_SIZE) return 'tr';
      if (distance(localP, {x: cx - hw, y: cy + hh}) < HANDLE_SIZE) return 'bl';
      if (distance(localP, {x: cx + hw, y: cy + hh}) < HANDLE_SIZE) return 'br';
      if (localP.x >= cx - hw && localP.x <= cx + hw && localP.y >= cy - hh && localP.y <= cy + hh) return 'body';
      return null;
  };

  const getVertexHit = (p: Point, strokePoints: Point[]): number => {
      const HIT_THRESHOLD = 8 / scale;
      for (let i = strokePoints.length - 1; i >= 0; i--) {
          if (distance(p, strokePoints[i]) < HIT_THRESHOLD) return i;
      }
      return -1;
  };

  const findHitStroke = (p: Point): string | null => {
     const kf = project.keyframes.find(k => k.id === ui.selectedKeyframeId);
     if (!kf) return null;
     const layerState = kf.layerStates.find(ls => ls.layerId === ui.selectedLayerId);
     if (!layerState) return null;
     for (let i = layerState.strokes.length - 1; i >= 0; i--) {
        const s = layerState.strokes[i];
        if (isPointInStroke(p, s.points)) return s.id;
     }
     return null;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    // Prevent default touch actions
    if (e.pointerType === 'touch') {
      // e.preventDefault(); // Sometimes blocks scrolling, be careful
    }

    const p = getCanvasPoint(e);
    
    if (ui.mode === 'play') {
       return;
    }

    if (ui.selectedTool === 'select') {
        
        if (isVertexMode && ui.selectedStrokeId) {
             const kf = project.keyframes.find(k => k.id === ui.selectedKeyframeId);
             const ls = kf?.layerStates.find(s => s.layerId === ui.selectedLayerId);
             const stroke = ls?.strokes.find(s => s.id === ui.selectedStrokeId);
             
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
                const kf = project.keyframes.find(k => k.id === ui.selectedKeyframeId);
                const ls = kf?.layerStates.find(s => s.layerId === ui.selectedLayerId);
                const stroke = ls?.strokes.find(s => s.id === ui.selectedStrokeId);
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

        const hitId = findHitStroke(p);
        if (hitId) {
             selectStroke(hitId); 
             // Do not exit vertex mode if we select another stroke
        } else {
             if (isVertexMode) {
                 // Do not deselect if we are in vertex mode and click empty space
                 return;
             }
             selectStroke(null);
             setIsVertexMode(false); 
        }
        return;
    }

    if (ui.selectedTool === 'polyline') {
       const snappedP = getSnappedPoint(p);
       // REMOVED AUTO-CLOSE SNAP LOGIC HERE
       // We strictly just add points. Double-click terminates.
       setPolylinePoints(prev => [...prev, snappedP]);
       return;
    }

    if (ui.selectedTool === 'pen') {
      setInteractionMode('drawing'); 
      currentPointsRef.current = [getSnappedPoint(p)];
      (e.target as Element).setPointerCapture(e.pointerId);
    } 
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const p = getCanvasPoint(e);
    setMousePos(getSnappedPoint(p));

    if (ui.mode === 'play') return;

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

            if (!e.altKey) {
                if (activeHandle === 'br') { newW += dx * 2; newH += dy * 2; }
                if (activeHandle === 'tl') { newW -= dx * 2; newH -= dy * 2; }
                if (activeHandle === 'tr') { newW += dx * 2; newH -= dy * 2; }
                if (activeHandle === 'bl') { newW -= dx * 2; newH += dy * 2; }
            } else {
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
                if (e.altKey) {
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
                if (e.altKey) {
                    if (activeHandle === 'br' || activeHandle === 'tr') dcx += diffW / 2;
                    if (activeHandle === 'tl' || activeHandle === 'bl') dcx -= diffW / 2;
                }
            }
            if (newH < 1) {
                const diffH = 1 - newH;
                newH = 1;
                if (e.altKey) {
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
        currentPointsRef.current.push(getSnappedPoint(p));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (ui.mode !== 'play') {
       (e.target as Element).releasePointerCapture(e.pointerId);
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
        updateStrokeInCurrentKeyframe(ui.selectedStrokeId, newPoints);
    }
    
    if (interactionModeRef.current === 'drawing' && currentPointsRef.current.length > 1) {
        const points = [...currentPointsRef.current];
        addStrokeToCurrentKeyframe(points, false);
    }
    setInteractionMode('none'); setActiveHandle(null); setTransformStart(null); setActiveVertexIndex(null); currentPointsRef.current = [];
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
      const interpolationTargetCount = currentUI.performanceMode ? 80 : 200;

      if (canvas.width !== CANVAS_WIDTH * dpr || canvas.height !== CANVAS_HEIGHT * dpr) {
          canvas.width = CANVAS_WIDTH * dpr;
          canvas.height = CANVAS_HEIGHT * dpr;
          ctx.scale(dpr, dpr);
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
                  const damping = currentUI.springDamping || 20;
                  
                  const forceX = (targetX - nextX) * stiffness - velocityRef.current.x * damping;
                  const forceY = (targetY - nextY) * stiffness - velocityRef.current.y * damping;
                  
                  velocityRef.current.x += forceX * dt;
                  velocityRef.current.y += forceY * dt;
                  
                  nextX += velocityRef.current.x * dt;
                  nextY += velocityRef.current.y * dt;
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

      if (currentUI.onionSkinEnabled && currentUI.mode === 'edit') {
         currentProject.keyframes.forEach(kf => {
           if (kf.id === currentUI.selectedKeyframeId) return; 
           ctx.globalAlpha = currentUI.onionSkinOpacity;
           kf.layerStates.forEach(ls => {
              if (ls.layerId !== currentUI.selectedLayerId) return;
              const stroke = ls.strokes[0];
              if (stroke && stroke.points.length > 1) {
                const targetLayer = currentProject.layers.find(l => l.id === ls.layerId);
                const isSpline = targetLayer?.interpolationMode === 'spline';

                if (isSpline) {
                     drawCatmullRomSpline(ctx, stroke.points, 0.5);
                     ctx.stroke();
                } else {
                    ctx.beginPath();
                    const resolvedStyle = resolveStrokeStyle(stroke, targetLayer);
                    const cornerRoundness = resolvedStyle.cornerRoundness ?? 0;
                    if (cornerRoundness > 0) {
                       drawCornerRoundedPath(ctx, stroke.points, cornerRoundness);
                    } else {
                       ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
                       for (let i = 1; i < stroke.points.length; i++) ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
                    }
                    ctx.strokeStyle = '#3B82F6'; 
                    ctx.lineWidth = 1; 
                    ctx.stroke();
                }
              }
           });
           ctx.globalAlpha = 1.0;
         });
      }

      currentProject.layers.forEach(layer => {
        if (!layer.visible) return;
        
        const layerRelevantKeyframes = currentProject.keyframes.filter(kf => {
            const ls = kf.layerStates.find(s => s.layerId === layer.id);
            return ls && ls.strokes.length > 0;
        });

        if (layerRelevantKeyframes.length === 0) return;

        const weights = calculateInterpolationWeights(currentAxesDict, layerRelevantKeyframes, currentUI.interpolationExponent, currentUI.interpolationStrategy);

        const activeKeyframes = layerRelevantKeyframes
             .map(k => ({ ...k, weight: weights[k.id] || 0 }))
             .filter(k => k.weight > 0.0001);

        const strokeId = `stroke-${layer.id}-unique`;
        const isLayerActive = layer.id === currentUI.selectedLayerId;
        const isCreatingNewState = currentUI.selectedKeyframeId === null;

        let layerGlobalAlpha = layer.opacity;
        if (!isLayerActive && currentUI.mode !== 'play') layerGlobalAlpha *= currentUI.inactiveLayerOpacity;
        if (isCreatingNewState && currentUI.mode === 'edit') layerGlobalAlpha *= currentUI.ghostStrokeOpacity;

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
                cornerRoundness: resolvedStyle.cornerRoundness ?? 0
            };
        });

        const sortedByWeight = [...strokeData].sort((a,b) => b.weight - a.weight);
        const primaryStroke = sortedByWeight.find(sd => sd.style)?.style;
        if (!primaryStroke) return;

        const { points: interpolatedPoints, color: interpolatedColor, fillColor: interpolatedFill, width: interpolatedWidth, cornerRoundness: interpolatedCornerRoundness } = interpolateStrokePoints(
            strokeId, 
            primaryStroke.points, 
            strokeData, 
            layer.interpolationMode,
            interpolationTargetCount 
        );

        if (interpolatedPoints.length > 0) {
            
            if (layer.interpolationMode === 'spline') {
                drawCatmullRomSpline(ctx, interpolatedPoints, 0.5); 
            } else {
                ctx.beginPath();
                if (interpolatedCornerRoundness > 0) {
                    drawCornerRoundedPath(ctx, interpolatedPoints, interpolatedCornerRoundness);
                } else {
                    ctx.moveTo(interpolatedPoints[0].x, interpolatedPoints[0].y);
                    for (let i = 1; i < interpolatedPoints.length; i++) ctx.lineTo(interpolatedPoints[i].x, interpolatedPoints[i].y);
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
            
            ctx.globalAlpha = 1.0;
            ctx.globalCompositeOperation = 'source-over';
        }
      });

      if (interactionModeRef.current === 'drawing' && currentPointsRef.current.length > 0) {
        ctx.globalAlpha = 1.0; 

        ctx.beginPath();
        const pts = currentPointsRef.current;
        const currentLayer = currentProject.layers.find(l => l.id === currentUI.selectedLayerId);
        const cornerRoundness = currentLayer?.baseStyle?.cornerRoundness || 0;
        
        if (cornerRoundness > 0) {
             drawCornerRoundedPath(ctx, pts, cornerRoundness);
        } else {
             ctx.moveTo(pts[0].x, pts[0].y);
             for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        }

        ctx.strokeStyle = currentUI.brushColor !== 'none' ? currentUI.brushColor : 'rgba(0,0,0,0.5)';
        ctx.lineWidth = currentUI.brushSize;
        ctx.lineCap = currentUI.strokeCap || 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.globalAlpha = 1.0; 
      }

      if (currentPolyline.length > 0) {
         const isGhostState = currentUI.selectedKeyframeId === null;
         
         const polyPreview = currentMousePos ? [...currentPolyline, currentMousePos] : currentPolyline;
         
         const currentLayer = currentProject.layers.find(l => l.id === currentUI.selectedLayerId);
         const isSpline = currentLayer?.interpolationMode === 'spline';

         if (isSpline) {
             drawCatmullRomSpline(ctx, polyPreview, 0.5);
         } else {
             ctx.beginPath();
             const cornerRoundness = currentLayer?.baseStyle?.cornerRoundness || 0;
             if (cornerRoundness > 0) {
                 drawCornerRoundedPath(ctx, polyPreview, cornerRoundness);
             } else {
                 ctx.moveTo(polyPreview[0].x, polyPreview[0].y);
                 for (let i = 1; i < polyPreview.length; i++) ctx.lineTo(polyPreview[i].x, polyPreview[i].y);
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
         
         ctx.fillStyle = currentUI.brushColor !== 'none' ? currentUI.brushColor : 'rgba(0,0,0,0.5)';
         currentPolyline.forEach((p, index) => {
            ctx.beginPath();
            const r = (index === 0) ? 5 : 3; 
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fill();
         });
         ctx.globalAlpha = 1.0; 
      }

      if (currentSelectionBounds && currentUI.selectedTool === 'select' && currentUI.mode === 'edit') {
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

            ctx.restore();
          }

          if (isVertexModeActive) {
            const activeKf = currentProject.keyframes.find(k => k.id === currentUI.selectedKeyframeId);
            if (activeKf) {
                const activeLayerState = activeKf.layerStates.find(ls => ls.layerId === currentUI.selectedLayerId);
                const activeStroke = activeLayerState?.strokes.find(s => s.id === currentUI.selectedStrokeId);
                
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
            className={`block w-full h-full ${ui.mode === 'play' ? 'cursor-move' : (ui.selectedTool === 'select' ? 'cursor-default' : 'cursor-crosshair')}`}
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
                    const kf = project.keyframes.find(k => k.id === ui.selectedKeyframeId);
                    const ls = kf?.layerStates.find(s => s.layerId === ui.selectedLayerId);
                    const stroke = ls?.strokes.find(s => s.id === ui.selectedStrokeId);
                    if (stroke && getVertexHit(p, stroke.points) !== -1) {
                        return;
                    }
                }
                handleCancel();
            }}
          />
          
          {/* Point Count Display */}
          {ui.selectedStrokeId && ui.mode === 'edit' && (
              <div className="absolute bottom-4 right-4 bg-black/40 backdrop-blur-sm text-white text-[10px] font-mono px-2 py-1 rounded-md pointer-events-none opacity-60">
                  {(() => {
                      const kf = project.keyframes.find(k => k.id === ui.selectedKeyframeId);
                      const ls = kf?.layerStates.find(s => s.layerId === ui.selectedLayerId);
                      const stroke = ls?.strokes.find(s => s.id === ui.selectedStrokeId);
                      return stroke ? `${stroke.points.length} pts` : '';
                  })()}
              </div>
          )}
      </div>
    </div>
  );
};
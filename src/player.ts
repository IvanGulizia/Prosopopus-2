/**
 * Prosopopus v2 - Autonomous Standalone Player
 * Full-fidelity reproduction of the Play mode rendering and physics engine.
 */

import {
  Project,
  Point,
  Stroke,
  Layer,
  Keyframe,
  StyleProps,
  CornerRadii
} from '../types';

import {
  calculateInterpolationWeights,
  interpolateStrokePoints,
  drawRoundedRectangle,
  drawCornerRoundedPath,
  drawCatmullRomSpline,
  getSymmetricPoints
} from '../utils/math';

export const resolveStrokeStyle = (stroke: Stroke | undefined, layer: Layer | undefined): StyleProps => {
  const defaultStyle: StyleProps = {
    strokeColor: '#000000',
    strokeWidth: 4,
    fillColor: 'none',
    lineStyle: 'solid',
    cornerRoundness: 0
  };
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

export class ProsopopusPlayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private project: Project;
  
  private currentAxes: Record<string, number> = { 'axis-x': 0.5, 'axis-y': 0.5 };
  private targetAxes: Record<string, number> = { 'axis-x': 0.5, 'axis-y': 0.5 };
  private velocity: { x: number; y: number } = { x: 0, y: 0 };
  
  // Pointer dynamics for kinetic momentum impulse
  private pointerVelocity: { x: number; y: number } = { x: 0, y: 0 };
  private lastPointerPos: { x: number; y: number } = { x: 0.5, y: 0.5 };
  private lastPointerTime: number = 0;
  
  // Vertex inertia map for Disney follow-through spring dynamics per layer
  private vertexInertiaMap: Map<string, { current: Point[]; velocity: { x: number; y: number }[] }> = new Map();
  
  private lastTime: number = 0;
  private animationFrameId: number = 0;
  private isRunning: boolean = false;
  
  // Event listener cleanup
  private cleanupListeners: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, project: Project) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D rendering context for canvas');
    this.ctx = ctx;
    this.project = project;

    const axisX = project.axes?.find(a => a.id === 'axis-x');
    const axisY = project.axes?.find(a => a.id === 'axis-y');
    const initX = axisX ? axisX.currentValue : 0.5;
    const initY = axisY ? axisY.currentValue : 0.5;
    this.currentAxes = { 'axis-x': initX, 'axis-y': initY };
    this.targetAxes = { 'axis-x': initX, 'axis-y': initY };
    this.lastPointerPos = { x: initX, y: initY };

    this.setupInteraction();
  }

  public setProject(project: Project) {
    this.project = project;
    this.vertexInertiaMap.clear();
  }

  private setupInteraction() {
    const handleMove = (clientX: number, clientY: number) => {
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const rawNormX = (clientX - rect.left) / rect.width;
      const rawNormY = (clientY - rect.top) / rect.height;

      // Track pointer velocity for momentum extrapolation
      const now = performance.now();
      const dt = Math.max(0.005, (now - (this.lastPointerTime || now)) / 1000);
      this.lastPointerTime = now;

      const deltaX = rawNormX - this.lastPointerPos.x;
      const deltaY = rawNormY - this.lastPointerPos.y;
      this.lastPointerPos = { x: rawNormX, y: rawNormY };

      // Exponential smoothing on pointer velocity
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

      // Rubberband Border Overshoot (Logarithmic resistance beyond active margin/padding)
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

        // Bound within container limits [0, 1]
        processedX = Math.max(0, Math.min(1, processedX));
        processedY = Math.max(0, Math.min(1, processedY));
      } else {
        processedX = Math.max(minX, Math.min(maxX, processedX));
        processedY = Math.max(minY, Math.min(maxY, processedY));
      }

      // Snap Grid in Play Mode
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

      // Momentum / Kinetic Impulse Boost
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

    const onPointerMove = (e: PointerEvent) => handleMove(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches && e.touches.length > 0) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('mousemove', onMouseMove, { passive: true });

    this.cleanupListeners = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.animationFrameId = requestAnimationFrame(this.loop.bind(this));
  }

  public stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }
  }

  public destroy() {
    this.stop();
    if (this.cleanupListeners) {
      this.cleanupListeners();
      this.cleanupListeners = null;
    }
    this.vertexInertiaMap.clear();
  }

  private loop(time: number) {
    if (!this.isRunning) return;
    if (!this.lastTime) this.lastTime = time;
    const dt = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    this.updatePhysics(dt);
    this.render(dt);

    this.animationFrameId = requestAnimationFrame(this.loop.bind(this));
  }

  private updatePhysics(dt: number) {
    const settings = this.project.settings || {};
    const targetX = this.targetAxes['axis-x'] ?? 0.5;
    const targetY = this.targetAxes['axis-y'] ?? 0.5;

    if (settings.playModePhysics) {
      const stiffness = settings.springStiffness || 120;
      let damping = settings.springDamping || 20;

      // Option A: Bounciness / Harmonic Spring Overshoot (Underdamped factor)
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

  private render(dt: number) {
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

              // Spring-Damper-Mass Force: F = k*(target - cur) - c*vel
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
  }
}

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
  CornerRadii,
  AnimationTimeline,
  LayerInteraction
} from '../types';

import {
  calculateInterpolationWeights,
  interpolateStrokePoints,
  drawRoundedRectangle,
  drawCornerRoundedPath,
  drawCatmullRomSpline,
  getSymmetricPoints,
  isPointInStroke
} from '../utils/math';

import { evaluateEasing } from '../utils/easing';
import { evaluateTimelineAxes, advanceTimelineTime } from '../utils/animation';

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
  
  // Timeline & Interactive State Machine Engine
  public activeAnimationId: string | null = null;
  public isTimelinePlaying: boolean = false;
  public timelineTime: number = 0;
  private timelineDirection: number = 1;
  private lastHoveredLayerId: string | null = null;
  private interactiveTransition: {
    startPos: Record<string, number>;
    targetPos: Record<string, number>;
    startTime: number;
    duration: number;
    easing: any;
  } | null = null;

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
    this.lastPointerPos = { x: initX, y: initY };

    if (project.animations && project.animations.length > 0) {
      this.activeAnimationId = project.activeAnimationId || project.animations[0].id;
    }

    this.setupInteraction();
  }

  public setProject(project: Project) {
    this.project = project;
    this.vertexInertiaMap.clear();
    const settings = project.settings || {};
    const cursorType = settings.playModeCursor || 'default';
    if (cursorType === 'crosshair') this.canvas.style.cursor = 'crosshair';
    else if (cursorType === 'none' || cursorType === 'dot') this.canvas.style.cursor = 'none';
    else this.canvas.style.cursor = 'default';

    if (project.animations && project.animations.length > 0) {
      if (!this.activeAnimationId || !project.animations.some(a => a.id === this.activeAnimationId)) {
        this.activeAnimationId = project.activeAnimationId || project.animations[0].id;
      }
    }
  }

  public playAnimation(id?: string) {
    if (id) this.activeAnimationId = id;
    this.isTimelinePlaying = true;
  }

  public pauseAnimation() {
    this.isTimelinePlaying = false;
  }

  public setTimelineTime(time: number) {
    this.timelineTime = time;
  }

  public goToKeyframe(keyframeId: string, duration: number = 350, easing: any = 'easeInOut') {
    const kf = this.project.keyframes.find(k => k.id === keyframeId);
    if (!kf) return;
    this.interactiveTransition = {
      startPos: { ...this.targetAxes },
      targetPos: { ...kf.axisValues },
      startTime: performance.now(),
      duration: Math.max(1, duration),
      easing
    };
  }

  private findHitLayer(canvasPoint: Point): string | null {
    const kf = this.project.keyframes[0];
    if (!kf) return null;
    for (let l = this.project.layers.length - 1; l >= 0; l--) {
      const layer = this.project.layers[l];
      if (!layer.visible) continue;
      const ls = kf.layerStates.find(s => s.layerId === layer.id);
      if (!ls) continue;
      for (const stroke of ls.strokes) {
        if (isPointInStroke(canvasPoint, stroke.points)) {
          return layer.id;
        }
      }
    }
    return null;
  }

  private triggerInteraction(rule: LayerInteraction) {
    if (rule.action.type === 'play_animation' && rule.action.targetAnimationId) {
      this.playAnimation(rule.action.targetAnimationId);
    } else if (rule.action.type === 'go_to_keyframe' && rule.action.targetKeyframeId) {
      this.goToKeyframe(rule.action.targetKeyframeId, rule.action.duration, rule.action.easing);
    }
  }

  private setupInteraction() {
    const getCanvasPoint = (clientX: number, clientY: number): Point => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = (this.project.canvasSize?.width || 800) / (rect.width || 1);
      const scaleY = (this.project.canvasSize?.height || 600) / (rect.height || 1);
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    };

    const handleClick = (clientX: number, clientY: number) => {
      if (!this.project.interactions || this.project.interactions.length === 0) return;
      const cp = getCanvasPoint(clientX, clientY);
      const hitLayerId = this.findHitLayer(cp);
      const matching = this.project.interactions.find(i => 
        i.trigger === 'click' && (i.layerId === hitLayerId || i.layerId === 'canvas')
      );
      if (matching) {
        this.triggerInteraction(matching);
      }
    };

    const handleMove = (clientX: number, clientY: number) => {
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      // Check hover enter / leave interactions
      if (this.project.interactions && this.project.interactions.length > 0) {
        const cp = getCanvasPoint(clientX, clientY);
        const hoveredLayerId = this.findHitLayer(cp);

        if (hoveredLayerId !== this.lastHoveredLayerId) {
          const prevLayer = this.lastHoveredLayerId;
          this.lastHoveredLayerId = hoveredLayerId;

          if (prevLayer) {
            const leaveRule = this.project.interactions.find(i => 
              i.trigger === 'hover_leave' && (i.layerId === prevLayer || i.layerId === 'canvas')
            );
            if (leaveRule) this.triggerInteraction(leaveRule);
          }

          if (hoveredLayerId) {
            const enterRule = this.project.interactions.find(i => 
              i.trigger === 'hover_enter' && (i.layerId === hoveredLayerId || i.layerId === 'canvas')
            );
            if (enterRule) this.triggerInteraction(enterRule);
          }
        }
      }

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

      // If no interactive transition is active, mouse sets target axes
      if (!this.interactiveTransition && !this.isTimelinePlaying) {
        this.targetAxes['axis-x'] = processedX;
        this.targetAxes['axis-y'] = processedY;
      }
    };

    const onPointerDown = (e: PointerEvent) => handleClick(e.clientX, e.clientY);
    const onPointerMove = (e: PointerEvent) => handleMove(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches && e.touches.length > 0) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);

    this.canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('mousemove', onMouseMove, { passive: true });

    this.cleanupListeners = () => {
      this.canvas.removeEventListener('pointerdown', onPointerDown);
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

    // 1. Advance Interactive Transition if active
    if (this.interactiveTransition) {
      const trans = this.interactiveTransition;
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
      this.targetAxes = { ...this.targetAxes, ...nextTarget };

      if (progress >= 1) {
        this.interactiveTransition = null;
      }
    }
    // 2. Advance Timeline Animation if active
    else if (this.isTimelinePlaying && this.project.animations) {
      const activeAnim = this.project.animations.find(a => a.id === this.activeAnimationId) || this.project.animations[0];
      if (activeAnim) {
        const { newTime, newDirection, isEnded } = advanceTimelineTime(
          this.timelineTime,
          activeAnim.duration,
          dt,
          activeAnim.loopMode,
          this.timelineDirection
        );
        this.timelineTime = newTime;
        this.timelineDirection = newDirection;

        const animAxes = evaluateTimelineAxes(activeAnim, newTime);
        this.targetAxes = { ...this.targetAxes, ...animAxes };

        if (isEnded) {
          this.isTimelinePlaying = false;
          // Check animation_end interaction triggers
          if (this.project.interactions) {
            const endInteraction = this.project.interactions.find(i =>
              i.trigger === 'animation_end' && (!i.action.targetAnimationId || i.action.targetAnimationId === activeAnim.id)
            );
            if (endInteraction) {
              this.triggerInteraction(endInteraction);
            }
          }
        }
      }
    }

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

      if (layer.isGuide) {
        // Guide / Reference layer: Render nearest state in play mode, or direct strokes otherwise
        let strokesToRender = [];

        if (layerRelevantKeyframes.length > 0) {
          const weights = calculateInterpolationWeights(
            currentAxes, 
            layerRelevantKeyframes, 
            settings.interpolationExponent || 2.0, 
            settings.interpolationStrategy || 'bilinear-grid',
            false, 
            0,
            settings.gridCurvature ?? 1.0
          );

          let maxWeight = -Infinity;
          let nearestKfId = '';
          for (const kfId in weights) {
             if (weights[kfId] > maxWeight) {
                 maxWeight = weights[kfId];
                 nearestKfId = kfId;
             }
          }
          
          const nearestKf = layerRelevantKeyframes.find(k => k.id === nearestKfId);
          if (nearestKf) {
              strokesToRender = nearestKf.layerStates.find(ls => ls.layerId === layer.id)?.strokes || [];
          }
        } else {
           strokesToRender = (layer.guideStrokes && layer.guideStrokes.length > 0)
            ? layer.guideStrokes
            : (project.keyframes[0]?.layerStates.find(ls => ls.layerId === layer.id)?.strokes || []);
        }

        strokesToRender.forEach(s => {
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
        const inertiaKey = `layer-${layer.id}-stroke-${strokeId}`;
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
          const snapProtection = settings.overshootVertexSnapProtection ?? 0.75;

          for (let step = 0; step < subSteps; step++) {
            for (let i = 0; i < interpolatedPoints.length; i++) {
              const targetPt = interpolatedPoints[i];
              const curPt = stored.current[i];
              const vel = stored.velocity[i];

              const dx = targetPt.x - curPt.x;
              const dy = targetPt.y - curPt.y;
              const dist = Math.hypot(dx, dy);

              // Adaptive damping: dynamically increases when displacement is large to prevent runaway whipping
              const effectiveDamping = snapProtection > 0
                ? damping * (1 + snapProtection * Math.min(3.0, dist / 80.0))
                : damping;

              // Spring-Damper-Mass Force: F = k*(target - cur) - c*vel
              let springF_x = dx * stiffness - vel.x * effectiveDamping;
              let springF_y = dy * stiffness - vel.y * effectiveDamping;

              if (snapProtection > 0) {
                // Clamp acceleration
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
                // Clamp velocity
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

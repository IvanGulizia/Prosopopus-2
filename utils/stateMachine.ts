import { 
  Project, 
  StateMachine, 
  StateNode, 
  StateTransition, 
  Stroke, 
  LayerState, 
  Layer,
  EasingType,
  Point
} from '../types';
import { evaluateEasing } from './easing';
import { interpolateStrokePoints } from './math';
import { testPointInCollider } from './animation';

/**
 * Creates or retrieves a default State Machine for a project.
 */
export function getOrCreateDefaultStateMachine(project: Project): StateMachine {
  if (project.stateMachines && project.stateMachines.length > 0) {
    return project.stateMachines[0];
  }

  const anim = project.animations?.[0];
  const firstKf = project.keyframes?.[0];

  const entryNode: StateNode = {
    id: 'node-entry',
    name: 'Entry (Départ)',
    type: 'entry',
    x: 80,
    y: 180,
    color: '#10B981'
  };

  const defaultNodes: StateNode[] = [entryNode];
  const defaultTransitions: StateTransition[] = [];

  // Create an initial Pose node from the first keyframe / canvas
  const pose1Node: StateNode = {
    id: 'node-state-1',
    name: 'État Repos (Pose 1)',
    type: 'pose',
    x: 280,
    y: 180,
    poseData: {
      keyframeId: firstKf?.id,
      layerStates: firstKf?.layerStates ? JSON.parse(JSON.stringify(firstKf.layerStates)) : [],
      axisValues: firstKf?.axisValues ? { ...firstKf.axisValues } : { 'axis-x': 0.5, 'axis-y': 0.5 }
    },
    color: '#3B82F6'
  };
  defaultNodes.push(pose1Node);

  // Transition from Entry to Pose 1
  defaultTransitions.push({
    id: 'trans-entry-1',
    fromNodeId: 'node-entry',
    toNodeId: 'node-state-1',
    trigger: 'delay',
    params: { delaySeconds: 0 },
    duration: 0,
    easing: 'linear',
    name: 'Au Démarrage'
  });

  // If there is an existing animation, add it as a Clip node
  if (anim) {
    const clipNode: StateNode = {
      id: `node-clip-${anim.id}`,
      name: anim.name || 'Animation 1',
      type: 'clip',
      x: 520,
      y: 180,
      animationId: anim.id,
      color: '#8B5CF6'
    };
    defaultNodes.push(clipNode);

    // Transition from Pose 1 to Clip on Click
    defaultTransitions.push({
      id: 'trans-1-to-clip',
      fromNodeId: 'node-state-1',
      toNodeId: clipNode.id,
      trigger: 'click',
      params: { layerId: 'canvas' },
      duration: 0.35,
      easing: 'easeInOut',
      name: 'Clic ➔ Jouer Anim'
    });

    // Transition from Clip back to Pose 1 on Animation End
    defaultTransitions.push({
      id: 'trans-clip-to-1',
      fromNodeId: clipNode.id,
      toNodeId: 'node-state-1',
      trigger: 'animation_end',
      duration: 0.3,
      easing: 'easeOut',
      name: 'Fin ➔ Retour Repos'
    });
  }

  return {
    id: `sm-${Date.now()}`,
    name: 'State Machine Principale',
    nodes: defaultNodes,
    transitions: defaultTransitions,
    entryNodeId: 'node-entry'
  };
}

/**
 * Interpolates two arrays of strokes for a given layer between two poses (0.0 to 1.0)
 */
export function interpolateStrokesDirect(
  strokesA: Stroke[],
  strokesB: Stroke[],
  progress: number,
  interpolationMode: 'linear' | 'spline' = 'linear',
  layer?: Layer
): Stroke[] {
  const t = Math.max(0, Math.min(1, progress));
  if (t === 0) return strokesA;
  if (t === 1) return strokesB;

  const maxLen = Math.max(strokesA.length, strokesB.length);
  const result: Stroke[] = [];

  for (let i = 0; i < maxLen; i++) {
    const sA = strokesA[i] || strokesB[i];
    const sB = strokesB[i] || strokesA[i];
    if (!sA || !sB) continue;

    const styleA = sA.style || {};
    const styleB = sB.style || {};

    const keyframesData = [
      {
        weight: 1 - t,
        points: sA.points,
        style: sA,
        color: styleA.strokeColor || '#000000',
        fillColor: styleA.fillColor || 'none',
        width: styleA.strokeWidth ?? 2,
        cornerRoundness: styleA.cornerRoundness ?? 0,
        cornerRadii: sA.shapeConfig?.cornerRadii || styleA.cornerRadii
      },
      {
        weight: t,
        points: sB.points,
        style: sB,
        color: styleB.strokeColor || '#000000',
        fillColor: styleB.fillColor || 'none',
        width: styleB.strokeWidth ?? 2,
        cornerRoundness: styleB.cornerRoundness ?? 0,
        cornerRadii: sB.shapeConfig?.cornerRadii || styleB.cornerRadii
      }
    ];

    const targetResolution = Math.max(sA.points?.length || 0, sB.points?.length || 0, 16);
    const mathMode: 'resample' | 'points' | 'spline' | 'length' = 
      interpolationMode === 'spline' ? 'spline' : 'resample';
    const interpolated = interpolateStrokePoints(
      sA.id || `sm-direct-${i}`,
      sA.points,
      keyframesData,
      mathMode,
      targetResolution
    );

    result.push({
      id: sA.id || `sm-stroke-${i}`,
      points: interpolated.points,
      closed: sA.closed ?? sB.closed ?? false,
      shapeConfig: (sA.shapeConfig || sB.shapeConfig) ? {
        ...(sA.shapeConfig || sB.shapeConfig),
        cornerRadii: interpolated.cornerRadii
      } : undefined,
      style: {
        ...(sA.style || {}),
        ...(sB.style || {}),
        strokeColor: interpolated.color,
        fillColor: interpolated.fillColor,
        strokeWidth: interpolated.width,
        cornerRoundness: interpolated.cornerRoundness,
        cornerRadii: interpolated.cornerRadii
      }
    });
  }

  return result;
}

/**
 * Checks if an event matches a transition's conditions.
 */
export function checkTransitionMatches(
  transition: StateTransition,
  event: {
    type: string;
    layerId?: string | null;
    scrollProgress?: number;
    scrollDelta?: number;
    key?: string;
    point?: Point;
    layerStrokes?: Stroke[];
  }
): boolean {
  const trigger = transition.trigger;
  const params = transition.params || {};

  // Target matching for pointer-based events (click, double click, pointer down/up, hover)
  const isPointerEvent = ['click', 'double_click', 'pointer_down', 'pointer_up', 'hover_enter', 'hover_leave'].includes(trigger);
  let isTargetMatch = true;

  if (isPointerEvent) {
    const targetType = params.targetType || (params.collider ? 'collider' : (params.layerId && params.layerId !== 'canvas' ? 'layer' : 'canvas'));
    if (targetType === 'collider' && params.collider) {
      if (event.point) {
        isTargetMatch = testPointInCollider(event.point, params.collider, event.layerStrokes);
      } else {
        isTargetMatch = false;
      }
    } else if (targetType === 'layer') {
      isTargetMatch = Boolean(params.layerId && params.layerId === event.layerId);
    } else {
      // 'canvas' -> entire canvas matches
      isTargetMatch = true;
    }
  }

  switch (trigger) {
    case 'click':
      return event.type === 'click' && isTargetMatch;
    case 'double_click':
      return event.type === 'double_click' && isTargetMatch;
    case 'pointer_down':
      return event.type === 'pointer_down' && isTargetMatch;
    case 'pointer_up':
      return event.type === 'pointer_up' && isTargetMatch;
    case 'hover_enter':
      return event.type === 'hover_enter' && isTargetMatch;
    case 'hover_leave':
      return event.type === 'hover_leave' && isTargetMatch;
    case 'scroll_down':
      return event.type === 'wheel' && (event.scrollDelta ?? 0) > 0;
    case 'scroll_up':
      return event.type === 'wheel' && (event.scrollDelta ?? 0) < 0;
    case 'scroll_progress': {
      if (event.type !== 'scroll_progress' && event.type !== 'wheel') return false;
      const threshold = params.scrollThreshold ?? 0.5;
      const currentProg = event.scrollProgress ?? 0;
      return currentProg >= threshold;
    }
    case 'scroll_scrub':
      // Handled as a continuous driver rather than a discrete single-shot transition
      return false;
    case 'animation_end':
      return event.type === 'animation_end';
    case 'key_press':
      return event.type === 'keydown' && (!params.key || params.key.toLowerCase() === (event.key || '').toLowerCase());
    case 'delay':
      return event.type === 'delay';
    default:
      return false;
  }
}

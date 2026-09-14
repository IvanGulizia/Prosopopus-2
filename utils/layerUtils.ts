import { Project, UIState, Stroke } from '../types';
import { calculateInterpolationWeights } from './math';
import { evaluateLayerTimelineStrokes } from './animation';

export const resolveLayerVisibleStrokes = (proj: Project, u: UIState, layerId: string): Stroke[] => {
  const layer = proj.layers.find(l => l.id === layerId);
  if (!layer || !layer.visible) return [];

  if (layer.isGuide) {
    const layerRelevantKeyframes = proj.keyframes.filter(kf => {
      const ls = kf.layerStates.find(s => s.layerId === layer.id);
      return ls && ls.strokes.length > 0;
    });

    if (u.mode === 'play' && layerRelevantKeyframes.length > 0) {
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

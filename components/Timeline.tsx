// components/Timeline.tsx
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store/useStore';
import {
  Play,
  Pause,
  RotateCcw,
  Repeat,
  Plus,
  Trash2,
  Copy,
  Clock,
  Layers,
  Sparkles,
  ChevronDown,
  X,
  Check,
  Eye,
  EyeOff
} from 'lucide-react';
import { EasingType, LoopMode, LayerTimelineKeyframe, LayerTimelineTrack } from '../types';

// Easing Curve Mini SVG Icons
export const EasingCurveIcon: React.FC<{ easing: EasingType; size?: number; className?: string }> = ({ easing, size = 12, className = '' }) => {
  switch (easing) {
    case 'linear':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
          <path d="M2 14L14 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'easeIn':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
          <path d="M2 14C8 14 12 10 14 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'easeOut':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
          <path d="M2 14C4 6 8 2 14 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'bounce':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
          <path d="M2 14C4 2 6 14 8 8C9 4 11 14 12 11C13 8 13.5 14 14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'spring':
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
          <path d="M2 14C5 0 8 18 11 2C12.5 0 13.5 3 14 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'easeInOut':
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
          <path d="M2 14C6 14 10 2 14 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
  }
};

const EASING_OPTIONS: { type: EasingType; label: string; desc: string }[] = [
  { type: 'easeInOut', label: 'Ease In-Out', desc: 'Accélération puis décélération fluide' },
  { type: 'easeOut', label: 'Ease Out', desc: 'Départ rapide, arrivée en douceur' },
  { type: 'easeIn', label: 'Ease In', desc: 'Départ lent, arrivée rapide' },
  { type: 'linear', label: 'Linéaire', desc: 'Vitesse constante' },
  { type: 'spring', label: 'Spring (Ressort)', desc: 'Dépassement élastique dynamique' },
  { type: 'bounce', label: 'Bounce (Rebond)', desc: 'Effet de rebond amorti' }
];

export const Timeline: React.FC = () => {
  const {
    project,
    ui,
    setTimelineCurrentTime,
    setTimelinePlaying,
    addAnimation,
    setAnimationDuration,
    setAnimationLoopMode,
    setActiveAnimation,
    addLayerTimelineKeyframe,
    moveLayerTimelineKeyframe,
    updateLayerTimelineKeyframeEasing,
    deleteLayerTimelineKeyframe,
    duplicateLayerTimelineKeyframe,
    setSelectedLayerTrack,
    setSelectedTimelineKeyframe,
    toggleTimelinePanel,
    toggleAutoKeyframe,
    toggleOnionSkin,
    selectLayer
  } = useStore();

  const {
    theme,
    expertModeEnabled,
    isTimelineOpen,
    activeAnimationId,
    timelinePlaying,
    timelineCurrentTime,
    selectedLayerTrackId,
    selectedTimelineKeyframeId,
    autoKeyframeEnabled = true,
    onionSkinEnabled = false
  } = ui;

  const rulerRef = useRef<HTMLDivElement>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [activeScrubContainer, setActiveScrubContainer] = useState<HTMLElement | null>(null);
  const [draggingKeyframe, setDraggingKeyframe] = useState<{ layerId: string; kfId: string; container: HTMLElement } | null>(null);

  // Mini popover state for curve / easing selection
  const [activeEasingPopover, setActiveEasingPopover] = useState<{
    layerId: string;
    kfId: string;
    x: number;
    y: number;
    currentEasing: EasingType;
    isLoopTransition?: boolean;
  } | null>(null);

  // Mini popover state for keyframe actions (Delete / Duplicate / Move)
  const [keyframeMenuPopover, setKeyframeMenuPopover] = useState<{
    layerId: string;
    kfId: string;
    time: number;
    easing: EasingType;
    x: number;
    y: number;
  } | null>(null);

  const [isEditingDuration, setIsEditingDuration] = useState(false);
  const [durationInput, setDurationInput] = useState('2.0');

  const animations = project.animations || [];
  const currentAnimation = animations.find(a => a.id === (activeAnimationId || project.activeAnimationId)) || animations[0];

  const duration = Math.max(0.2, currentAnimation?.duration || 2.0);
  const loopMode = currentAnimation?.loopMode || 'loop';
  const tracks = currentAnimation?.tracks || [];

  // Filter valid drawing layers (exclude generated symmetries)
  const availableLayers = project.layers.filter(l => !l.id.includes('-sym-'));

  // SINGLE LAYER FOCUS: The timeline exclusively displays the active layer
  const activeLayer = availableLayers.find(l => l.id === ui.selectedLayerId) || availableLayers.find(l => l.id === selectedLayerTrackId) || availableLayers[0];
  const activeTrack = activeLayer ? tracks.find(t => t.layerId === activeLayer.id) : null;
  const activeKeyframes = activeTrack?.keyframes || [];
  const sortedKeyframes = [...activeKeyframes].sort((a, b) => a.time - b.time);

  // Sync duration input
  useEffect(() => {
    if (currentAnimation) {
      setDurationInput(currentAnimation.duration.toFixed(2));
    }
  }, [currentAnimation?.duration]);

  // Ensure active layer track is set when opening
  useEffect(() => {
    if (isTimelineOpen && activeLayer && selectedLayerTrackId !== activeLayer.id) {
      setSelectedLayerTrack(activeLayer.id);
    }
  }, [isTimelineOpen, activeLayer, selectedLayerTrackId, setSelectedLayerTrack]);

  // Helper: compute time from pointer clientX on a track / ruler element
  const getTimeFromClientX = useCallback((clientX: number, container: HTMLElement): number => {
    const rect = container.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newTime = ratio * duration;
    return Math.round(newTime * 100) / 100;
  }, [duration]);

  // Global pointer move / up listener for scrubbing & keyframe dragging
  useEffect(() => {
    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (isScrubbing && activeScrubContainer) {
        const newTime = getTimeFromClientX(e.clientX, activeScrubContainer);
        setTimelineCurrentTime(newTime);
      } else if (draggingKeyframe && draggingKeyframe.container) {
        const newTime = getTimeFromClientX(e.clientX, draggingKeyframe.container);
        moveLayerTimelineKeyframe(draggingKeyframe.layerId, draggingKeyframe.kfId, newTime);
      }
    };

    const handleGlobalPointerUp = () => {
      if (isScrubbing) {
        setIsScrubbing(false);
        setActiveScrubContainer(null);
      }
      if (draggingKeyframe) {
        setDraggingKeyframe(null);
      }
    };

    if (isScrubbing || draggingKeyframe) {
      window.addEventListener('pointermove', handleGlobalPointerMove);
      window.addEventListener('pointerup', handleGlobalPointerUp);
    }

    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', handleGlobalPointerUp);
    };
  }, [isScrubbing, activeScrubContainer, draggingKeyframe, getTimeFromClientX, setTimelineCurrentTime, moveLayerTimelineKeyframe]);

  // Keyboard shortcuts (Delete/Backspace to delete selected KF, Ctrl+D / Cmd+D to duplicate, Space to play/pause)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isTimelineOpen) return;
      if (e.key === 'Escape') {
        if (activeEasingPopover) setActiveEasingPopover(null);
        if (keyframeMenuPopover) setKeyframeMenuPopover(null);
        return;
      }

      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select') return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedTimelineKeyframeId && activeLayer) {
        e.preventDefault();
        deleteLayerTimelineKeyframe(activeLayer.id, selectedTimelineKeyframeId);
        setKeyframeMenuPopover(null);
      } else if ((e.key === 'd' || e.key === 'D') && (e.metaKey || e.ctrlKey) && selectedTimelineKeyframeId && activeLayer) {
        e.preventDefault();
        duplicateLayerTimelineKeyframe(activeLayer.id, selectedTimelineKeyframeId);
        setKeyframeMenuPopover(null);
      } else if (e.code === 'Space') {
        e.preventDefault();
        setTimelinePlaying(!timelinePlaying);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTimelineOpen, selectedTimelineKeyframeId, activeLayer, timelinePlaying, deleteLayerTimelineKeyframe, duplicateLayerTimelineKeyframe, setTimelinePlaying]);

  // Close popovers on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (activeEasingPopover && !target.closest('#timeline-easing-popover')) {
        setActiveEasingPopover(null);
      }
      if (keyframeMenuPopover && !target.closest('#timeline-keyframe-menu')) {
        setKeyframeMenuPopover(null);
      }
    };

    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [activeEasingPopover, keyframeMenuPopover]);

  if (!expertModeEnabled) return null;

  // Minimized collapsed bar
  if (!isTimelineOpen) {
    return (
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40">
        <button
          onClick={toggleTimelinePanel}
          className="flex items-center gap-2.5 px-4 py-2 rounded-full text-xs font-semibold shadow-xl border backdrop-blur-md transition-all hover:scale-105 active:scale-95 group"
          style={{
            backgroundColor: theme.bgPanel,
            borderColor: theme.border,
            color: theme.textMain
          }}
          title="Ouvrir la Timeline d'Animation"
        >
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <Clock size={13} className="text-blue-500" />
          <span>Timeline ({currentAnimation?.name || 'Animation 1'})</span>
          <span className="font-mono text-[11px] opacity-60">[{duration.toFixed(1)}s]</span>
        </button>
      </div>
    );
  }

  const progressPercent = Math.min(100, Math.max(0, (timelineCurrentTime / duration) * 100));

  // Compute nice tick intervals based on duration
  const tickInterval = duration <= 1 ? 0.2 : duration <= 3 ? 0.5 : 1.0;
  const numTicks = Math.floor(duration / tickInterval) + 1;
  const ticks = Array.from({ length: numTicks }, (_, i) => Math.min(duration, i * tickInterval));

  // Check if current playhead is close to a keyframe
  const currentKeyframeAtTime = sortedKeyframes.find(k => Math.abs(k.time - timelineCurrentTime) <= 0.04);
  const selectedOrCurrentKfId = selectedTimelineKeyframeId || currentKeyframeAtTime?.id || null;

  return (
    <div
      className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 w-[96%] max-w-5xl rounded-3xl border shadow-2xl backdrop-blur-2xl transition-all select-none overflow-hidden flex flex-col"
      style={{
        backgroundColor: `${theme.bgPanel}F8`,
        borderColor: `${theme.border}`,
        color: theme.textMain
      }}
    >
      {/* TOP HEADER CONTROLS - SINGLE ROW */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b text-xs font-medium"
        style={{ borderColor: `${theme.border}70` }}
      >
        {/* Left: Playback, Rewind, Time Display, Duplicate & Delete */}
        <div className="flex items-center gap-2">
          {/* Rewind */}
          <button
            onClick={() => setTimelineCurrentTime(0)}
            className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 active:scale-90 transition-all text-muted-foreground hover:text-foreground"
            title="Revenir à 0s"
          >
            <RotateCcw size={13} />
          </button>

          {/* Play / Pause */}
          <button
            onClick={() => setTimelinePlaying(!timelinePlaying)}
            className={`flex items-center justify-center w-7 h-7 rounded-xl font-bold shadow-md transition-all active:scale-90 ${
              timelinePlaying
                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
            title={timelinePlaying ? 'Pause (Espace)' : 'Lecture (Espace)'}
          >
            {timelinePlaying ? <Pause size={12} className="fill-white" /> : <Play size={12} className="fill-white ml-0.5" />}
          </button>

          {/* Current Time Display */}
          <div className="flex items-baseline gap-1 px-2 py-0.5 rounded-xl bg-black/5 dark:bg-white/5 border" style={{ borderColor: `${theme.border}50` }}>
            <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
              {timelineCurrentTime.toFixed(2)}s
            </span>
            <span className="text-[10px] opacity-40 font-mono">/</span>
            <span className="text-[10px] opacity-60 font-mono">
              {duration.toFixed(2)}s
            </span>
          </div>

          {/* Keyframe Actions: Duplicate & Delete (trash icon only) */}
          <div className="flex items-center gap-1 pl-1 border-l" style={{ borderColor: `${theme.border}60` }}>
            {/* Duplicate Selected Keyframe */}
            <button
              onClick={() => {
                if (activeLayer && selectedOrCurrentKfId) {
                  duplicateLayerTimelineKeyframe(activeLayer.id, selectedOrCurrentKfId);
                }
              }}
              disabled={!activeLayer || !selectedOrCurrentKfId}
              className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 active:scale-90 transition-all disabled:opacity-30 text-muted-foreground hover:text-blue-500"
              title="Dupliquer la pose sélectionnée (Ctrl+D)"
            >
              <Copy size={13} />
            </button>

            {/* Delete Selected Keyframe (Trash icon only, no text) */}
            <button
              onClick={() => {
                if (activeLayer && selectedOrCurrentKfId) {
                  deleteLayerTimelineKeyframe(activeLayer.id, selectedOrCurrentKfId);
                  setSelectedTimelineKeyframe(activeLayer.id, null);
                  setKeyframeMenuPopover(null);
                }
              }}
              disabled={!activeLayer || !selectedOrCurrentKfId}
              className="p-1.5 rounded-xl text-red-500 hover:bg-red-500/10 active:scale-90 transition-all disabled:opacity-30"
              title="Supprimer la pose sélectionnée (Suppr / Retour arrière)"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Center: Onion Skin & Animation Selector */}
        <div className="flex items-center gap-2">
          {/* Onion Skin (Pelure d'oignon) Toggle */}
          <button
            onClick={toggleOnionSkin}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all active:scale-95 shadow-sm ${
              onionSkinEnabled
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40'
                : 'opacity-60 hover:opacity-100 bg-transparent'
            }`}
            style={{ borderColor: !onionSkinEnabled ? theme.border : undefined }}
            title="Pelure d'oignon : affiche la pose précédente en cyan et la pose suivante en orange"
          >
            <Layers size={12} className={onionSkinEnabled ? 'text-amber-500' : ''} />
            <span>Pelure d'oignon</span>
          </button>

          {/* Animation Selector */}
          <select
            value={currentAnimation?.id || ''}
            onChange={(e) => {
              if (e.target.value === '__new__') {
                addAnimation();
              } else {
                setActiveAnimation(e.target.value);
              }
            }}
            className="bg-transparent border rounded-xl px-2 py-1 text-xs font-semibold outline-none cursor-pointer"
            style={{ borderColor: theme.border, color: theme.textMain }}
          >
            {animations.map(anim => (
              <option key={anim.id} value={anim.id} style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>
                {anim.name} ({anim.duration}s)
              </option>
            ))}
            <option value="__new__" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>
              + Nouvelle Animation...
            </option>
          </select>
        </div>

        {/* Right: Duration Setting & Minimize */}
        <div className="flex items-center gap-2">
          {/* Duration Badge / Input */}
          <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 border px-2 py-0.5 rounded-xl" style={{ borderColor: `${theme.border}50` }}>
            <span className="text-[10px] uppercase tracking-wider opacity-60 font-semibold">Durée:</span>
            {isEditingDuration ? (
              <input
                type="number"
                min="0.2"
                max="60"
                step="0.1"
                value={durationInput}
                autoFocus
                onBlur={() => {
                  setIsEditingDuration(false);
                  const parsed = parseFloat(durationInput);
                  if (currentAnimation && parsed > 0) {
                    setAnimationDuration(currentAnimation.id, Math.round(parsed * 10) / 10);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setIsEditingDuration(false);
                    const parsed = parseFloat(durationInput);
                    if (currentAnimation && parsed > 0) {
                      setAnimationDuration(currentAnimation.id, Math.round(parsed * 10) / 10);
                    }
                  }
                }}
                onChange={(e) => setDurationInput(e.target.value)}
                className="w-12 bg-transparent text-xs font-mono font-bold outline-none text-center"
              />
            ) : (
              <span
                onClick={() => setIsEditingDuration(true)}
                className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 cursor-pointer hover:underline"
                title="Cliquer pour modifier la durée"
              >
                {duration.toFixed(1)}s
              </span>
            )}
          </div>

          {/* Close / Minimize */}
          <button
            onClick={toggleTimelinePanel}
            className="p-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-muted-foreground hover:text-foreground"
            title="Réduire la timeline"
          >
            <ChevronDown size={15} />
          </button>
        </div>
      </div>

      {/* SINGLE LAYER TRACK & RULER CONTAINER */}
      <div className="p-3.5 space-y-2">
        {/* TOP RULER HEADER */}
        <div className="flex items-center gap-3 px-2">
          {/* Left spacer: Layer Selector Dropdown for quick focus */}
          <div className="w-44 flex-shrink-0 flex items-center pr-2">
            <select
              value={activeLayer?.id || ''}
              onChange={(e) => {
                selectLayer(e.target.value);
                setSelectedLayerTrack(e.target.value);
              }}
              className="w-full bg-black/5 dark:bg-white/5 border rounded-xl px-2 py-1 text-xs font-semibold outline-none cursor-pointer truncate"
              style={{ borderColor: `${theme.border}80`, color: theme.textMain }}
              title="Changer le calque affiché dans la timeline"
            >
              {availableLayers.map(l => (
                <option key={l.id} value={l.id} style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>
                  Calque : {l.name}
                </option>
              ))}
            </select>
          </div>

          {/* Ruler Canvas Area */}
          <div
            ref={rulerRef}
            onPointerDown={(e) => {
              if (rulerRef.current) {
                setIsScrubbing(true);
                setActiveScrubContainer(rulerRef.current);
                const newTime = getTimeFromClientX(e.clientX, rulerRef.current);
                setTimelineCurrentTime(newTime);
              }
            }}
            className="relative flex-1 h-6 cursor-pointer select-none rounded-lg bg-black/5 dark:bg-white/5 border flex items-center overflow-visible group"
            style={{ borderColor: `${theme.border}60` }}
            title="Cliquez ou glissez pour déplacer la tête de lecture"
          >
            {/* Ruler Ticks */}
            {ticks.map((t) => {
              const tickPos = (t / duration) * 100;
              return (
                <div
                  key={t}
                  className="absolute top-0 bottom-0 flex flex-col justify-between items-center -translate-x-1/2 pointer-events-none"
                  style={{ left: `${tickPos}%` }}
                >
                  <span className="text-[9px] font-mono opacity-50 select-none">
                    {t.toFixed(1)}s
                  </span>
                  <div className="w-[1px] h-1.5 bg-current opacity-30" />
                </div>
              );
            })}

            {/* Playhead Head (Needle Top) */}
            <div
              className="absolute top-0 bottom-0 -translate-x-1/2 pointer-events-none z-30 flex flex-col items-center"
              style={{ left: `${progressPercent}%` }}
            >
              <div className="w-3.5 h-3.5 bg-blue-600 text-white rounded-md shadow-lg border-2 border-white flex items-center justify-center -mt-1 transform rotate-45 scale-90">
                <div className="w-1 h-1 rounded-full bg-white" />
              </div>
              <div className="w-0.5 flex-1 bg-blue-600 shadow-sm" />
            </div>
          </div>
        </div>

        {/* ACTIVE LAYER TRACK BAR */}
        {activeLayer ? (
          <div className="flex items-center gap-3 px-2 py-1.5 rounded-2xl border bg-blue-500/5 border-blue-500/30 ring-1 ring-blue-500/20">
            {/* Left Column: Active Layer Label */}
            <div className="w-44 flex-shrink-0 flex items-center justify-between pr-2">
              <div className="flex items-center gap-2 truncate flex-1">
                <div className="w-3 h-3 rounded-full flex-shrink-0 bg-blue-500 ring-2 ring-blue-400/40" />
                <span className="text-xs truncate font-bold text-blue-600 dark:text-blue-400">
                  {activeLayer.name}
                </span>
                <span className="text-[10px] font-mono opacity-50 font-normal">
                  ({sortedKeyframes.length} {sortedKeyframes.length > 1 ? 'poses' : 'pose'})
                </span>
              </div>
            </div>

            {/* Right Column: Keyframe Track Bar (Clicking anywhere scrubs timeline!) */}
            <div
              onPointerDown={(e) => {
                const targetEl = e.currentTarget as HTMLElement;
                // Move playhead on click and start scrubbing
                setIsScrubbing(true);
                setActiveScrubContainer(targetEl);
                const newTime = getTimeFromClientX(e.clientX, targetEl);
                setTimelineCurrentTime(newTime);
                selectLayer(activeLayer.id);
                setSelectedLayerTrack(activeLayer.id);
              }}
              onDoubleClick={(e) => {
                const targetEl = e.currentTarget as HTMLElement;
                const newTime = getTimeFromClientX(e.clientX, targetEl);
                addLayerTimelineKeyframe(activeLayer.id, newTime);
                setSelectedLayerTrack(activeLayer.id);
              }}
              className="relative flex-1 h-10 rounded-xl bg-black/5 dark:bg-white/5 border border-blue-500/30 cursor-pointer select-none overflow-visible group flex items-center"
              title="Cliquez ou glissez pour déplacer la tête de lecture. Double-cliquez pour ajouter une pose."
            >
              {/* Connected Span Lines & Easing Badges between adjacent keyframes */}
              {sortedKeyframes.map((kf, idx) => {
                const nextKf = sortedKeyframes[idx + 1];
                if (!nextKf) return null;

                const startPct = (kf.time / duration) * 100;
                const endPct = (nextKf.time / duration) * 100;
                const widthPct = Math.max(0, endPct - startPct);
                const midPct = startPct + widthPct / 2;
                const currentEasing = kf.easing || 'easeInOut';

                return (
                  <React.Fragment key={`span-${kf.id}-${nextKf.id}`}>
                    {/* Connecting Line */}
                    <div
                      className="absolute h-1 bg-blue-500/35 group-hover:bg-blue-500/60 rounded-full pointer-events-none transition-colors"
                      style={{
                        left: `${startPct}%`,
                        width: `${widthPct}%`
                      }}
                    />

                    {/* Easing Button in Center of Span (Opens Ease Mini-Menu) */}
                    <button
                      type="button"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setActiveEasingPopover({
                          layerId: activeLayer.id,
                          kfId: kf.id,
                          x: rect.left + rect.width / 2,
                          y: rect.top - 8,
                          currentEasing,
                          isLoopTransition: false
                        });
                      }}
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 w-6 h-6 rounded-full bg-white dark:bg-zinc-800 shadow-md border-2 border-blue-500 flex items-center justify-center text-blue-600 dark:text-blue-400 hover:scale-125 transition-transform cursor-pointer active:scale-95"
                      style={{ left: `${midPct}%` }}
                      title={`Courbe entre poses : ${currentEasing} (Cliquer pour choisir un type de courbe)`}
                    >
                      <EasingCurveIcon easing={currentEasing} size={11} />
                    </button>
                  </React.Fragment>
                );
              })}

              {/* Loop Easing Badge (from last keyframe back to first) in loop mode */}
              {loopMode === 'loop' && sortedKeyframes.length >= 2 && (() => {
                const lastKf = sortedKeyframes[sortedKeyframes.length - 1];
                const firstKf = sortedKeyframes[0];
                const lastPct = (lastKf.time / duration) * 100;
                const firstPct = (firstKf.time / duration) * 100;
                const currentEasing = lastKf.easing || 'easeInOut';

                return (
                  <React.Fragment key={`span-loop-${lastKf.id}`}>
                    {/* Tail connecting line to duration end */}
                    <div
                      className="absolute h-0.5 border-b-2 border-dashed border-purple-400/60 pointer-events-none"
                      style={{ left: `${lastPct}%`, right: 0 }}
                    />
                    {/* Head connecting line from 0 to first keyframe */}
                    <div
                      className="absolute h-0.5 border-b-2 border-dashed border-purple-400/60 pointer-events-none"
                      style={{ left: 0, width: `${firstPct}%` }}
                    />
                    {/* Loop Easing Button Indicator at Track End */}
                    <button
                      type="button"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setActiveEasingPopover({
                          layerId: activeLayer.id,
                          kfId: lastKf.id,
                          x: rect.left + rect.width / 2,
                          y: rect.top - 8,
                          currentEasing,
                          isLoopTransition: true
                        });
                      }}
                      className="absolute right-1 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/60 border border-purple-300 dark:border-purple-700 shadow-sm text-purple-600 dark:text-purple-300 hover:scale-110 transition-transform cursor-pointer active:scale-95"
                      title={`Courbe de boucle (dernière pose ➔ 1ère pose) : ${currentEasing} (Cliquer pour choisir un type de courbe)`}
                    >
                      <Repeat size={10} className="text-purple-500" />
                      <EasingCurveIcon easing={currentEasing} size={10} />
                    </button>
                  </React.Fragment>
                );
              })()}

              {/* Keyframe Nodes (Diamonds) */}
              {sortedKeyframes.map((kf) => {
                const kfPos = Math.min(100, Math.max(0, (kf.time / duration) * 100));
                const isSelected = selectedTimelineKeyframeId === kf.id;

                return (
                  <div
                    key={kf.id}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setSelectedLayerTrack(activeLayer.id);
                      setSelectedTimelineKeyframe(activeLayer.id, kf.id);
                      setTimelineCurrentTime(kf.time);
                      setKeyframeMenuPopover({
                        layerId: activeLayer.id,
                        kfId: kf.id,
                        time: kf.time,
                        easing: kf.easing || 'easeInOut',
                        x: rect.left + rect.width / 2,
                        y: rect.top - 8
                      });
                    }}
                    onPointerDownCapture={(e) => {
                      e.stopPropagation();
                      const targetEl = e.currentTarget.parentElement as HTMLElement;
                      setSelectedLayerTrack(activeLayer.id);
                      setSelectedTimelineKeyframe(activeLayer.id, kf.id);
                      setTimelineCurrentTime(kf.time);
                      setDraggingKeyframe({ layerId: activeLayer.id, kfId: kf.id, container: targetEl });

                      if (e.button === 2) {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setKeyframeMenuPopover({
                          layerId: activeLayer.id,
                          kfId: kf.id,
                          time: kf.time,
                          easing: kf.easing || 'easeInOut',
                          x: rect.left + rect.width / 2,
                          y: rect.top - 8
                        });
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setSelectedLayerTrack(activeLayer.id);
                      setSelectedTimelineKeyframe(activeLayer.id, kf.id);
                      setTimelineCurrentTime(kf.time);
                      setKeyframeMenuPopover({
                        layerId: activeLayer.id,
                        kfId: kf.id,
                        time: kf.time,
                        easing: kf.easing || 'easeInOut',
                        x: rect.left + rect.width / 2,
                        y: rect.top - 8
                      });
                    }}
                    className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-25 w-4.5 h-4.5 rounded-sm transform rotate-45 transition-transform hover:scale-135 cursor-grab active:cursor-grabbing shadow-md flex items-center justify-center ${
                      isSelected
                        ? 'bg-blue-600 border-2 border-white ring-2 ring-blue-400 scale-115 z-30'
                        : 'bg-white dark:bg-zinc-800 border-2 border-blue-500'
                    }`}
                    style={{ left: `${kfPos}%` }}
                    title={`${kf.name || 'Pose'} (${kf.time.toFixed(2)}s) - Cliquez pour options`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-blue-500'}`} />
                  </div>
                );
              })}

              {/* Playhead Needle on Track */}
              <div
                className="absolute top-0 bottom-0 -translate-x-1/2 pointer-events-none z-30 flex flex-col items-center"
                style={{ left: `${progressPercent}%` }}
              >
                <div className="w-0.5 h-full bg-blue-600 shadow-sm opacity-90" />
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 text-center text-xs text-muted-foreground">
            Aucun calque sélectionné. Veuillez créer ou sélectionner un calque.
          </div>
        )}
      </div>

      {/* FLOATING EASING PICKER POPOVER (Mini-Menu de choix de courbe) */}
      {activeEasingPopover && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 pointer-events-auto" style={{ zIndex: 99999 }}>
          {/* Transparent Backdrop to dismiss on outside click */}
          <div
            className="absolute inset-0 bg-black/15 backdrop-blur-[0.5px]"
            onPointerDown={(e) => {
              e.stopPropagation();
              setActiveEasingPopover(null);
            }}
          />
          {/* Floating Menu Card */}
          <div
            id="timeline-easing-popover"
            className="absolute -translate-x-1/2 -translate-y-full mb-3 w-64 p-2 rounded-2xl border shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 select-none"
            style={{
              left: Math.max(140, Math.min(window.innerWidth - 140, activeEasingPopover.x)),
              top: Math.max(260, activeEasingPopover.y),
              backgroundColor: `${theme.bgPanel}F8`,
              borderColor: theme.border,
              color: theme.textMain
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-2 py-1 mb-1.5 border-b text-[11px] font-bold" style={{ borderColor: `${theme.border}60` }}>
              <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                <Sparkles size={12} />
                {activeEasingPopover.isLoopTransition ? 'Courbe de boucle' : "Courbe d'accélération (Ease)"}
              </span>
              <button
                type="button"
                onClick={() => setActiveEasingPopover(null)}
                className="p-0.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5 opacity-60 hover:opacity-100 transition-opacity"
              >
                <X size={12} />
              </button>
            </div>

            <div className="space-y-1">
              {EASING_OPTIONS.map((opt) => {
                const isSelected = activeEasingPopover.currentEasing === opt.type;
                return (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => {
                      updateLayerTimelineKeyframeEasing(activeEasingPopover.layerId, activeEasingPopover.kfId, opt.type);
                      setActiveEasingPopover(null);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left text-xs transition-all ${
                      isSelected
                        ? 'bg-blue-600 text-white font-semibold shadow-sm'
                        : 'hover:bg-black/5 dark:hover:bg-white/5 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`p-1 rounded-lg ${isSelected ? 'bg-white/20' : 'bg-black/5 dark:bg-white/5'}`}>
                        <EasingCurveIcon easing={opt.type} size={14} className={isSelected ? 'text-white' : 'text-blue-500'} />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-semibold text-xs leading-tight">{opt.label}</span>
                        <span className={`text-[10px] leading-tight ${isSelected ? 'text-white/80' : 'opacity-60'}`}>{opt.desc}</span>
                      </div>
                    </div>
                    {isSelected && <Check size={14} className="stroke-[3] flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* FLOATING KEYFRAME ACTION MENU (Mini popover pour Supprimer, Dupliquer, Courbe) */}
      {keyframeMenuPopover && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 pointer-events-auto" style={{ zIndex: 99999 }}>
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/15 backdrop-blur-[0.5px]"
            onPointerDown={(e) => {
              e.stopPropagation();
              setKeyframeMenuPopover(null);
            }}
          />
          <div
            id="timeline-keyframe-menu"
            className="absolute -translate-x-1/2 -translate-y-full mb-3 w-48 p-1.5 rounded-2xl border shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 select-none"
            style={{
              left: Math.max(120, Math.min(window.innerWidth - 120, keyframeMenuPopover.x)),
              top: Math.max(200, keyframeMenuPopover.y),
              backgroundColor: `${theme.bgPanel}F8`,
              borderColor: theme.border,
              color: theme.textMain
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Header with Timestamp */}
            <div className="flex items-center justify-between px-2 py-1 mb-1 border-b text-[11px]" style={{ borderColor: `${theme.border}60` }}>
              <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                Pose ({keyframeMenuPopover.time.toFixed(2)}s)
              </span>
              <button
                type="button"
                onClick={() => setKeyframeMenuPopover(null)}
                className="p-0.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5 opacity-60 hover:opacity-100"
              >
                <X size={12} />
              </button>
            </div>

            <div className="space-y-0.5">
              {/* Duplicate Action */}
              <button
                type="button"
                onClick={() => {
                  duplicateLayerTimelineKeyframe(keyframeMenuPopover.layerId, keyframeMenuPopover.kfId);
                  setKeyframeMenuPopover(null);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-left text-xs hover:bg-blue-500/10 hover:text-blue-600 transition-colors font-medium"
              >
                <Copy size={13} className="text-blue-500" />
                <span>Dupliquer la pose</span>
              </button>

              {/* Change Easing Action */}
              <button
                type="button"
                onClick={() => {
                  const popover = { ...keyframeMenuPopover };
                  setKeyframeMenuPopover(null);
                  setActiveEasingPopover({
                    layerId: popover.layerId,
                    kfId: popover.kfId,
                    x: popover.x,
                    y: popover.y,
                    currentEasing: popover.easing,
                    isLoopTransition: false
                  });
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-left text-xs hover:bg-black/5 dark:hover:bg-white/5 transition-colors font-medium text-muted-foreground hover:text-foreground"
              >
                <Sparkles size={13} className="text-purple-500" />
                <span>Changer la courbe</span>
              </button>

              {/* Delete Action */}
              <button
                type="button"
                onClick={() => {
                  deleteLayerTimelineKeyframe(keyframeMenuPopover.layerId, keyframeMenuPopover.kfId);
                  setKeyframeMenuPopover(null);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-left text-xs text-red-500 hover:bg-red-500/10 transition-colors font-semibold"
              >
                <Trash2 size={13} />
                <span>Supprimer la pose</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

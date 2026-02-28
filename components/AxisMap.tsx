// components/AxisMap.tsx
import React, { useRef, useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { APP_COLORS } from '../constants';
import { distance } from '../utils/math';

export const AxisMap: React.FC = () => {
  const { 
      project, updateAxisValue, ui, selectKeyframe, deleteKeyframe, 
      updateKeyframePosition, updateMultipleAxisValues,
      copyKeyframeState, pasteKeyframeState, clipboard, splitKeyframeForLayer
  } = useStore();
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingKfId, setDraggingKfId] = useState<string | null>(null);
  const currentDraggingKfIdRef = useRef<string | null>(null);
  const hasSplitRef = useRef(false);
  const initialPosRef = useRef<{x: number, y: number} | null>(null);

  const axisX = project.axes.find(a => a.id === 'axis-x');
  const axisY = project.axes.find(a => a.id === 'axis-y');

  if (!axisX || !axisY) return null;

  // -- Helpers --

  const getAxisValuesFromEvent = (e: React.PointerEvent) => {
      if (!containerRef.current) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      const rawX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const rawY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      
      const padding = ui.axisMatrixPadding;
      const effectiveSize = 1 - (padding * 2);
      let x = rawX;
      let y = rawY;

      if (ui.snapMatrixGrid) {
          const steps = ui.axisMatrixDivisions - 1;
          if (steps > 0) {
              const relativeX = (rawX - padding) / effectiveSize;
              const relativeY = (rawY - padding) / effectiveSize;
              const snappedRelX = Math.round(relativeX * steps) / steps;
              const snappedRelY = Math.round(relativeY * steps) / steps;
              
              x = padding + (snappedRelX * effectiveSize);
              y = padding + (snappedRelY * effectiveSize);
              
              x = Math.max(padding, Math.min(1 - padding, x));
              y = Math.max(padding, Math.min(1 - padding, y));
          }
      }
      return { x, y, rawX, rawY }; // Return raw for hit testing if needed
  };

  const findHitKeyframe = (x: number, y: number) => {
      // Find the keyframe closest to (x,y) within a tolerance
      // Coordinates are 0-1
      const HIT_TOLERANCE = 0.05; // 5% of width
      
      // Sort by distance to find closest top-most
      const sorted = [...project.keyframes].map(kf => {
          const kx = kf.axisValues[axisX.id] ?? 0.5;
          const ky = kf.axisValues[axisY.id] ?? 0.5;
          const dist = Math.sqrt(Math.pow(kx - x, 2) + Math.pow(ky - y, 2));
          return { id: kf.id, dist };
      }).sort((a,b) => a.dist - b.dist);

      if (sorted.length > 0 && sorted[0].dist < HIT_TOLERANCE) {
          return sorted[0].id;
      }
      return null;
  };

  // -- Event Handlers --

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    
    // Calculate Click Position (Raw and Snapped)
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const rawX = (e.clientX - rect.left) / rect.width;
    const rawY = (e.clientY - rect.top) / rect.height;

    // 1. Hit Test Keyframes first
    const hitId = findHitKeyframe(rawX, rawY);
    
    if (hitId) {
        setDraggingKfId(hitId);
        currentDraggingKfIdRef.current = hitId;
        hasSplitRef.current = false;
        
        const { x, y } = getAxisValuesFromEvent(e);
        initialPosRef.current = { x, y };

        selectKeyframe(hitId); 
        
        // CRITICAL: Snap axes to the clicked keyframe instantly.
        // This ensures the interpolation engine renders the state at 100% opacity (weight 1.0)
        const kf = project.keyframes.find(k => k.id === hitId);
        if (kf) {
             const kx = kf.axisValues[axisX.id] ?? 0.5;
             const ky = kf.axisValues[axisY.id] ?? 0.5;
             updateMultipleAxisValues({ [axisX.id]: kx, [axisY.id]: ky });
        }

    } else {
        // 2. Else, move cursor
        const { x, y } = getAxisValuesFromEvent(e);
        updateAxisValue(axisX.id, x);
        updateAxisValue(axisY.id, y);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.buttons === 0) return;

    const { x, y } = getAxisValuesFromEvent(e);

    const currentDragId = currentDraggingKfIdRef.current;

    if (currentDragId) {
        // Drag Keyframe
        if (!hasSplitRef.current && initialPosRef.current && ui.selectedLayerId) {
            const dist = Math.hypot(x - initialPosRef.current.x, y - initialPosRef.current.y);
            if (dist > 0.01) { // Small threshold to detect actual drag vs click
                const newKfId = splitKeyframeForLayer(currentDragId, ui.selectedLayerId);
                setDraggingKfId(newKfId);
                currentDraggingKfIdRef.current = newKfId;
                hasSplitRef.current = true;
                updateKeyframePosition(newKfId, x, y);
            }
        } else {
            updateKeyframePosition(currentDragId, x, y);
        }
    } else {
        // Drag Cursor
        updateAxisValue(axisX.id, x);
        updateAxisValue(axisY.id, y);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture(e.pointerId);
    setDraggingKfId(null);
    currentDraggingKfIdRef.current = null;
  };

  const selectedKf = project.keyframes.find(k => k.id === ui.selectedKeyframeId);

  // Grid Lines Generation
  const gridLines = [];
  const padding = ui.axisMatrixPadding;
  const effectiveSize = 1 - (padding * 2);
  const steps = ui.axisMatrixDivisions - 1;
  
  if (steps > 0) {
      for (let i = 0; i <= steps; i++) {
          const pos = padding + (i / steps) * effectiveSize;
          const pct = pos * 100;
          
          gridLines.push(
              <div key={`v-${i}`} className="absolute top-0 bottom-0 border-l border-gray-100 pointer-events-none" style={{ left: `${pct}%`, top: `${padding*100}%`, bottom: `${padding*100}%` }} />
          );
          gridLines.push(
              <div key={`h-${i}`} className="absolute left-0 right-0 border-t border-gray-100 pointer-events-none" style={{ top: `${pct}%`, left: `${padding*100}%`, right: `${padding*100}%` }} />
          );
      }
  }

  return (
    <div className="fixed bottom-6 left-6 z-50 flex flex-col gap-2">
      <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-gray-200 p-3 w-52">
        <div className="flex justify-between items-center mb-2">
          <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Matrix</span>
          
          <div className="flex items-center gap-1">
             
             {/* PASTE (Always visible if clipboard has data) */}
             <button 
                onClick={pasteKeyframeState}
                disabled={!clipboard}
                className={`p-1 rounded transition-colors ${!clipboard ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50'}`}
                title="Paste State"
            >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
            </button>

             {selectedKf && (
                 <>
                    {/* SEPARATOR */}
                    <div className="w-px h-3 bg-gray-200 mx-1"></div>

                    {/* COPY */}
                    <button 
                        onClick={copyKeyframeState}
                        className="text-gray-400 hover:text-blue-500 hover:bg-blue-50 p-1 rounded transition-colors"
                        title="Copy State"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                    
                    {/* DELETE */}
                    {project.keyframes.length > 1 && (
                        <button 
                        onClick={() => deleteKeyframe(selectedKf.id)}
                        className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1 rounded transition-colors"
                        title="Delete State"
                        >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    )}
                 </>
             )}
          </div>
        </div>
        
        <div 
          ref={containerRef}
          className="relative w-full aspect-square bg-white rounded-lg border border-gray-200 cursor-crosshair overflow-hidden shadow-inner touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* Configurable Grid */}
          {gridLines}

          {/* Keyframes Dots */}
          {project.keyframes.map(kf => {
            const kfX = kf.axisValues[axisX.id] ?? 0.5;
            const kfY = kf.axisValues[axisY.id] ?? 0.5;
            
            const isSelected = ui.selectedKeyframeId === kf.id;
            const isDragging = draggingKfId === kf.id;
            
            const hasDataForCurrentLayer = kf.layerStates.some(ls => ls.layerId === ui.selectedLayerId && ls.strokes.length > 0);
            
            return (
              <div
                key={kf.id}
                className={`absolute -ml-1.5 -mt-1.5 rounded-full transition-transform pointer-events-none flex items-center justify-center ${
                    isSelected ? 'z-20 scale-125' : 'z-10'
                } ${isDragging ? 'scale-150' : ''}`}
                style={{ 
                    left: `${kfX * 100}%`, 
                    top: `${kfY * 100}%`,
                    width: '12px',
                    height: '12px',
                }}
              >
                  {isSelected && (
                      <div className={`absolute inset-0 rounded-full border-2 border-blue-500 shadow-sm ${isDragging ? 'border-4' : 'animate-pulse'}`} />
                  )}

                  <div className={`rounded-full ${
                      hasDataForCurrentLayer
                        ? 'w-2 h-2 bg-gray-800' 
                        : 'w-2 h-2 border border-gray-300 bg-white' 
                  }`} />
              </div>
            );
          })}

          {/* Current Cursor */}
          <div 
            className="absolute w-4 h-4 -ml-2 -mt-2 pointer-events-none z-30 transition-opacity duration-200"
            style={{ 
                left: `${axisX.currentValue * 100}%`, 
                top: `${axisY.currentValue * 100}%`,
                opacity: draggingKfId ? 0.5 : 1 // Dim cursor when dragging a keyframe
            }}
          >
             <svg viewBox="0 0 24 24" fill="none" stroke={APP_COLORS.primary} strokeWidth="3">
               <line x1="12" y1="0" x2="12" y2="24" />
               <line x1="0" y1="12" x2="24" y2="12" />
             </svg>
          </div>
        </div>
        
        <div className="mt-2 flex justify-between text-[10px] text-gray-400 font-mono">
          <span>{draggingKfId ? 'DRAGGING' : `X: ${(axisX.currentValue * 100).toFixed(1)}%`}</span>
          <span>{draggingKfId ? 'STATE' : `Y: ${(axisY.currentValue * 100).toFixed(1)}%`}</span>
        </div>
      </div>
    </div>
  );
};
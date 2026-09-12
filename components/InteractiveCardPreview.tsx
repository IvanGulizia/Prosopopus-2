// components/InteractiveCardPreview.tsx
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ProsopopusPlayer } from '../src/player';
import { Project } from '../types';

interface InteractiveCardPreviewProps {
  projectJson: string;
  thumbnail?: string;
  title: string;
  aspectRatio?: 'wide' | 'square' | 'portrait' | 'tall';
  theme: any;
  canvasBg?: string;
}

export const InteractiveCardPreview: React.FC<InteractiveCardPreviewProps> = ({
  projectJson,
  thumbnail,
  title,
  aspectRatio = 'wide',
  theme,
  canvasBg = '#ffffff'
}) => {
  const [isRendered, setIsRendered] = useState(false);
  const [hasError, setHasError] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playerRef = useRef<ProsopopusPlayer | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stopTimeoutRef = useRef<number | null>(null);

  // Parse project JSON
  const parsedProject = useMemo<Project | null>(() => {
    try {
      if (!projectJson) return null;
      return JSON.parse(projectJson) as Project;
    } catch (e) {
      console.warn('InteractiveCardPreview JSON parse error:', e);
      return null;
    }
  }, [projectJson]);

  // Determine aspect ratio class
  const ratioClass = useMemo(() => {
    switch (aspectRatio) {
      case 'portrait':
      case 'tall':
        return 'aspect-[3/4]';
      case 'square':
        return 'aspect-square';
      case 'wide':
      default:
        return 'aspect-[16/10]';
    }
  }, [aspectRatio]);

  // Initialize canvas and player on mount
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current || !parsedProject) return;

    try {
      const canvas = canvasRef.current;
      const rect = containerRef.current.getBoundingClientRect();
      const width = Math.round(rect.width || 360);
      const height = Math.round(rect.height || (width * 10) / 16);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, width * dpr);
      canvas.height = Math.max(1, height * dpr);

      const player = new ProsopopusPlayer(canvas, parsedProject, {
        scopedToCanvas: true,
        resetOnLeave: true
      });
      playerRef.current = player;

      // Render initial frame immediately
      player.renderFrame();
      setIsRendered(true);
    } catch (err) {
      console.warn('Failed to initialize interactive canvas:', err);
      setHasError(true);
    }

    return () => {
      if (stopTimeoutRef.current) {
        window.clearTimeout(stopTimeoutRef.current);
      }
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [parsedProject]);

  // Handle pointer enter
  const handlePointerEnter = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (stopTimeoutRef.current) {
      window.clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }

    const player = playerRef.current;
    if (!player) return;

    // Start 60fps loop for fluid spring physics & interaction
    player.start();

    // Immediately register position
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      player.setDirectPointer(nx, ny);
    }
  }, []);

  // Handle pointer move (iframe-like cursor tracking)
  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const player = playerRef.current;
    if (!player) return;

    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      player.setDirectPointer(nx, ny);
    }
  }, []);

  // Handle pointer leave (smoothly return to center, then stop loop to save CPU)
  const handlePointerLeave = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;

    // Reset target axes to center
    player.setDirectPointer(0.5, 0.5);

    // Allow spring physics to settle for 500ms before pausing loop
    if (stopTimeoutRef.current) {
      window.clearTimeout(stopTimeoutRef.current);
    }
    stopTimeoutRef.current = window.setTimeout(() => {
      player.stop();
    }, 500);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${ratioClass} overflow-hidden rounded-xl cursor-pointer select-none`}
      style={{ backgroundColor: canvasBg }}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {/* Fallback Static Thumbnail until initial frame is drawn */}
      {thumbnail && !isRendered && (
        <img
          src={thumbnail}
          alt={title}
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        />
      )}

      {/* Pure Interactive Canvas (No overlay badges, no play buttons, pure iframe-like art) */}
      {!hasError && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full block touch-none pointer-events-none"
          style={{ width: '100%', height: '100%' }}
        />
      )}
    </div>
  );
};

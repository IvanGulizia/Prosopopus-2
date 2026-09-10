import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { 
  StateNode, 
  StateTransition, 
  StateNodeType, 
  StateTransitionTrigger, 
  EasingType 
} from '../types';
import { 
  Zap, 
  Play, 
  Pause, 
  Plus, 
  Trash2, 
  Camera, 
  Move, 
  Maximize2, 
  Minimize2, 
  X, 
  Sliders, 
  Clock, 
  MousePointer, 
  Key, 
  ArrowRight,
  Film,
  Sparkles,
  Layers,
  HelpCircle,
  Eye,
  Pencil
} from 'lucide-react';

export const StateMachineGraph: React.FC = () => {
  const { 
    project, 
    ui, 
    toggleInteractionsPanel, 
    ensureStateMachine,
    addStateNode,
    updateStateNode,
    deleteStateNode,
    addStateTransition,
    updateStateTransition,
    deleteStateTransition,
    captureCurrentPoseToStateNode,
    applyPoseStateNodeToCanvas,
    createPoseStateNodeFromCurrent,
    createClipStateNode,
    addAnimation,
    renameAnimation,
    setGraphWindowPosition,
    setGraphWindowSize,
    setGraphWindowMaximized,
    setSelectedGraphNode,
    setSelectedGraphTransition,
    setActiveStateNode,
    setRuntimeScrollProgress,
    setMode
  } = useStore();

  const [poseCapturedFeedback, setPoseCapturedFeedback] = useState<string | null>(null);

  const theme = ui.theme;
  const sm = ensureStateMachine();

  // Window drag & resize states
  const [isDraggingWindow, setIsDraggingWindow] = useState(false);
  const [isResizingWindow, setIsResizingWindow] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number; startW: number; startH: number }>({
    mouseX: 0, mouseY: 0, startX: 0, startY: 0, startW: 0, startH: 0
  });

  // Canvas Pan & Zoom
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });

  // Node Dragging inside Graph Canvas
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const nodeDragStartRef = useRef<{ mouseX: number; mouseY: number; nodeX: number; nodeY: number }>({
    mouseX: 0, mouseY: 0, nodeX: 0, nodeY: 0
  });

  // Cable Connection Dragging (Creating a new transition)
  const [connectingFromNodeId, setConnectingFromNodeId] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const graphContainerRef = useRef<HTMLDivElement>(null);

  // Fallback initial window position/size if undefined
  const winPos = ui.graphWindowPosition || { x: 240, y: 80 };
  const winSize = ui.graphWindowSize || { width: 780, height: 490 };
  const isMaximized = ui.graphWindowMaximized || false;

  const selectedNode = sm.nodes.find(n => n.id === ui.selectedGraphNodeId);
  const selectedTransition = sm.transitions.find(t => t.id === ui.selectedGraphTransitionId);

  // Active state node (default to entry or first state)
  const activeNodeId = ui.activeStateNodeId || sm.entryNodeId;

  // --- Window Dragging Logic ---
  const handleWindowHeaderMouseDown = (e: React.MouseEvent) => {
    if (isMaximized) return;
    setIsDraggingWindow(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: winPos.x,
      startY: winPos.y,
      startW: winSize.width,
      startH: winSize.height
    };
  };

  // --- Window Resizing Logic ---
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizingWindow(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: winPos.x,
      startY: winPos.y,
      startW: winSize.width,
      startH: winSize.height
    };
  };

  const connectingFromNodeIdRef = useRef<string | null>(null);
  useEffect(() => {
    connectingFromNodeIdRef.current = connectingFromNodeId;
  }, [connectingFromNodeId]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingWindow) {
        const dx = e.clientX - dragStartRef.current.mouseX;
        const dy = e.clientY - dragStartRef.current.mouseY;
        const newX = Math.max(10, Math.min(window.innerWidth - 120, dragStartRef.current.startX + dx));
        const newY = Math.max(10, Math.min(window.innerHeight - 80, dragStartRef.current.startY + dy));
        setGraphWindowPosition({ x: newX, y: newY });
      } else if (isResizingWindow) {
        const dx = e.clientX - dragStartRef.current.mouseX;
        const dy = e.clientY - dragStartRef.current.mouseY;
        const newW = Math.max(480, Math.min(window.innerWidth - 40, dragStartRef.current.startW + dx));
        const newH = Math.max(320, Math.min(window.innerHeight - 40, dragStartRef.current.startH + dy));
        setGraphWindowSize({ width: newW, height: newH });
      } else if (isPanning) {
        const dx = e.clientX - panStartRef.current.mouseX;
        const dy = e.clientY - panStartRef.current.mouseY;
        setPan({
          x: panStartRef.current.panX + dx,
          y: panStartRef.current.panY + dy
        });
      } else if (draggingNodeId) {
        const dx = (e.clientX - nodeDragStartRef.current.mouseX) / zoom;
        const dy = (e.clientY - nodeDragStartRef.current.mouseY) / zoom;
        updateStateNode(draggingNodeId, {
          x: Math.round(nodeDragStartRef.current.nodeX + dx),
          y: Math.round(nodeDragStartRef.current.nodeY + dy)
        });
      } else if (connectingFromNodeId && graphContainerRef.current) {
        const rect = graphContainerRef.current.getBoundingClientRect();
        setCursorPos({
          x: (e.clientX - rect.left - pan.x) / zoom,
          y: (e.clientY - rect.top - pan.y) / zoom
        });
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      setIsDraggingWindow(false);
      setIsResizingWindow(false);
      setIsPanning(false);
      setDraggingNodeId(null);

      const fromNodeId = connectingFromNodeIdRef.current;
      if (fromNodeId) {
        // Find which node element is under the cursor
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const nodeEl = el?.closest('[data-node-id]');
        const targetNodeId = nodeEl?.getAttribute('data-node-id');
        if (targetNodeId && targetNodeId !== fromNodeId) {
          const targetNode = sm.nodes.find(n => n.id === targetNodeId);
          if (targetNode) {
            addStateTransition({
              fromNodeId,
              toNodeId: targetNode.id,
              trigger: 'click',
              params: { targetType: 'canvas', layerId: 'canvas' },
              duration: 0.35,
              easing: 'easeInOut',
              name: `Vers ${targetNode.name}`
            });
          }
        }
        setConnectingFromNodeId(null);
      }
    };

    if (isDraggingWindow || isResizingWindow || isPanning || draggingNodeId || connectingFromNodeId) {
      window.addEventListener('mousemove', handleMouseMove, true);
      window.addEventListener('mouseup', handleMouseUp, true);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove, true);
        window.removeEventListener('mouseup', handleMouseUp, true);
      };
    }
  }, [isDraggingWindow, isResizingWindow, isPanning, draggingNodeId, connectingFromNodeId, zoom, pan, sm.nodes, addStateTransition]);

  // --- Graph Canvas Panning Logic ---
  const handleGraphCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget && (e.target as HTMLElement).tagName !== 'svg') {
      return;
    }
    // Deselect if clicking on empty canvas
    setSelectedGraphNode(null);
    setSelectedGraphTransition(null);

    setIsPanning(true);
    panStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panX: pan.x,
      panY: pan.y
    };
  };

  // --- Node MouseDown for Moving ---
  const handleNodeMouseDown = (e: React.MouseEvent, node: StateNode) => {
    e.stopPropagation();
    setSelectedGraphNode(node.id);
    setDraggingNodeId(node.id);
    nodeDragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      nodeX: node.x,
      nodeY: node.y
    };
  };

  // --- Output Port MouseDown to Start Cable ---
  const handlePortMouseDown = (e: React.MouseEvent, node: StateNode) => {
    e.stopPropagation();
    setConnectingFromNodeId(node.id);
    if (graphContainerRef.current) {
      const rect = graphContainerRef.current.getBoundingClientRect();
      setCursorPos({
        x: (e.clientX - rect.left - pan.x) / zoom,
        y: (e.clientY - rect.top - pan.y) / zoom
      });
    }
  };

  // --- Input Port or Node MouseUp to Finish Cable ---
  const handleFinishConnectionToNode = (targetNode: StateNode) => {
    if (connectingFromNodeId && connectingFromNodeId !== targetNode.id) {
      addStateTransition({
        fromNodeId: connectingFromNodeId,
        toNodeId: targetNode.id,
        trigger: 'click',
        params: { targetType: 'canvas', layerId: 'canvas' },
        duration: 0.35,
        easing: 'easeInOut',
        name: `Vers ${targetNode.name}`
      });
      setConnectingFromNodeId(null);
    }
  };

  const handlePortMouseUp = (e: React.MouseEvent, targetNode: StateNode) => {
    e.stopPropagation();
    handleFinishConnectionToNode(targetNode);
  };

  // Keyboard Delete / Backspace handler for selected nodes and transitions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl) {
        const tag = activeEl.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || (activeEl as HTMLElement).isContentEditable) {
          return;
        }
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (ui.selectedGraphTransitionId) {
          e.preventDefault();
          e.stopPropagation();
          deleteStateTransition(ui.selectedGraphTransitionId);
          setSelectedGraphTransition(null);
        } else if (ui.selectedGraphNodeId) {
          const node = sm.nodes.find(n => n.id === ui.selectedGraphNodeId);
          if (node && node.type !== 'entry') {
            e.preventDefault();
            e.stopPropagation();
            deleteStateNode(ui.selectedGraphNodeId);
            setSelectedGraphNode(null);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [ui.selectedGraphTransitionId, ui.selectedGraphNodeId, sm.nodes, deleteStateTransition, deleteStateNode, setSelectedGraphTransition, setSelectedGraphNode]);

  // Helper to compute node dimensions and anchor points
  const getNodeWidth = (node: StateNode) => (node.type === 'entry' ? 140 : 180);
  const getNodeHeight = (node: StateNode) => (node.type === 'entry' ? 70 : 96);

  const getNodeCenter = (node: StateNode) => ({
    x: node.x + getNodeWidth(node) / 2,
    y: node.y + getNodeHeight(node) / 2
  });

  const getNodeOutPort = (node: StateNode) => ({
    x: node.x + getNodeWidth(node),
    y: node.y + getNodeHeight(node) / 2
  });

  const getNodeInPort = (node: StateNode) => ({
    x: node.x,
    y: node.y + getNodeHeight(node) / 2
  });

  // Smart cable routing calculation preventing overlap and avoiding cutting across nodes
  const getSmartCableRouting = (
    fromNode: StateNode,
    toNode: StateNode,
    transitionId: string,
    allTransitions: StateTransition[]
  ) => {
    const w1 = getNodeWidth(fromNode);
    const h1 = getNodeHeight(fromNode);
    const w2 = getNodeWidth(toNode);
    const h2 = getNodeHeight(toNode);

    const cx1 = fromNode.x + w1 / 2;
    const cy1 = fromNode.y + h1 / 2;
    const cx2 = toNode.x + w2 / 2;
    const cy2 = toNode.y + h2 / 2;

    // Self-loop (A -> A)
    if (fromNode.id === toNode.id) {
      const p1 = { x: fromNode.x + w1 * 0.75, y: fromNode.y };
      const p2 = { x: fromNode.x + w1 * 0.25, y: fromNode.y };
      const cp1 = { x: fromNode.x + w1 * 0.85, y: fromNode.y - 50 };
      const cp2 = { x: fromNode.x + w1 * 0.15, y: fromNode.y - 50 };
      const path = `M ${p1.x} ${p1.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`;
      const midPoint = { x: fromNode.x + w1 * 0.5, y: fromNode.y - 42 };
      return { p1, p2, cp1, cp2, path, midPoint };
    }

    // Check for reverse transitions (B -> A) and sibling transitions (A -> B)
    const hasReverse = allTransitions.some(t => t.fromNodeId === toNode.id && t.toNodeId === fromNode.id);
    const siblings = allTransitions.filter(t => t.fromNodeId === fromNode.id && t.toNodeId === toNode.id);
    const sibIdx = siblings.findIndex(t => t.id === transitionId);
    const sibOffset = (sibIdx - (siblings.length - 1) / 2) * 26;

    const minTop = Math.min(fromNode.y, toNode.y);
    const maxBottom = Math.max(fromNode.y + h1, toNode.y + h2);

    let p1: { x: number; y: number };
    let p2: { x: number; y: number };
    let cp1: { x: number; y: number };
    let cp2: { x: number; y: number };

    // Reverse / Return direction: target is to the left of fromNode
    if (cx2 < cx1) {
      // Contour completely around the nodes (above or below) so cables NEVER pass over or behind node bodies!
      const routeAbove = cy2 < cy1 - 20;

      if (routeAbove) {
        // Arch cleanly above both nodes
        p1 = { x: fromNode.x + w1 * 0.4, y: fromNode.y };
        p2 = { x: toNode.x + w2 * 0.6, y: toNode.y };
        const archY = minTop - 55 - Math.abs(sibOffset);
        cp1 = { x: p1.x - 30, y: archY };
        cp2 = { x: p2.x + 30, y: archY };
      } else {
        // Arch cleanly below both nodes
        p1 = { x: fromNode.x + w1 * 0.4, y: fromNode.y + h1 };
        p2 = { x: toNode.x + w2 * 0.6, y: toNode.y + h2 };
        const archY = maxBottom + 55 + Math.abs(sibOffset);
        cp1 = { x: p1.x - 30, y: archY };
        cp2 = { x: p2.x + 30, y: archY };
      }
    } else {
      // Forward direction: target is to the right
      p1 = { x: fromNode.x + w1, y: cy1 };
      p2 = { x: toNode.x, y: cy2 };
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const cpDist = Math.max(40, Math.min(180, dist * 0.4));

      // If there is a reverse transition, curve forward transitions gracefully upward
      const curveOffset = hasReverse ? (-35 + sibOffset) : sibOffset;
      cp1 = { x: p1.x + cpDist, y: p1.y + curveOffset };
      cp2 = { x: p2.x - cpDist, y: p2.y + curveOffset };
    }

    const path = `M ${p1.x} ${p1.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`;

    // Exact mathematical midpoint on cubic bezier at t = 0.5
    const midX = 0.125 * p1.x + 0.375 * cp1.x + 0.375 * cp2.x + 0.125 * p2.x;
    const midY = 0.125 * p1.y + 0.375 * cp1.y + 0.375 * cp2.y + 0.125 * p2.y;

    return { p1, p2, cp1, cp2, path, midPoint: { x: midX, y: midY } };
  };

  // Dragging connection bezier path
  const getDragCablePath = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
    const isForward = p2.x >= p1.x;
    const dx = Math.max(35, Math.abs(p2.x - p1.x) * 0.4);
    if (isForward) {
      return `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}`;
    } else {
      return `M ${p1.x} ${p1.y} C ${p1.x - dx} ${p1.y}, ${p2.x + dx} ${p2.y}, ${p2.x} ${p2.y}`;
    }
  };

  // Label formatting for triggers
  const getTriggerLabel = (trigger: StateTransitionTrigger, params?: any) => {
    switch (trigger) {
      case 'click': return '⚡ Clic';
      case 'double_click': return '👆 2x Clic';
      case 'pointer_down': return '⬇️ Appui';
      case 'pointer_up': return '⬆️ Relâche';
      case 'hover_enter': return '🖱️ Hover In';
      case 'hover_leave': return '💨 Hover Out';
      case 'scroll_down': return '📜 Scroll Bas';
      case 'scroll_up': return '📜 Scroll Haut';
      case 'scroll_progress': return `🎯 Scroll ≥ ${Math.round((params?.scrollThreshold ?? 0.5) * 100)}%`;
      case 'scroll_scrub': return '🎚️ Scroll Scrub';
      case 'animation_end': return '⏱️ Fin Anim';
      case 'delay': return `⏳ ${params?.delaySeconds ?? 1}s`;
      case 'key_press': return `⌨️ ${params?.key || 'Touche'}`;
      default: return trigger;
    }
  };

  return (
    <div
      id="state-machine-floating-window"
      className="fixed z-50 flex flex-col rounded-2xl shadow-2xl border backdrop-blur-md overflow-hidden transition-[width,height] select-none"
      style={{
        left: isMaximized ? 16 : winPos.x,
        top: isMaximized ? 16 : winPos.y,
        width: isMaximized ? 'calc(100vw - 32px)' : winSize.width,
        height: isMaximized ? 'calc(100vh - 32px)' : winSize.height,
        backgroundColor: `${theme.bgPanel}F8`,
        borderColor: theme.border,
        boxShadow: '0 25px 60px -15px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.1)'
      }}
    >
      {/* ── HEADER BAR (Draggable) ── */}
      <div
        onMouseDown={handleWindowHeaderMouseDown}
        className="h-11 px-3.5 flex items-center justify-between border-b cursor-grab active:cursor-grabbing shrink-0"
        style={{
          backgroundColor: `${theme.bgToolbar}EE`,
          borderColor: theme.border,
          color: theme.textMain
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-bold">
            <Zap size={14} />
          </div>
          <span className="text-xs font-bold tracking-tight">Machine d'États & Graph Animator</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-black/5 dark:bg-white/10 opacity-75">
            {sm.nodes.length} nœuds · {sm.transitions.length} transitions
          </span>
        </div>

        {/* Quick Node Creation & Controls in Header */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => createPoseStateNodeFromCurrent(`Pose ${(sm.nodes.length + 1)}`)}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors"
            title="Capturer le dessin actuel comme un état statique (Snapshot 1 pose)"
          >
            <Camera size={12} />
            <span>+ Pose</span>
          </button>

          <button
            onClick={() => {
              const count = (project.animations?.length || 0) + 1;
              const newName = `Clip ${count}`;
              addAnimation(newName);
              setTimeout(() => {
                const latest = useStore.getState().project.animations?.slice(-1)[0];
                if (latest) {
                  createClipStateNode(latest.id);
                }
              }, 20);
            }}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 transition-colors"
            title="Créer un nouveau clip d'animation et l'ajouter au graphe"
          >
            <Film size={12} />
            <span>+ Nouveau Clip</span>
          </button>

          <div className="h-4 w-px bg-black/10 dark:bg-white/10 mx-1" />

          {/* Test / Play Mode Toggle */}
          <button
            onClick={() => setMode(ui.mode === 'play' ? 'edit' : 'play')}
            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors ${
              ui.mode === 'play'
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
            }`}
            title="Tester la machine d'état en direct dans le Canvas"
          >
            {ui.mode === 'play' ? <Pause size={12} /> : <Play size={12} />}
            <span>{ui.mode === 'play' ? 'Arrêter Test' : 'Tester'}</span>
          </button>

          {/* Maximize Toggle */}
          <button
            onClick={() => setGraphWindowMaximized(!isMaximized)}
            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 opacity-70 hover:opacity-100 transition-colors"
            title={isMaximized ? "Restaurer la taille" : "Agrandir"}
          >
            {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>

          {/* Close Window */}
          <button
            onClick={toggleInteractionsPanel}
            className="p-1.5 rounded-lg hover:bg-red-500/10 hover:text-red-500 opacity-70 hover:opacity-100 transition-colors"
            title="Fermer la fenêtre"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* ── MAIN WORKSPACE (Canvas + Side Inspector) ── */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* --- Nodal Canvas --- */}
        <div
          ref={graphContainerRef}
          onMouseDown={handleGraphCanvasMouseDown}
          className="flex-1 h-full relative overflow-hidden cursor-crosshair bg-repeat"
          style={{
            backgroundColor: theme.bgApp,
            backgroundImage: `radial-gradient(${theme.border} 1.2px, transparent 1.2px)`,
            backgroundSize: '24px 24px',
            backgroundPosition: `${pan.x}px ${pan.y}px`
          }}
        >
          {/* Instructions Overlay if few nodes */}
          {sm.nodes.length <= 2 && (
            <div className="absolute top-3 left-3 pointer-events-none z-10 bg-white/80 dark:bg-black/80 backdrop-blur-md px-3 py-2 rounded-xl border text-[11px] space-y-1 shadow-sm opacity-85">
              <div className="flex items-center gap-1.5 font-semibold text-indigo-500">
                <HelpCircle size={12} />
                <span>Astuce Rive / Animator :</span>
              </div>
              <p className="opacity-75">
                • Tirez un câble depuis la pastille droite ➔ vers un autre nœud pour créer une transition.
              </p>
              <p className="opacity-75">
                • Cliquez sur un câble ou un nœud pour régler le déclencheur (Clic, Hover, Scroll, etc.).
              </p>
            </div>
          )}

          {/* Play Mode Live Scroll Scrub Tester Banner */}
          {ui.mode === 'play' && (
            <div className="absolute bottom-3 left-3 right-3 z-30 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md p-2.5 rounded-xl border shadow-lg flex items-center gap-3">
              <span className="text-[11px] font-bold text-amber-500 flex items-center gap-1 whitespace-nowrap">
                <Sliders size={13} /> Simulateur de Scroll :
              </span>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round((ui.runtimeScrollProgress ?? 0) * 100)}
                onChange={(e) => setRuntimeScrollProgress(parseFloat(e.target.value) / 100)}
                className="flex-1 accent-indigo-500 cursor-pointer h-1.5"
              />
              <span className="text-[11px] font-mono font-semibold w-10 text-right opacity-80">
                {Math.round((ui.runtimeScrollProgress ?? 0) * 100)}%
              </span>
            </div>
          )}

          {/* SVG Canvas for Cables & Arrows (Placed behind nodes so cables never draw over nodes) */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0'
            }}
          >
            <defs>
              <marker
                id="cable-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#818CF8" />
              </marker>
              <marker
                id="cable-arrow-active"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#10B981" />
              </marker>
              <marker
                id="cable-arrow-selected"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#3B82F6" />
              </marker>
            </defs>

            {/* Transitions Cables */}
            {sm.transitions.map((trans) => {
              const fromNode = sm.nodes.find(n => n.id === trans.fromNodeId);
              const toNode = sm.nodes.find(n => n.id === trans.toNodeId);
              if (!fromNode || !toNode) return null;

              const { path, midPoint } = getSmartCableRouting(fromNode, toNode, trans.id, sm.transitions);
              const isSelected = ui.selectedGraphTransitionId === trans.id;
              const isActive = ui.mode === 'play' && activeNodeId === toNode.id;

              return (
                <g key={trans.id} className="pointer-events-auto cursor-pointer">
                  {/* Invisible hit area for reliable clicking */}
                  <path
                    d={path}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="20"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedGraphTransition(trans.id);
                    }}
                  />

                  {/* Main Cable Line (no transition-all to follow node instantly on drag) */}
                  <path
                    d={path}
                    fill="none"
                    stroke={isSelected ? '#3B82F6' : isActive ? '#10B981' : '#818CF8'}
                    strokeWidth={isSelected ? 3 : 2}
                    strokeDasharray={trans.trigger === 'scroll_scrub' ? '4 3' : undefined}
                    markerEnd={isSelected ? 'url(#cable-arrow-selected)' : isActive ? 'url(#cable-arrow-active)' : 'url(#cable-arrow)'}
                  />

                  {/* Trigger Badge Pill (Fixed transform to eliminate trembling on hover) */}
                  <g
                    transform={`translate(${midPoint.x}, ${midPoint.y})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedGraphTransition(trans.id);
                    }}
                    className="cursor-pointer group"
                  >
                    {/* Generous invisible padding hit-box */}
                    <rect
                      x="-44"
                      y="-14"
                      width="88"
                      height="28"
                      rx="14"
                      fill="transparent"
                    />
                    <rect
                      x="-38"
                      y="-11"
                      width="76"
                      height="22"
                      rx="11"
                      fill={isSelected ? '#3B82F6' : theme.bgPanel}
                      stroke={isSelected ? '#1D4ED8' : theme.border}
                      strokeWidth={isSelected ? '1.8' : '1.2'}
                      filter="drop-shadow(0 2px 4px rgba(0,0,0,0.12))"
                      className="transition-colors group-hover:stroke-indigo-500"
                    />
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize="9.5"
                      fontWeight="600"
                      fill={isSelected ? '#FFFFFF' : theme.textMain}
                      style={{ pointerEvents: 'none' }}
                    >
                      {getTriggerLabel(trans.trigger, trans.params)}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* Currently Dragged Connection Cable */}
            {connectingFromNodeId && (
              (() => {
                const srcNode = sm.nodes.find(n => n.id === connectingFromNodeId);
                if (!srcNode) return null;
                const p1 = getNodeOutPort(srcNode);
                return (
                  <path
                    d={getDragCablePath(p1, cursorPos)}
                    fill="none"
                    stroke="#6366F1"
                    strokeWidth="2.5"
                    strokeDasharray="5 3"
                    className="pointer-events-none animate-pulse"
                  />
                );
              })()
            )}
          </svg>

          {/* Nodes Layer (z-10 on top of cables) */}
          <div
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0'
            }}
          >
            {sm.nodes.map((node) => {
              const isSelected = ui.selectedGraphNodeId === node.id;
              const isActive = ui.mode === 'play' && activeNodeId === node.id;
              const isConnectingTarget = connectingFromNodeId && connectingFromNodeId !== node.id;
              const isEntry = node.type === 'entry';
              const isClip = node.type === 'clip';
              const isPose = node.type === 'pose';

              const width = getNodeWidth(node);
              const height = getNodeHeight(node);

              const accentColor = isEntry ? '#10B981' : isClip ? '#8B5CF6' : '#3B82F6';

              return (
                <div
                  key={node.id}
                  data-node-id={node.id}
                  onMouseDown={(e) => handleNodeMouseDown(e, node)}
                  onMouseUp={(e) => {
                    if (isConnectingTarget) {
                      e.stopPropagation();
                      handleFinishConnectionToNode(node);
                    }
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setActiveStateNode(node.id);
                  }}
                  className={`absolute pointer-events-auto rounded-xl border shadow-md transition-shadow cursor-grab active:cursor-grabbing ${
                    isSelected ? 'ring-2 ring-blue-500 shadow-xl' : ''
                  } ${isActive ? 'ring-2 ring-emerald-500 shadow-emerald-500/20' : ''} ${
                    isConnectingTarget ? 'ring-2 ring-indigo-500/90 shadow-indigo-500/20 shadow-lg cursor-pointer' : ''
                  }`}
                  style={{
                    left: node.x,
                    top: node.y,
                    width,
                    height,
                    backgroundColor: theme.bgPanel,
                    borderColor: isSelected ? '#3B82F6' : theme.border
                  }}
                  title="Double-clic pour activer cet état"
                >
                  {/* Node Header Pill */}
                  <div 
                    className="px-2.5 py-1.5 rounded-t-xl flex items-center justify-between text-[11px] font-bold text-white"
                    style={{ backgroundColor: accentColor }}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      {isEntry && <Zap size={11} />}
                      {isPose && <Camera size={11} />}
                      {isClip && <Film size={11} />}
                      <span className="truncate">{node.name}</span>
                    </div>

                    {isActive && (
                      <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                    )}
                  </div>

                  {/* Node Body Details */}
                  <div className="p-2 text-[10px] space-y-1 opacity-80">
                    {isEntry && (
                      <p className="opacity-70">État initial au chargement</p>
                    )}
                    {isPose && (
                      <div className="flex items-center justify-between">
                        <span>Snapshot 1 pose</span>
                        <span className="font-mono opacity-60">
                          {node.poseData?.layerStates?.reduce((acc, ls) => acc + (ls.strokes?.length || 0), 0) || 0} tracés
                        </span>
                      </div>
                    )}
                    {isClip && (
                      <div className="flex items-center justify-between">
                        <span>Clip Temporel</span>
                        <span className="font-mono text-purple-600 dark:text-purple-400 font-semibold">
                          {project.animations?.find(a => a.id === node.animationId)?.duration || 2.0}s
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Input Port (Left) - for all except entry */}
                  {!isEntry && (
                    <div
                      onMouseDown={(e) => {
                        if (!connectingFromNodeId) {
                          handleNodeMouseDown(e, node);
                        } else {
                          e.stopPropagation();
                        }
                      }}
                      onMouseUp={(e) => {
                        if (connectingFromNodeId) {
                          e.stopPropagation();
                          handleFinishConnectionToNode(node);
                        }
                      }}
                      className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 bg-white dark:bg-zinc-900 hover:scale-125 transition-transform cursor-pointer shadow-sm z-20 flex items-center justify-center"
                      style={{ borderColor: accentColor }}
                      title="Port d'entrée (déplacez le nœud, ou relâchez une transition)"
                    >
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accentColor }} />
                    </div>
                  )}

                  {/* Output Port (Right) */}
                  <div
                    onMouseDown={(e) => handlePortMouseDown(e, node)}
                    className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 bg-white dark:bg-zinc-900 hover:scale-125 transition-transform cursor-pointer shadow-sm z-20 flex items-center justify-center"
                    style={{ borderColor: accentColor }}
                    title="Tirer une transition vers un autre nœud"
                  >
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accentColor }} />
                  </div>
                </div>
              );
            })}
          </div>

        </div>

        {/* --- Side Inspector Panel (when Node or Transition is selected) --- */}
        {(selectedNode || selectedTransition) && (
          <div 
            className="w-72 border-l p-4 flex flex-col gap-4 overflow-y-auto shrink-0"
            style={{
              backgroundColor: `${theme.bgPanel}FD`,
              borderColor: theme.border,
              color: theme.textMain
            }}
          >
            {/* 1. Node Inspector */}
            {selectedNode && (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <span 
                      className="w-2.5 h-2.5 rounded-full" 
                      style={{ backgroundColor: selectedNode.type === 'entry' ? '#10B981' : selectedNode.type === 'clip' ? '#8B5CF6' : '#3B82F6' }}
                    />
                    <span>Inspecteur de Nœud</span>
                  </div>
                  {selectedNode.type !== 'entry' && (
                    <button
                      onClick={() => deleteStateNode(selectedNode.id)}
                      className="p-1 text-red-500 hover:bg-red-500/10 rounded transition-colors"
                      title="Supprimer ce nœud"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                {/* Node Name */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider opacity-60">Nom de l'état</label>
                  <input
                    type="text"
                    value={selectedNode.name}
                    onChange={(e) => updateStateNode(selectedNode.id, { name: e.target.value })}
                    className="w-full bg-transparent border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-indigo-500"
                    style={{ borderColor: theme.border }}
                  />
                </div>

                {/* Target Layer Scoping (Global or Specific Layer) */}
                {selectedNode.type !== 'entry' && (
                  <div className="space-y-1.5 pt-2 border-t" style={{ borderColor: theme.border }}>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                        Calque Ciblé
                      </label>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 font-mono opacity-60">
                        {selectedNode.targetLayerId && selectedNode.targetLayerId !== 'all' ? 'Ciblé' : 'Global'}
                      </span>
                    </div>

                    <select
                      value={selectedNode.targetLayerId || 'all'}
                      onChange={(e) => updateStateNode(selectedNode.id, { targetLayerId: e.target.value })}
                      className="w-full bg-transparent border rounded-lg px-2.5 py-1.5 text-xs outline-none cursor-pointer"
                      style={{ borderColor: theme.border, color: theme.textMain }}
                    >
                      <option value="all" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>
                        🌐 Tous les calques (Global)
                      </option>
                      {project.layers.filter(l => !l.id.includes('-sym-')).map(layer => (
                        <option key={layer.id} value={layer.id} style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>
                          🎨 Calque : {layer.name}
                        </option>
                      ))}
                    </select>

                    <p className="text-[9.5px] opacity-60 leading-tight">
                      {selectedNode.targetLayerId && selectedNode.targetLayerId !== 'all'
                        ? "Ce nœud pilote uniquement ce calque. Les autres calques continuent leur lecture timeline automatiquement."
                        : "Affecte tous les calques du projet."}
                    </p>
                  </div>
                )}

                {/* Pose Node Actions & Documentation */}
                {selectedNode.type === 'pose' && (
                  <div className="space-y-2.5 pt-2 border-t" style={{ borderColor: theme.border }}>
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-2.5 text-[10px] space-y-1">
                      <div className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <Camera size={12} />
                        <span>Pose Automatique (Hors-Timeline) :</span>
                      </div>
                      <p className="opacity-80 leading-relaxed">
                        Cette pose est <strong>synchronisée en temps réel</strong>. Dès que vous dessinez ou modifiez un tracé sur le canvas, il est automatiquement enregistré dans cette pose sans impacter la timeline.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 text-xs">
                        <span className="opacity-70 font-medium">Tracés enregistrés :</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {selectedNode.poseData?.layerStates?.reduce((acc, ls) => acc + (ls.strokes?.length || 0), 0) || 0} tracé(s)
                        </span>
                      </div>

                      <button
                        onClick={() => applyPoseStateNodeToCanvas(selectedNode.id)}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                        title="Réapplique les tracés de cette pose sur le canvas"
                      >
                        <Eye size={13} />
                        <span>👁️ Recharger sur le Canvas</span>
                      </button>
                    </div>

                    {/* Optional: Import from Matrix Keyframe */}
                    {project.keyframes && project.keyframes.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <label className="text-[9.5px] font-semibold opacity-60">
                          Ou importer depuis un Keyframe matrice :
                        </label>
                        <select
                          value={selectedNode.poseData?.keyframeId || ''}
                          onChange={(e) => {
                            const kfId = e.target.value;
                            const kf = project.keyframes.find(k => k.id === kfId);
                            if (kf) {
                              updateStateNode(selectedNode.id, {
                                poseData: {
                                  keyframeId: kf.id,
                                  layerStates: JSON.parse(JSON.stringify(kf.layerStates)),
                                  axisValues: kf.axisValues ? { ...kf.axisValues } : undefined
                                }
                              });
                            }
                          }}
                          className="w-full bg-transparent border rounded-lg px-2 py-1 text-xs outline-none"
                          style={{ borderColor: theme.border }}
                        >
                          <option value="">Sélectionner un keyframe...</option>
                          {project.keyframes.map(kf => (
                            <option key={kf.id} value={kf.id} style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>
                              {kf.name || `Keyframe (${Object.values(kf.axisValues || {}).map(v => Math.round(v * 100) + '%').join(', ')})`}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* Clip Node Settings */}
                {selectedNode.type === 'clip' && (
                  <div className="space-y-3 pt-2 border-t" style={{ borderColor: theme.border }}>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold uppercase tracking-wider opacity-60">Timeline Associée</label>
                      <button
                        onClick={() => {
                          const count = (project.animations?.length || 0) + 1;
                          const newAnimName = `Clip ${count}`;
                          addAnimation(newAnimName);
                          setTimeout(() => {
                            const latest = useStore.getState().project.animations?.slice(-1)[0];
                            if (latest) {
                              updateStateNode(selectedNode.id, { animationId: latest.id, name: latest.name });
                            }
                          }, 20);
                        }}
                        className="text-[10px] text-purple-500 hover:underline flex items-center gap-0.5"
                      >
                        <Plus size={10} /> Nouveau clip
                      </button>
                    </div>

                    <select
                      value={selectedNode.animationId || ''}
                      onChange={(e) => {
                        if (e.target.value === '__new__') {
                          const count = (project.animations?.length || 0) + 1;
                          const newAnimName = `Clip ${count}`;
                          addAnimation(newAnimName);
                          setTimeout(() => {
                            const latest = useStore.getState().project.animations?.slice(-1)[0];
                            if (latest) {
                              updateStateNode(selectedNode.id, { animationId: latest.id, name: latest.name });
                            }
                          }, 20);
                        } else {
                          updateStateNode(selectedNode.id, { animationId: e.target.value });
                        }
                      }}
                      className="w-full bg-transparent border rounded-lg px-2.5 py-1.5 text-xs outline-none cursor-pointer"
                      style={{ borderColor: theme.border }}
                    >
                      {(project.animations || []).map(anim => (
                        <option key={anim.id} value={anim.id} style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>
                          {anim.name} ({anim.duration}s)
                        </option>
                      ))}
                      <option value="__new__" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>
                        + Créer un nouveau clip...
                      </option>
                    </select>

                    {/* Renaming the associated clip animation */}
                    {selectedNode.animationId && (() => {
                      const associatedAnim = project.animations?.find(a => a.id === selectedNode.animationId);
                      if (!associatedAnim) return null;
                      return (
                        <div className="space-y-1 bg-black/5 dark:bg-white/5 p-2 rounded-lg">
                          <label className="text-[10px] font-semibold opacity-70 flex items-center gap-1">
                            <Pencil size={10} /> Renommer le clip timeline :
                          </label>
                          <input
                            type="text"
                            value={associatedAnim.name}
                            onChange={(e) => {
                              renameAnimation(associatedAnim.id, e.target.value);
                            }}
                            className="w-full bg-transparent border rounded px-2 py-1 text-xs outline-none"
                            style={{ borderColor: theme.border }}
                          />
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Set as Active for testing */}
                <button
                  onClick={() => setActiveStateNode(selectedNode.id)}
                  className="w-full py-1.5 px-3 rounded-lg text-xs font-semibold bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                >
                  Activer cet état
                </button>
              </div>
            )}

            {/* 2. Transition Inspector */}
            {selectedTransition && (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-indigo-500">
                    <ArrowRight size={13} />
                    <span>Inspecteur de Transition</span>
                  </div>
                  <button
                    onClick={() => deleteStateTransition(selectedTransition.id)}
                    className="p-1 text-red-500 hover:bg-red-500/10 rounded transition-colors"
                    title="Supprimer cette transition"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* Trigger Selector */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                    Déclencheur (Trigger)
                  </label>
                  <select
                    value={selectedTransition.trigger}
                    onChange={(e) => updateStateTransition(selectedTransition.id, { 
                      trigger: e.target.value as StateTransitionTrigger 
                    })}
                    className="w-full bg-transparent border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                    style={{ borderColor: theme.border, color: theme.textMain }}
                  >
                    <option value="click" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>⚡ Au Clic / Tap (On Click)</option>
                    <option value="double_click" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>👆 Double Clic</option>
                    <option value="pointer_down" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>⬇️ Appui Souris (Pointer Down)</option>
                    <option value="pointer_up" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>⬆️ Relâchement (Pointer Up)</option>
                    <option value="hover_enter" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>🖱️ Survol Entrant (Hover Enter)</option>
                    <option value="hover_leave" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>💨 Survol Sortant (Hover Leave)</option>
                    <option value="scroll_down" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>📜 Molette Bas (Scroll Down)</option>
                    <option value="scroll_up" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>📜 Molette Haut (Scroll Up)</option>
                    <option value="scroll_progress" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>🎯 Seuil de Scroll (Scroll Progress)</option>
                    <option value="scroll_scrub" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>🎚️ Pilotage continu (Scroll Scrub)</option>
                    <option value="animation_end" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>⏱️ Fin d'Animation (Animation End)</option>
                    <option value="delay" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>⏳ Délai Automatique (Timer)</option>
                    <option value="key_press" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>⌨️ Touche Clavier (Key Press)</option>
                  </select>
                </div>

                {/* Detection Target (for Click, Hover, Pointer events) */}
                {['click', 'double_click', 'pointer_down', 'pointer_up', 'hover_enter', 'hover_leave'].includes(selectedTransition.trigger) && (
                  <div className="space-y-2 pt-2 border-t" style={{ borderColor: theme.border }}>
                    <label className="text-[10px] font-bold uppercase tracking-wider opacity-60">Zone de Détection</label>

                    {/* 3-way Segmented Selector */}
                    <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-black/5 dark:bg-white/5 text-[10px] font-semibold">
                      <button
                        type="button"
                        onClick={() => updateStateTransition(selectedTransition.id, {
                          params: { ...selectedTransition.params, targetType: 'canvas', layerId: 'canvas' }
                        })}
                        className={`py-1 rounded text-center transition-colors ${
                          (!selectedTransition.params?.targetType || selectedTransition.params?.targetType === 'canvas')
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'opacity-70 hover:opacity-100'
                        }`}
                      >
                        Canvas
                      </button>
                      <button
                        type="button"
                        onClick={() => updateStateTransition(selectedTransition.id, {
                          params: { 
                            ...selectedTransition.params, 
                            targetType: 'layer', 
                            layerId: selectedTransition.params?.layerId === 'canvas' || !selectedTransition.params?.layerId 
                              ? (project.layers[0]?.id || 'canvas') 
                              : selectedTransition.params.layerId 
                          }
                        })}
                        className={`py-1 rounded text-center transition-colors ${
                          selectedTransition.params?.targetType === 'layer'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'opacity-70 hover:opacity-100'
                        }`}
                      >
                        Calque
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const currentCollider = selectedTransition.params?.collider || {
                            type: 'rect',
                            x: 350,
                            y: 250,
                            width: 140,
                            height: 90
                          };
                          updateStateTransition(selectedTransition.id, {
                            params: { 
                              ...selectedTransition.params, 
                              targetType: 'collider',
                              collider: currentCollider
                            }
                          });
                        }}
                        className={`py-1 rounded text-center transition-colors ${
                          selectedTransition.params?.targetType === 'collider'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'opacity-70 hover:opacity-100'
                        }`}
                      >
                        Collider
                      </button>
                    </div>

                    {/* Layer Selector */}
                    {selectedTransition.params?.targetType === 'layer' && (
                      <div className="space-y-1 mt-1">
                        <label className="text-[9px] font-bold uppercase tracking-wider opacity-60">Calque Cible</label>
                        <select
                          value={selectedTransition.params?.layerId || project.layers[0]?.id}
                          onChange={(e) => updateStateTransition(selectedTransition.id, {
                            params: { ...selectedTransition.params, layerId: e.target.value }
                          })}
                          className="w-full bg-transparent border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                          style={{ borderColor: theme.border, color: theme.textMain }}
                        >
                          {project.layers.map(l => (
                            <option key={l.id} value={l.id} style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>
                              {l.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Collider Box Controls */}
                    {selectedTransition.params?.targetType === 'collider' && (
                      <div className="space-y-2 p-2.5 rounded-xl border bg-black/5 dark:bg-white/5 mt-1" style={{ borderColor: theme.border }}>
                        <div className="flex items-center justify-between text-[10px] font-bold">
                          <span className="opacity-70 uppercase tracking-wider">Forme de la Zone</span>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                const col = selectedTransition.params?.collider;
                                updateStateTransition(selectedTransition.id, {
                                  params: {
                                    ...selectedTransition.params,
                                    collider: {
                                      type: 'rect',
                                      x: col?.x ?? 350,
                                      y: col?.y ?? 250,
                                      width: col?.width ?? 140,
                                      height: col?.height ?? 90
                                    }
                                  }
                                });
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                selectedTransition.params?.collider?.type !== 'circle' ? 'bg-indigo-600 text-white' : 'opacity-60'
                              }`}
                            >
                              Rectangle
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const col = selectedTransition.params?.collider;
                                updateStateTransition(selectedTransition.id, {
                                  params: {
                                    ...selectedTransition.params,
                                    collider: {
                                      type: 'circle',
                                      x: (col?.x ?? 350) + (col?.width ?? 140) / 2,
                                      y: (col?.y ?? 250) + (col?.height ?? 90) / 2,
                                      radius: Math.round(((col?.width ?? 140) + (col?.height ?? 90)) / 4)
                                    }
                                  }
                                });
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                selectedTransition.params?.collider?.type === 'circle' ? 'bg-indigo-600 text-white' : 'opacity-60'
                              }`}
                            >
                              Cercle
                            </button>
                          </div>
                        </div>

                        {/* Position & Size inputs */}
                        {selectedTransition.params?.collider?.type === 'circle' ? (
                          <div className="grid grid-cols-3 gap-1.5 text-xs">
                            <div>
                              <label className="text-[9px] opacity-60 uppercase block">X</label>
                              <input
                                type="number"
                                value={selectedTransition.params.collider.x ?? 400}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  updateStateTransition(selectedTransition.id, {
                                    params: {
                                      ...selectedTransition.params,
                                      collider: { ...selectedTransition.params?.collider, type: 'circle', x: val }
                                    }
                                  });
                                }}
                                className="w-full bg-transparent border rounded px-1.5 py-1 text-xs"
                                style={{ borderColor: theme.border }}
                              />
                            </div>
                            <div>
                              <label className="text-[9px] opacity-60 uppercase block">Y</label>
                              <input
                                type="number"
                                value={selectedTransition.params.collider.y ?? 300}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  updateStateTransition(selectedTransition.id, {
                                    params: {
                                      ...selectedTransition.params,
                                      collider: { ...selectedTransition.params?.collider, type: 'circle', y: val }
                                    }
                                  });
                                }}
                                className="w-full bg-transparent border rounded px-1.5 py-1 text-xs"
                                style={{ borderColor: theme.border }}
                              />
                            </div>
                            <div>
                              <label className="text-[9px] opacity-60 uppercase block">Rayon</label>
                              <input
                                type="number"
                                min="5"
                                value={selectedTransition.params.collider.radius ?? 50}
                                onChange={(e) => {
                                  const val = Math.max(5, parseFloat(e.target.value) || 50);
                                  updateStateTransition(selectedTransition.id, {
                                    params: {
                                      ...selectedTransition.params,
                                      collider: { ...selectedTransition.params?.collider, type: 'circle', radius: val }
                                    }
                                  });
                                }}
                                className="w-full bg-transparent border rounded px-1.5 py-1 text-xs"
                                style={{ borderColor: theme.border }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-4 gap-1.5 text-xs">
                            <div>
                              <label className="text-[9px] opacity-60 uppercase block">X</label>
                              <input
                                type="number"
                                value={selectedTransition.params?.collider?.x ?? 350}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  updateStateTransition(selectedTransition.id, {
                                    params: {
                                      ...selectedTransition.params,
                                      collider: { ...selectedTransition.params?.collider, type: 'rect', x: val }
                                    }
                                  });
                                }}
                                className="w-full bg-transparent border rounded px-1.5 py-1 text-xs"
                                style={{ borderColor: theme.border }}
                              />
                            </div>
                            <div>
                              <label className="text-[9px] opacity-60 uppercase block">Y</label>
                              <input
                                type="number"
                                value={selectedTransition.params?.collider?.y ?? 250}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  updateStateTransition(selectedTransition.id, {
                                    params: {
                                      ...selectedTransition.params,
                                      collider: { ...selectedTransition.params?.collider, type: 'rect', y: val }
                                    }
                                  });
                                }}
                                className="w-full bg-transparent border rounded px-1.5 py-1 text-xs"
                                style={{ borderColor: theme.border }}
                              />
                            </div>
                            <div>
                              <label className="text-[9px] opacity-60 uppercase block">Larg.</label>
                              <input
                                type="number"
                                min="10"
                                value={selectedTransition.params?.collider?.width ?? 140}
                                onChange={(e) => {
                                  const val = Math.max(10, parseFloat(e.target.value) || 100);
                                  updateStateTransition(selectedTransition.id, {
                                    params: {
                                      ...selectedTransition.params,
                                      collider: { ...selectedTransition.params?.collider, type: 'rect', width: val }
                                    }
                                  });
                                }}
                                className="w-full bg-transparent border rounded px-1.5 py-1 text-xs"
                                style={{ borderColor: theme.border }}
                              />
                            </div>
                            <div>
                              <label className="text-[9px] opacity-60 uppercase block">Haut.</label>
                              <input
                                type="number"
                                min="10"
                                value={selectedTransition.params?.collider?.height ?? 90}
                                onChange={(e) => {
                                  const val = Math.max(10, parseFloat(e.target.value) || 100);
                                  updateStateTransition(selectedTransition.id, {
                                    params: {
                                      ...selectedTransition.params,
                                      collider: { ...selectedTransition.params?.collider, type: 'rect', height: val }
                                    }
                                  });
                                }}
                                className="w-full bg-transparent border rounded px-1.5 py-1 text-xs"
                                style={{ borderColor: theme.border }}
                              />
                            </div>
                          </div>
                        )}

                        <p className="text-[9px] opacity-60 pt-0.5">
                          💡 En mode Édition, le cadre en pointillés est visible et déplaçable directement sur le canvas.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Scroll Threshold Slider */}
                {selectedTransition.trigger === 'scroll_progress' && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider opacity-60">
                      <span>Seuil de Déclenchement</span>
                      <span>{Math.round((selectedTransition.params?.scrollThreshold ?? 0.5) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round((selectedTransition.params?.scrollThreshold ?? 0.5) * 100)}
                      onChange={(e) => updateStateTransition(selectedTransition.id, {
                        params: { ...selectedTransition.params, scrollThreshold: parseFloat(e.target.value) / 100 }
                      })}
                      className="w-full accent-indigo-500 cursor-pointer h-1.5"
                    />
                  </div>
                )}

                {/* Timer Delay */}
                {selectedTransition.trigger === 'delay' && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider opacity-60">Délai (secondes)</label>
                    <input
                      type="number"
                      min="0"
                      max="60"
                      step="0.1"
                      value={selectedTransition.params?.delaySeconds ?? 1.0}
                      onChange={(e) => updateStateTransition(selectedTransition.id, {
                        params: { ...selectedTransition.params, delaySeconds: parseFloat(e.target.value) || 0 }
                      })}
                      className="w-full bg-transparent border rounded-lg px-2.5 py-1 text-xs outline-none"
                      style={{ borderColor: theme.border }}
                    />
                  </div>
                )}

                {/* Key Press Selector */}
                {selectedTransition.trigger === 'key_press' && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider opacity-60">Touche Clavier</label>
                    <input
                      type="text"
                      placeholder="ex: Space, ArrowRight, Enter"
                      value={selectedTransition.params?.key || ''}
                      onChange={(e) => updateStateTransition(selectedTransition.id, {
                        params: { ...selectedTransition.params, key: e.target.value }
                      })}
                      className="w-full bg-transparent border rounded-lg px-2.5 py-1 text-xs outline-none"
                      style={{ borderColor: theme.border }}
                    />
                  </div>
                )}

                {/* Transition Duration */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider opacity-60">
                    <span>Durée de transition</span>
                    <span>{selectedTransition.duration}s</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="3"
                    step="0.05"
                    value={selectedTransition.duration}
                    onChange={(e) => updateStateTransition(selectedTransition.id, { duration: parseFloat(e.target.value) })}
                    className="w-full accent-indigo-500 cursor-pointer h-1.5"
                  />
                </div>

                {/* Easing Selector */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider opacity-60">Courbe (Easing)</label>
                  <select
                    value={selectedTransition.easing}
                    onChange={(e) => updateStateTransition(selectedTransition.id, { easing: e.target.value as EasingType })}
                    className="w-full bg-transparent border rounded-lg px-2.5 py-1.5 text-xs outline-none"
                    style={{ borderColor: theme.border, color: theme.textMain }}
                  >
                    <option value="easeInOut" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>Ease In-Out</option>
                    <option value="easeOut" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>Ease Out</option>
                    <option value="easeIn" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>Ease In</option>
                    <option value="linear" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>Linear</option>
                    <option value="spring" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>Spring (Ressort)</option>
                    <option value="bounce" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>Bounce (Rebond)</option>
                  </select>
                </div>

              </div>
            )}
          </div>
        )}

      </div>

      {/* ── RESIZE HANDLE (Bottom-Right) ── */}
      {!isMaximized && (
        <div
          onMouseDown={handleResizeMouseDown}
          className="absolute bottom-1 right-1 w-4 h-4 cursor-se-resize flex items-end justify-end p-0.5 opacity-40 hover:opacity-100 transition-opacity z-40"
          title="Redimensionner la fenêtre"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <circle cx="8" cy="8" r="1.2" />
            <circle cx="4" cy="8" r="1.2" />
            <circle cx="8" cy="4" r="1.2" />
          </svg>
        </div>
      )}
    </div>
  );
};

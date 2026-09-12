import React, { useEffect } from 'react';
import { Toolbar } from './components/Toolbar';
import { Canvas } from './components/Canvas';
import { LayerPanel, SettingsPanel } from './components/Panels';
import { AxisMap } from './components/AxisMap';
import { DebugMenu } from './components/DebugMenu';
import { Timeline } from './components/Timeline';
import { InteractionsPanel } from './components/InteractionsPanel';
import { StateMachineGraph } from './components/StateMachineGraph';
import { GalleryModal } from './components/GalleryModal';
import { ShareModal } from './components/ShareModal';
import { useStore } from './store/useStore';

function App() {
  const { ui, setMode, toggleDebugMenu, toggleGallery, toggleShareModal, loadProject } = useStore();
  const { theme } = ui;

  // Handle URL deep linking (?view=gallery, #gallery, and ?project=<id>)
  useEffect(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const hash = window.location.hash;

      if (searchParams.get('view') === 'gallery' || hash === '#gallery') {
        toggleGallery(true);
      }

      const projectId = searchParams.get('project');
      if (projectId) {
        import('./services/firebase').then(({ fetchCreationById }) => {
          fetchCreationById(projectId).then(creation => {
            if (creation && creation.projectJson) {
              try {
                const parsed = JSON.parse(creation.projectJson);
                loadProject(parsed);
                setMode('play');
              } catch (e) {
                console.error('Failed to parse shared project from URL:', e);
              }
            }
          }).catch(err => {
            console.error('Error fetching project from URL param:', err);
          });
        });
      }
    } catch (e) {
      console.warn('URL parsing error:', e);
    }
  }, [toggleGallery, loadProject]);
  
  // Handle Keyboard shortcuts: 'h' for Debug Menu, Space for Play/Edit mode toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase() || '';
      const isInput = ['input', 'textarea', 'select'].includes(activeTag) || (document.activeElement as HTMLElement)?.isContentEditable;
      if (isInput) return;

      if (e.key.toLowerCase() === 'h') {
        toggleDebugMenu();
      }

      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        const currentMode = useStore.getState().ui.mode;
        setMode(currentMode === 'play' ? 'edit' : 'play');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleDebugMenu, setMode]);

  // IMMERSION: Hide AxisMap in Play Mode, but keep Panels accessible
  const isEditMode = ui.mode === 'edit';

  return (
    <div 
      className="w-screen h-screen overflow-hidden font-sans selection:bg-blue-200 relative"
      style={{ 
        backgroundColor: theme.bgApp,
        color: theme.textMain,
        // Inject CSS variables for other components to use
        ['--bg-app' as any]: theme.bgApp,
        ['--bg-toolbar' as any]: theme.bgToolbar,
        ['--bg-panel' as any]: theme.bgPanel,
        ['--accent' as any]: theme.accent,
        ['--text-main' as any]: theme.textMain,
        ['--text-muted' as any]: theme.textMuted,
        ['--border' as any]: theme.border,
        ['--hover-bg' as any]: theme.hoverBg,
        ['--active-bg' as any]: theme.activeBg,
        ['--canvas-bg' as any]: theme.canvasBg,
        ['--grid-color' as any]: theme.gridColor,
      }}
    >
      <Canvas />
      <Toolbar />
      
      {/* Panels are always available (via toggle) */}
      <LayerPanel />
      <SettingsPanel />

      {/* Mode Expert Panels */}
      {isEditMode && ui.expertModeEnabled && (
        <>
          <Timeline />
        </>
      )}

      {/* Floating State Machine Graph Window (available in Edit & Play Mode) */}
      {ui.isInteractionsOpen && <StateMachineGraph />}
      
      {/* Matrix is strictly for Editing, and hidden when Timeline is open */}
      {isEditMode && (!ui.expertModeEnabled || !ui.isTimelineOpen) && <AxisMap />}

      {/* Debug Menu */}
      <DebugMenu />

      {/* Community Gallery & Share Modals */}
      <GalleryModal 
        isOpen={ui.isGalleryOpen} 
        onClose={() => toggleGallery(false)} 
        onOpenShare={() => toggleShareModal(true)} 
      />
      <ShareModal 
        isOpen={ui.isShareOpen} 
        onClose={() => toggleShareModal(false)} 
        onOpenGallery={() => toggleGallery(true)} 
      />
      
      {/* Footer / Status Bar */}
      {isEditMode && (
          <div className="fixed bottom-4 right-6 z-40 pointer-events-none">
             <div 
               className="backdrop-blur rounded-full px-4 py-1 text-xs border shadow-sm"
               style={{ 
                 backgroundColor: `${theme.bgPanel}CC`,
                 borderColor: theme.border,
                 color: theme.textMuted
               }}
             >
               Prosopopus v2.9 • Pro Vector Engine
             </div>
          </div>
      )}
    </div>
  );
}

export default App;

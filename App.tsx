import React, { useEffect } from 'react';
import { Toolbar } from './components/Toolbar';
import { Canvas } from './components/Canvas';
import { LayerPanel, SettingsPanel } from './components/Panels';
import { AxisMap } from './components/AxisMap';
import { DebugMenu } from './components/DebugMenu';
import { useStore } from './store/useStore';

function App() {
  const { closeAllPanels, ui, toggleDebugMenu } = useStore();
  const { theme } = ui;
  
  // Handle 'h' key for Debug Menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'h' && !['input', 'textarea'].includes(document.activeElement?.tagName.toLowerCase() || '')) {
        toggleDebugMenu();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleDebugMenu]);

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
      onClick={closeAllPanels} // Global click listener
    >
      <Canvas />
      <Toolbar />
      
      {/* Panels are always available (via toggle) */}
      <LayerPanel />
      <SettingsPanel />
      
      {/* Matrix is strictly for Editing */}
      {isEditMode && <AxisMap />}

      {/* Debug Menu */}
      <DebugMenu />
      
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
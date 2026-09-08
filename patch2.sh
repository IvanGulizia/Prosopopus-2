sed -i '/let finalLayers = updatedLayers;/a \
    if (state.ui.isTimelineOpen \&\& layer?.driverMode !== '"'"'timeline'"'"') {\
      finalLayers = finalLayers.map(l => l.id === selectedLayerId ? { ...l, driverMode: '"'"'timeline'"'"' as LayerDriverMode } : l);\
    }' store/useStore.ts

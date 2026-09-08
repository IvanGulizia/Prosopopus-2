// components/InteractionsPanel.tsx
import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { Sparkles, MousePointer, Plus, Trash2, X, Play, ArrowRight, Zap, Layers, Target, Square, Circle } from 'lucide-react';
import { InteractionTrigger, InteractionActionType, EasingType, InteractionCollider, InteractionColliderType } from '../types';

export const InteractionsPanel: React.FC = () => {
  const {
    project,
    ui,
    addInteraction,
    updateInteraction,
    deleteInteraction,
    setInteractionCollider,
    setEditingColliderInteractionId,
    toggleInteractionsPanel
  } = useStore();

  const { theme, expertModeEnabled, isInteractionsOpen, selectedLayerId, editingColliderInteractionId } = ui;
  const [selectedTargetLayer, setSelectedTargetLayer] = useState<string>(selectedLayerId || 'canvas');

  if (!expertModeEnabled || !isInteractionsOpen) return null;

  const interactions = project.interactions || [];
  const layers = project.layers || [];
  const animations = project.animations || [];
  const keyframes = project.keyframes || [];

  const handleAddDefaultInteraction = () => {
    const targetLayer = selectedTargetLayer || selectedLayerId || 'canvas';
    const firstKf = keyframes[0];

    addInteraction(
      targetLayer,
      'click',
      {
        type: 'go_to_keyframe',
        targetKeyframeId: firstKf?.id || 'kf-origin',
        duration: 350,
        easing: 'easeInOut'
      },
      `On Click -> ${firstKf?.name || 'Pose'}`
    );
  };

  return (
    <div 
      className="fixed top-16 right-6 z-40 w-84 max-h-[85vh] flex flex-col rounded-2xl border shadow-2xl backdrop-blur-xl select-none overflow-hidden animate-in fade-in slide-in-from-right-4"
      style={{
        backgroundColor: `${theme.bgPanel}F5`,
        borderColor: theme.border,
        color: theme.textMain
      }}
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: theme.border }}
      >
        <div className="flex items-center gap-2">
          <Zap size={15} className="text-amber-500 fill-amber-500" />
          <h3 className="font-semibold text-xs tracking-wide uppercase">
            Interactions & Zones (Colliders)
          </h3>
        </div>
        <button
          onClick={toggleInteractionsPanel}
          className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Layer selector context */}
      <div 
        className="px-4 py-2.5 border-b flex items-center justify-between text-xs"
        style={{ borderColor: `${theme.border}60`, backgroundColor: `${theme.bgApp}40` }}
      >
        <div className="flex items-center gap-1.5 opacity-70">
          <Layers size={13} />
          <span>Élément cible :</span>
        </div>
        <select
          value={selectedTargetLayer}
          onChange={(e) => setSelectedTargetLayer(e.target.value)}
          className="bg-transparent border rounded-md px-2 py-0.5 text-xs font-medium outline-none"
          style={{ borderColor: theme.border, color: theme.textMain }}
        >
          <option value="canvas" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>
            Global (Canvas entier)
          </option>
          {layers.map(l => (
            <option key={l.id} value={l.id} style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>
              Calque: {l.name}
            </option>
          ))}
        </select>
      </div>

      {/* List of Interactions */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[58vh]">
        {interactions.length === 0 ? (
          <div className="text-center py-6 px-3 space-y-2 opacity-60">
            <MousePointer size={24} className="mx-auto text-muted-foreground opacity-50" />
            <p className="text-xs">
              Aucune interaction configurée.
            </p>
            <p className="text-[11px] opacity-75">
              Créez des règles interactives (ex: <em>On Hover sur une zone ➔ Sourire</em> ou <em>On Click ➔ Jouer Animation</em>).
            </p>
          </div>
        ) : (
          interactions.map((interaction, idx) => {
            const layer = layers.find(l => l.id === interaction.layerId);
            const isCanvas = interaction.layerId === 'canvas';
            const collider = interaction.collider || { type: (isCanvas ? 'canvas' : 'layer') };
            const isEditingThisCollider = editingColliderInteractionId === interaction.id;

            return (
              <div 
                key={interaction.id}
                className="p-3 rounded-xl border space-y-2.5 transition-all hover:shadow-md"
                style={{
                  backgroundColor: `${theme.bgApp}60`,
                  borderColor: isEditingThisCollider ? '#3B82F6' : theme.border
                }}
              >
                {/* Rule Title & Delete */}
                <div className="flex items-center justify-between text-xs font-semibold">
                  <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                    <Zap size={12} />
                    <span>Règle {idx + 1}</span>
                    <span className="text-[10px] font-normal opacity-70">
                      ({isCanvas ? 'Canvas' : layer?.name || 'Calque'})
                    </span>
                  </div>
                  <button
                    onClick={() => deleteInteraction(interaction.id)}
                    className="p-1 text-red-500 hover:bg-red-500/10 rounded transition-colors"
                    title="Supprimer"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                {/* Trigger Selector */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold tracking-wider opacity-60">
                    Déclencheur (Trigger)
                  </label>
                  <select
                    value={interaction.trigger}
                    onChange={(e) => updateInteraction(interaction.id, { trigger: e.target.value as InteractionTrigger })}
                    className="w-full bg-transparent border rounded-lg px-2.5 py-1 text-xs outline-none"
                    style={{ borderColor: theme.border, color: theme.textMain }}
                  >
                    <option value="click" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>
                      Au Clic / Tap (On Click)
                    </option>
                    <option value="hover_enter" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>
                      Au Survol (Pointer Enter)
                    </option>
                    <option value="hover_leave" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>
                      Quand la souris quitte (Pointer Leave)
                    </option>
                    <option value="animation_end" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>
                      À la fin de l'animation (On Animation End)
                    </option>
                  </select>
                </div>

                {/* Collider Zone Selector */}
                <div className="space-y-1 pt-1 border-t border-dashed" style={{ borderColor: `${theme.border}80` }}>
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase font-bold tracking-wider opacity-60 flex items-center gap-1">
                      <Target size={11} className="text-blue-500" />
                      Zone Détectée (Collider)
                    </label>
                    {(collider.type === 'rect' || collider.type === 'circle') && (
                      <button
                        onClick={() => setEditingColliderInteractionId(isEditingThisCollider ? null : interaction.id)}
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium border transition-colors ${
                          isEditingThisCollider 
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                            : 'text-blue-600 border-blue-200 hover:bg-blue-50 dark:hover:bg-blue-950/40'
                        }`}
                      >
                        {isEditingThisCollider ? '✓ Édition active' : '✎ Placer sur Canvas'}
                      </button>
                    )}
                  </div>

                  <select
                    value={collider.type}
                    onChange={(e) => {
                      const newType = e.target.value as InteractionColliderType;
                      let newCollider: InteractionCollider = { type: newType };
                      if (newType === 'rect') {
                        newCollider = { type: 'rect', x: 200, y: 200, width: 200, height: 150 };
                      } else if (newType === 'circle') {
                        newCollider = { type: 'circle', x: 300, y: 300, radius: 80 };
                      }
                      setInteractionCollider(interaction.id, newCollider);
                      if (newType === 'rect' || newType === 'circle') {
                        setEditingColliderInteractionId(interaction.id);
                      }
                    }}
                    className="w-full bg-transparent border rounded-lg px-2.5 py-1 text-xs outline-none"
                    style={{ borderColor: theme.border, color: theme.textMain }}
                  >
                    <option value="canvas" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>
                      Canvas Entier
                    </option>
                    <option value="layer" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>
                      Forme du Calque (Précis)
                    </option>
                    <option value="rect" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>
                      Zone Rectangulaire Personnalisée
                    </option>
                    <option value="circle" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>
                      Zone Circulaire Personnalisée
                    </option>
                  </select>

                  {/* Rectangle dimensions */}
                  {collider.type === 'rect' && (
                    <div className="grid grid-cols-4 gap-1 pt-1 text-[10px]">
                      <div>
                        <span className="opacity-50 block">X</span>
                        <input
                          type="number"
                          value={Math.round(collider.x || 0)}
                          onChange={(e) => setInteractionCollider(interaction.id, { ...collider, x: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-transparent border rounded px-1 py-0.5 text-center font-mono outline-none"
                          style={{ borderColor: theme.border }}
                        />
                      </div>
                      <div>
                        <span className="opacity-50 block">Y</span>
                        <input
                          type="number"
                          value={Math.round(collider.y || 0)}
                          onChange={(e) => setInteractionCollider(interaction.id, { ...collider, y: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-transparent border rounded px-1 py-0.5 text-center font-mono outline-none"
                          style={{ borderColor: theme.border }}
                        />
                      </div>
                      <div>
                        <span className="opacity-50 block">Largeur</span>
                        <input
                          type="number"
                          min="10"
                          value={Math.round(collider.width || 100)}
                          onChange={(e) => setInteractionCollider(interaction.id, { ...collider, width: parseFloat(e.target.value) || 10 })}
                          className="w-full bg-transparent border rounded px-1 py-0.5 text-center font-mono outline-none"
                          style={{ borderColor: theme.border }}
                        />
                      </div>
                      <div>
                        <span className="opacity-50 block">Hauteur</span>
                        <input
                          type="number"
                          min="10"
                          value={Math.round(collider.height || 100)}
                          onChange={(e) => setInteractionCollider(interaction.id, { ...collider, height: parseFloat(e.target.value) || 10 })}
                          className="w-full bg-transparent border rounded px-1 py-0.5 text-center font-mono outline-none"
                          style={{ borderColor: theme.border }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Circle dimensions */}
                  {collider.type === 'circle' && (
                    <div className="grid grid-cols-3 gap-1 pt-1 text-[10px]">
                      <div>
                        <span className="opacity-50 block">Centre X</span>
                        <input
                          type="number"
                          value={Math.round(collider.x || 0)}
                          onChange={(e) => setInteractionCollider(interaction.id, { ...collider, x: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-transparent border rounded px-1 py-0.5 text-center font-mono outline-none"
                          style={{ borderColor: theme.border }}
                        />
                      </div>
                      <div>
                        <span className="opacity-50 block">Centre Y</span>
                        <input
                          type="number"
                          value={Math.round(collider.y || 0)}
                          onChange={(e) => setInteractionCollider(interaction.id, { ...collider, y: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-transparent border rounded px-1 py-0.5 text-center font-mono outline-none"
                          style={{ borderColor: theme.border }}
                        />
                      </div>
                      <div>
                        <span className="opacity-50 block">Rayon (R)</span>
                        <input
                          type="number"
                          min="5"
                          value={Math.round(collider.radius || 50)}
                          onChange={(e) => setInteractionCollider(interaction.id, { ...collider, radius: parseFloat(e.target.value) || 5 })}
                          className="w-full bg-transparent border rounded px-1 py-0.5 text-center font-mono outline-none"
                          style={{ borderColor: theme.border }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Type Selector */}
                <div className="space-y-1 pt-1 border-t border-dashed" style={{ borderColor: `${theme.border}80` }}>
                  <label className="text-[10px] uppercase font-bold tracking-wider opacity-60">
                    Action (Transition)
                  </label>
                  <select
                    value={interaction.action.type}
                    onChange={(e) => {
                      const newType = e.target.value as InteractionActionType;
                      updateInteraction(interaction.id, {
                        action: {
                          ...interaction.action,
                          type: newType,
                          targetKeyframeId: newType === 'go_to_keyframe' ? keyframes[0]?.id : undefined,
                          targetAnimationId: newType === 'play_animation' ? animations[0]?.id : undefined
                        }
                      });
                    }}
                    className="w-full bg-transparent border rounded-lg px-2.5 py-1 text-xs font-medium outline-none"
                    style={{ borderColor: theme.border, color: theme.textMain }}
                  >
                    <option value="go_to_keyframe" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>
                      Transition vers une Pose (Keyframe)
                    </option>
                    <option value="play_animation" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>
                      Lancer une Animation Timeline
                    </option>
                  </select>
                </div>

                {/* Target Entity Selector */}
                {interaction.action.type === 'go_to_keyframe' && (
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold tracking-wider opacity-60">
                      Pose Cible
                    </label>
                    <select
                      value={interaction.action.targetKeyframeId || ''}
                      onChange={(e) => updateInteraction(interaction.id, {
                        action: { ...interaction.action, targetKeyframeId: e.target.value }
                      })}
                      className="w-full bg-transparent border rounded-lg px-2.5 py-1 text-xs outline-none"
                      style={{ borderColor: theme.border, color: theme.textMain }}
                    >
                      {keyframes.map(kf => (
                        <option key={kf.id} value={kf.id} style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>
                          {kf.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {interaction.action.type === 'play_animation' && (
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold tracking-wider opacity-60">
                      Animation Cible
                    </label>
                    <select
                      value={interaction.action.targetAnimationId || ''}
                      onChange={(e) => updateInteraction(interaction.id, {
                        action: { ...interaction.action, targetAnimationId: e.target.value }
                      })}
                      className="w-full bg-transparent border rounded-lg px-2.5 py-1 text-xs outline-none"
                      style={{ borderColor: theme.border, color: theme.textMain }}
                    >
                      {animations.map(a => (
                        <option key={a.id} value={a.id} style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>
                          {a.name} ({a.duration}s)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Duration & Easing for Smooth Transition */}
                {interaction.action.type === 'go_to_keyframe' && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="text-[10px] opacity-60 block">Durée (ms)</label>
                      <input
                        type="number"
                        min="50"
                        max="3000"
                        step="50"
                        value={interaction.action.duration || 350}
                        onChange={(e) => updateInteraction(interaction.id, {
                          action: { ...interaction.action, duration: parseInt(e.target.value) || 300 }
                        })}
                        className="w-full bg-transparent border rounded px-2 py-0.5 text-xs font-mono outline-none"
                        style={{ borderColor: theme.border, color: theme.textMain }}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] opacity-60 block">Courbe</label>
                      <select
                        value={interaction.action.easing || 'easeInOut'}
                        onChange={(e) => updateInteraction(interaction.id, {
                          action: { ...interaction.action, easing: e.target.value as EasingType }
                        })}
                        className="w-full bg-transparent border rounded px-1.5 py-0.5 text-xs outline-none"
                        style={{ borderColor: theme.border, color: theme.textMain }}
                      >
                        <option value="easeInOut" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>Ease In-Out</option>
                        <option value="easeOut" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>Ease Out</option>
                        <option value="spring" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>Ressort</option>
                        <option value="bounce" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>Rebond</option>
                        <option value="linear" style={{ backgroundColor: theme.bgPanel, color: theme.textMain }}>Linéaire</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer Add Button */}
      <div 
        className="p-3 border-t"
        style={{ borderColor: theme.border }}
      >
        <button
          onClick={handleAddDefaultInteraction}
          className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-md transition-all active:scale-98"
        >
          <Plus size={14} />
          <span>Ajouter une Interaction</span>
        </button>
      </div>
    </div>
  );
};


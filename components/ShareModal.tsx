// components/ShareModal.tsx
import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { publishCreation } from '../services/firebase';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenGallery: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, onOpenGallery }) => {
  const { project, ui } = useStore();
  const { theme } = ui;
  
  const [title, setTitle] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [thumbnail, setThumbnail] = useState<string>('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle(project.name || 'Mon Animation');
      const savedAuthor = localStorage.getItem('prosopopus_author_name') || '';
      setAuthorName(savedAuthor);
      setError(null);
      setSuccessId(null);

      // Capture canvas snapshot for thumbnail
      try {
        const canvas = document.querySelector('canvas');
        if (canvas) {
          // Create downscaled preview to fit safely in Firestore (max 150KB)
          const thumbCanvas = document.createElement('canvas');
          const maxDim = 320;
          const ratio = Math.min(maxDim / canvas.width, maxDim / canvas.height, 1);
          thumbCanvas.width = canvas.width * ratio;
          thumbCanvas.height = canvas.height * ratio;
          const ctx = thumbCanvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = theme.canvasBg || '#ffffff';
            ctx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
            ctx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
            setThumbnail(thumbCanvas.toDataURL('image/jpeg', 0.8));
          }
        }
      } catch (err) {
        console.warn('Unable to capture thumbnail', err);
      }
    }
  }, [isOpen, project.name, theme.canvasBg]);

  if (!isOpen) return null;

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Veuillez indiquer un titre pour votre création.');
      return;
    }

    setIsPublishing(true);
    setError(null);

    try {
      if (authorName.trim()) {
        localStorage.setItem('prosopopus_author_name', authorName.trim());
      }
      
      const id = await publishCreation(title, authorName, project, thumbnail);
      setSuccessId(id);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Une erreur est survenue lors de la publication.');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-md rounded-3xl shadow-2xl border p-6 pointer-events-auto transition-all"
        style={{ 
          backgroundColor: theme.bgPanel, 
          borderColor: theme.border, 
          color: theme.textMain 
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b" style={{ borderColor: theme.border }}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Partager dans la Galerie</h3>
              <p className="text-xs" style={{ color: theme.textMuted }}>Publiez votre animation pour la communauté</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 transition-colors"
            style={{ color: theme.textMuted }}
          >
            ✕
          </button>
        </div>

        {successId ? (
          <div className="py-6 text-center space-y-4">
            <div className="w-14 h-14 bg-green-500/10 text-green-600 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
              ✓
            </div>
            <div>
              <h4 className="font-bold text-lg">Animation publiée !</h4>
              <p className="text-xs mt-1" style={{ color: theme.textMuted }}>
                Votre création est désormais visible par tous dans la galerie communautaire.
              </p>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border hover:bg-black/5 transition-all"
                style={{ borderColor: theme.border }}
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenGallery();
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-md transition-all"
              >
                Voir la Galerie
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handlePublish} className="space-y-4">
            {/* Thumbnail Preview */}
            {thumbnail && (
              <div className="relative rounded-2xl overflow-hidden border aspect-video bg-gray-50 flex items-center justify-center" style={{ borderColor: theme.border }}>
                <img src={thumbnail} alt="Aperçu" className="w-full h-full object-contain" />
                <span className="absolute bottom-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-md bg-black/60 text-white backdrop-blur-sm">
                  Aperçu
                </span>
              </div>
            )}

            {/* Title */}
            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: theme.textMuted }}>
                Titre de l'animation *
              </label>
              <input 
                type="text" 
                maxLength={80}
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Mon Avatar Interactif"
                className="w-full px-3 py-2 text-sm rounded-xl border outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                style={{ backgroundColor: `${theme.bgApp}`, borderColor: theme.border, color: theme.textMain }}
              />
            </div>

            {/* Author */}
            <div>
              <label className="block text-xs font-bold mb-1" style={{ color: theme.textMuted }}>
                Votre pseudo / nom d'artiste
              </label>
              <input 
                type="text" 
                maxLength={40}
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="Ex: Alex"
                className="w-full px-3 py-2 text-sm rounded-xl border outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                style={{ backgroundColor: `${theme.bgApp}`, borderColor: theme.border, color: theme.textMain }}
              />
            </div>

            {error && (
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-xs font-medium">
                {error}
              </div>
            )}

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold border hover:bg-black/5 transition-all"
                style={{ borderColor: theme.border }}
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isPublishing}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 shadow-md flex items-center justify-center gap-2 transition-all"
              >
                {isPublishing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    <span>Publication...</span>
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                    <span>Partager Maintenant</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

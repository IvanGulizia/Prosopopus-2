// components/GalleryModal.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { 
  fetchCreations, 
  reportCreation, 
  deleteCreationWithPasscode,
  ADMIN_MASTER_PASSCODE,
  getMySavedCreations,
  CommunityCreation 
} from '../services/firebase';

interface GalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenShare: () => void;
}

export const GalleryModal: React.FC<GalleryModalProps> = ({ isOpen, onClose, onOpenShare }) => {
  const { ui, loadProject } = useStore();
  const { theme } = ui;

  const [creations, setCreations] = useState<CommunityCreation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  const [myCreationsMap, setMyCreationsMap] = useState<Record<string, string>>({});
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Admin session state (stored in sessionStorage)
  const [isAdminMode, setIsAdminMode] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('prosopopus_admin_mode') === 'true';
    } catch {
      return false;
    }
  });

  // Modals for password entry
  const [showAdminLoginModal, setShowAdminLoginModal] = useState(false);
  const [adminInputPassword, setAdminInputPassword] = useState('');
  const [adminLoginError, setAdminLoginError] = useState<string | null>(null);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<CommunityCreation | null>(null);
  const [deleteInputCode, setDeleteInputCode] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load reported IDs & local creations map
  useEffect(() => {
    try {
      const saved = localStorage.getItem('prosopopus_reported_ids');
      if (saved) {
        setReportedIds(new Set(JSON.parse(saved)));
      }
      setMyCreationsMap(getMySavedCreations());
    } catch (e) {
      console.warn(e);
    }
  }, [isOpen]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await fetchCreations(60);
      setCreations(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const filteredCreations = useMemo(() => {
    if (!searchTerm.trim()) return creations;
    const term = searchTerm.toLowerCase();
    return creations.filter(c => 
      c.title.toLowerCase().includes(term) || 
      c.authorName.toLowerCase().includes(term)
    );
  }, [creations, searchTerm]);

  const handleLoad = (creation: CommunityCreation) => {
    try {
      const parsed = JSON.parse(creation.projectJson);
      loadProject(parsed);
      onClose();
    } catch (err) {
      alert("Impossible de charger ce projet : données corrompues.");
    }
  };

  const handleReport = async (creationId: string) => {
    if (reportedIds.has(creationId)) return;
    if (!window.confirm("Voulez-vous vraiment signaler cette création aux modérateurs ?")) return;

    try {
      await reportCreation(creationId);
      const next = new Set(reportedIds).add(creationId);
      setReportedIds(next);
      localStorage.setItem('prosopopus_reported_ids', JSON.stringify(Array.from(next)));
      setActionMessage("Merci, le signalement a été pris en compte.");
      setTimeout(() => setActionMessage(null), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  // Open deletion modal or direct delete if already in Admin mode
  const initiateDelete = (creation: CommunityCreation) => {
    if (isAdminMode) {
      if (window.confirm(`Supprimer définitivement "${creation.title}" en mode Administrateur ?`)) {
        performDirectDelete(creation, ADMIN_MASTER_PASSCODE);
      }
      return;
    }

    setDeleteTarget(creation);
    setDeleteError(null);
    // Pre-fill passcode if created from this browser
    const myPass = myCreationsMap[creation.id] || '';
    setDeleteInputCode(myPass);
  };

  const performDirectDelete = async (creation: CommunityCreation, passcode: string) => {
    setIsDeleting(true);
    try {
      const res = await deleteCreationWithPasscode(creation, passcode);
      if (res.success) {
        setCreations(prev => prev.filter(c => c.id !== creation.id));
        setDeleteTarget(null);
        setActionMessage(res.message);
        setTimeout(() => setActionMessage(null), 3000);
      } else {
        setDeleteError(res.message);
      }
    } catch (e: any) {
      setDeleteError("Erreur lors de la suppression.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmDelete = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteTarget) return;
    performDirectDelete(deleteTarget, deleteInputCode);
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminInputPassword.trim() === ADMIN_MASTER_PASSCODE) {
      setIsAdminMode(true);
      try {
        sessionStorage.setItem('prosopopus_admin_mode', 'true');
      } catch {}
      setShowAdminLoginModal(false);
      setAdminInputPassword('');
      setAdminLoginError(null);
      setActionMessage("Mode Administrateur activé !");
      setTimeout(() => setActionMessage(null), 3000);
    } else {
      setAdminLoginError("Mot de passe incorrect.");
    }
  };

  const handleAdminLogout = () => {
    setIsAdminMode(false);
    try {
      sessionStorage.removeItem('prosopopus_admin_mode');
    } catch {}
    setActionMessage("Mode Administrateur désactivé.");
    setTimeout(() => setActionMessage(null), 3000);
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-4xl h-[85vh] rounded-3xl shadow-2xl border flex flex-col pointer-events-auto overflow-hidden relative"
        style={{ 
          backgroundColor: theme.bgPanel, 
          borderColor: theme.border, 
          color: theme.textMain 
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b flex flex-wrap gap-4 items-center justify-between" style={{ borderColor: theme.border }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center shadow-md">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            </div>
            <div>
              <h2 className="font-bold text-lg leading-tight">Galerie Communautaire</h2>
              <p className="text-xs" style={{ color: theme.textMuted }}>Explorez et essayez les animations partagées par les artistes</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                onOpenShare();
              }}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-all flex items-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span>Publier la mienne</span>
            </button>

            <button
              onClick={loadData}
              title="Actualiser"
              className="p-2 rounded-xl border hover:bg-black/5 transition-all"
              style={{ borderColor: theme.border, color: theme.textMuted }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
            </button>

            <button 
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 transition-colors"
              style={{ color: theme.textMuted }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Search & Moderation Bar */}
        <div className="px-5 py-3 border-b flex flex-wrap gap-3 items-center justify-between bg-black/[0.02]" style={{ borderColor: theme.border }}>
          <div className="flex-1 max-w-sm relative">
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher par titre ou auteur..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border outline-none focus:ring-2 focus:ring-blue-500/20"
              style={{ backgroundColor: theme.bgApp, borderColor: theme.border, color: theme.textMain }}
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-40 text-xs">🔍</span>
          </div>

          {/* Admin Mode Bar */}
          <div className="flex items-center gap-2 text-xs">
            {isAdminMode ? (
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-semibold text-xs">
                <span>🛡️ Mode Admin actif</span>
                <button 
                  onClick={handleAdminLogout} 
                  className="text-[10px] underline hover:opacity-80 ml-1"
                >
                  Quitter
                </button>
              </div>
            ) : (
              <button 
                onClick={() => {
                  setShowAdminLoginModal(true);
                  setAdminLoginError(null);
                }}
                className="opacity-70 hover:opacity-100 flex items-center gap-1.5 px-2.5 py-1 rounded-lg border hover:bg-black/5 transition-all text-xs"
                style={{ borderColor: theme.border }}
                title="Accès Administrateur par mot de passe"
              >
                <span>🔑</span>
                <span>Mode Admin</span>
              </button>
            )}
          </div>
        </div>

        {/* Feedback banner */}
        {actionMessage && (
          <div className="bg-blue-600 text-white text-xs py-1.5 px-4 text-center font-medium">
            {actionMessage}
          </div>
        )}

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-2">
              <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs" style={{ color: theme.textMuted }}>Chargement de la galerie...</p>
            </div>
          ) : filteredCreations.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xl">
                🎨
              </div>
              <div>
                <p className="font-bold text-sm">Aucune animation trouvée</p>
                <p className="text-xs mt-1" style={{ color: theme.textMuted }}>
                  Soyez le premier à partager une création avec la communauté !
                </p>
              </div>
              <button
                onClick={() => {
                  onClose();
                  onOpenShare();
                }}
                className="mt-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm"
              >
                Partager mon animation
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {filteredCreations.map((creation) => {
                const isReported = reportedIds.has(creation.id);
                const isMine = Boolean(myCreationsMap[creation.id]);

                return (
                  <div 
                    key={creation.id}
                    className="rounded-2xl border overflow-hidden flex flex-col transition-all hover:shadow-lg group relative"
                    style={{ backgroundColor: theme.bgApp, borderColor: theme.border }}
                  >
                    {/* Mine badge */}
                    {isMine && (
                      <span className="absolute top-2 left-2 z-10 text-[9px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white shadow-sm">
                        Mon animation
                      </span>
                    )}

                    {/* Thumbnail */}
                    <div className="aspect-video bg-gray-100 dark:bg-gray-800 relative overflow-hidden flex items-center justify-center border-b" style={{ borderColor: theme.border }}>
                      {creation.thumbnail ? (
                        <img 
                          src={creation.thumbnail} 
                          alt={creation.title} 
                          className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300" 
                        />
                      ) : (
                        <div className="text-gray-400 text-3xl font-bold opacity-30">
                          ✨
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3.5 flex-1 flex flex-col justify-between gap-3">
                      <div>
                        <h4 className="font-bold text-sm truncate" title={creation.title}>
                          {creation.title}
                        </h4>
                        <p className="text-xs truncate mt-0.5" style={{ color: theme.textMuted }}>
                          Par <span className="font-medium text-blue-500">{creation.authorName}</span>
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-between gap-2 pt-2 border-t" style={{ borderColor: theme.border }}>
                        <button
                          onClick={() => handleLoad(creation)}
                          className="flex-1 py-1.5 px-3 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-all flex items-center justify-center gap-1"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                          <span>Ouvrir</span>
                        </button>

                        <button
                          onClick={() => handleReport(creation.id)}
                          disabled={isReported}
                          title={isReported ? "Déjà signalé" : "Signaler aux modérateurs"}
                          className={`p-1.5 rounded-lg border text-xs transition-colors ${
                            isReported 
                              ? 'bg-red-500/10 text-red-500 border-red-500/20 cursor-default' 
                              : 'hover:bg-red-500/10 hover:text-red-600 text-gray-400 border-transparent hover:border-red-200'
                          }`}
                        >
                          🚩
                        </button>

                        {/* Delete button (for author or admin) */}
                        <button
                          onClick={() => initiateDelete(creation)}
                          title={
                            isAdminMode 
                              ? "Supprimer directement (Mode Admin)" 
                              : isMine 
                                ? "Supprimer mon animation" 
                                : "Supprimer (avec code PIN ou mot de passe Admin)"
                          }
                          className={`p-1.5 rounded-lg border text-xs transition-colors ${
                            isAdminMode
                              ? 'bg-red-600 text-white hover:bg-red-700 border-red-600 shadow-sm'
                              : isMine
                                ? 'bg-orange-500/10 text-orange-600 border-orange-500/20 hover:bg-red-500 hover:text-white'
                                : 'opacity-40 hover:opacity-100 hover:bg-red-500 hover:text-white border-transparent'
                          }`}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal: Admin Login */}
        {showAdminLoginModal && (
          <div className="absolute inset-0 z-20 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div 
              className="w-full max-w-sm p-5 rounded-2xl border shadow-xl flex flex-col gap-4"
              style={{ backgroundColor: theme.bgPanel, borderColor: theme.border }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🛡️</span>
                  <h3 className="font-bold text-sm">Activer le Mode Administrateur</h3>
                </div>
                <button 
                  onClick={() => setShowAdminLoginModal(false)}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs opacity-60 hover:opacity-100"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs" style={{ color: theme.textMuted }}>
                Entrez le mot de passe Administrateur pour débloquer la suppression directe de n'importe quelle animation.
              </p>

              <form onSubmit={handleAdminLogin} className="space-y-3">
                <input 
                  type="password"
                  required
                  autoFocus
                  value={adminInputPassword}
                  onChange={(e) => setAdminInputPassword(e.target.value)}
                  placeholder="Mot de passe admin..."
                  className="w-full px-3 py-2 text-xs rounded-xl border outline-none focus:ring-2 focus:ring-blue-500/20"
                  style={{ backgroundColor: theme.bgApp, borderColor: theme.border, color: theme.textMain }}
                />

                {adminLoginError && (
                  <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-[11px] font-medium">
                    {adminLoginError}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAdminLoginModal(false)}
                    className="px-3 py-1.5 text-xs rounded-lg border hover:bg-black/5"
                    style={{ borderColor: theme.border }}
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm"
                  >
                    Valider
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Delete Confirmation with PIN or Master Password */}
        {deleteTarget && (
          <div className="absolute inset-0 z-20 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div 
              className="w-full max-w-sm p-5 rounded-2xl border shadow-xl flex flex-col gap-4"
              style={{ backgroundColor: theme.bgPanel, borderColor: theme.border }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🗑️</span>
                  <h3 className="font-bold text-sm">Supprimer l'animation</h3>
                </div>
                <button 
                  onClick={() => setDeleteTarget(null)}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs opacity-60 hover:opacity-100"
                >
                  ✕
                </button>
              </div>

              <div>
                <p className="text-xs font-semibold">{deleteTarget.title}</p>
                <p className="text-[11px] mt-1" style={{ color: theme.textMuted }}>
                  Pour supprimer cette animation, entrez le code PIN défini lors de sa publication, ou le mot de passe Administrateur :
                </p>
              </div>

              <form onSubmit={handleConfirmDelete} className="space-y-3">
                <input 
                  type="text"
                  required
                  autoFocus
                  value={deleteInputCode}
                  onChange={(e) => setDeleteInputCode(e.target.value)}
                  placeholder="Code PIN ou mot de passe Admin..."
                  className="w-full px-3 py-2 text-xs rounded-xl border outline-none focus:ring-2 focus:ring-red-500/20 font-mono"
                  style={{ backgroundColor: theme.bgApp, borderColor: theme.border, color: theme.textMain }}
                />

                {deleteError && (
                  <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-[11px] font-medium">
                    {deleteError}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(null)}
                    className="px-3 py-1.5 text-xs rounded-lg border hover:bg-black/5"
                    style={{ borderColor: theme.border }}
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isDeleting || !deleteInputCode.trim()}
                    className="px-4 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm disabled:opacity-50"
                  >
                    {isDeleting ? "Suppression..." : "Confirmer la suppression"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

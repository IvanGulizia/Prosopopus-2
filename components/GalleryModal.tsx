// components/GalleryModal.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { 
  fetchCreations, 
  reportCreation, 
  deleteCreationWithPasscode,
  toggleLikeCreation,
  toggleFeaturedCreation,
  ADMIN_MASTER_PASSCODE,
  getMySavedCreations,
  CommunityCreation 
} from '../services/firebase';
import { InteractiveCardPreview } from './InteractiveCardPreview';
import { 
  Heart, 
  Sparkles, 
  Flame, 
  Clock, 
  Star, 
  User, 
  Share2, 
  Link as LinkIcon, 
  Check, 
  Trash2, 
  Flag, 
  ArrowUpRight, 
  Search, 
  Plus, 
  RotateCw, 
  Shield, 
  X,
  Copy
} from 'lucide-react';

interface GalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenShare: () => void;
}

type GalleryTab = 'all' | 'popular' | 'featured' | 'mine';

export const GalleryModal: React.FC<GalleryModalProps> = ({ isOpen, onClose, onOpenShare }) => {
  const { ui, loadProject, setMode } = useStore();
  const { theme } = ui;

  const [creations, setCreations] = useState<CommunityCreation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<GalleryTab>('all');
  
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [myCreationsMap, setMyCreationsMap] = useState<Record<string, string>>({});
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

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

  // URL Synchronization
  useEffect(() => {
    if (isOpen) {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.get('view') !== 'gallery') {
        window.history.pushState(null, '', '?view=gallery');
      }
    }
  }, [isOpen]);

  const handleClose = () => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('view') === 'gallery') {
      window.history.pushState(null, '', window.location.pathname);
    }
    onClose();
  };

  // Load local preferences (reported, liked, owned)
  useEffect(() => {
    try {
      const savedReports = localStorage.getItem('prosopopus_reported_ids');
      if (savedReports) setReportedIds(new Set(JSON.parse(savedReports)));

      const savedLikes = localStorage.getItem('prosopopus_liked_ids');
      if (savedLikes) setLikedIds(new Set(JSON.parse(savedLikes)));

      setMyCreationsMap(getMySavedCreations());
    } catch (e) {
      console.warn(e);
    }
  }, [isOpen]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await fetchCreations(120);
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

  // Tab counts
  const tabCounts = useMemo(() => {
    return {
      all: creations.length,
      popular: creations.filter(c => (c.likeCount || 0) > 0).length,
      featured: creations.filter(c => c.featured).length,
      mine: creations.filter(c => Boolean(myCreationsMap[c.id])).length,
    };
  }, [creations, myCreationsMap]);

  // Filter & Sort creations
  const processedCreations = useMemo(() => {
    let list = [...creations];

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(c => 
        c.title.toLowerCase().includes(term) || 
        c.authorName.toLowerCase().includes(term)
      );
    }

    // Tab filter & sort
    switch (activeTab) {
      case 'popular':
        list.sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0));
        break;
      case 'featured':
        list = list.filter(c => c.featured);
        break;
      case 'mine':
        list = list.filter(c => Boolean(myCreationsMap[c.id]));
        break;
      case 'all':
      default:
        // Featured first, then newest
        list.sort((a, b) => {
          if (a.featured && !b.featured) return -1;
          if (!a.featured && b.featured) return 1;
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return timeB - timeA;
        });
        break;
    }

    return list;
  }, [creations, searchTerm, activeTab, myCreationsMap]);

  // Handle direct copy URLs
  const copyGalleryUrl = () => {
    const url = `${window.location.origin}${window.location.pathname}?view=gallery`;
    navigator.clipboard.writeText(url);
    setCopiedLink('gallery');
    setActionMessage("Lien de la galerie copié dans le presse-papier !");
    setTimeout(() => {
      setCopiedLink(null);
      setActionMessage(null);
    }, 3000);
  };

  const copyCreationUrl = (creationId: string) => {
    const url = `${window.location.origin}${window.location.pathname}?project=${creationId}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(creationId);
    setActionMessage("Lien direct du projet copié !");
    setTimeout(() => {
      setCopiedLink(null);
      setActionMessage(null);
    }, 3000);
  };

  // Upvote / Like toggle
  const handleToggleLike = async (creationId: string) => {
    const isCurrentlyLiked = likedIds.has(creationId);
    const nextLiked = new Set(likedIds);

    if (isCurrentlyLiked) {
      nextLiked.delete(creationId);
    } else {
      nextLiked.add(creationId);
    }
    setLikedIds(nextLiked);
    localStorage.setItem('prosopopus_liked_ids', JSON.stringify(Array.from(nextLiked)));

    // Optimistic UI update
    setCreations(prev => prev.map(c => {
      if (c.id === creationId) {
        return {
          ...c,
          likeCount: Math.max(0, (c.likeCount || 0) + (isCurrentlyLiked ? -1 : 1))
        };
      }
      return c;
    }));

    try {
      await toggleLikeCreation(creationId, !isCurrentlyLiked);
    } catch (err) {
      console.error('Failed to toggle like:', err);
    }
  };

  // Toggle Featured (Admin only)
  const handleToggleFeatured = async (creation: CommunityCreation) => {
    if (!isAdminMode) return;
    const nextFeatured = !creation.featured;

    setCreations(prev => prev.map(c => {
      if (c.id === creation.id) {
        return { ...c, featured: nextFeatured };
      }
      return c;
    }));

    try {
      await toggleFeaturedCreation(creation.id, nextFeatured);
      setActionMessage(nextFeatured ? `"${creation.title}" est maintenant mis à la une !` : `"${creation.title}" retiré de la une.`);
      setTimeout(() => setActionMessage(null), 3000);
    } catch (err) {
      console.error('Failed to toggle featured:', err);
    }
  };

  const handleLoad = (creation: CommunityCreation) => {
    try {
      const parsed = JSON.parse(creation.projectJson);
      loadProject(parsed);
      setMode('play');
      handleClose();
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

  // Open deletion modal or direct delete if in Admin mode
  const initiateDelete = (creation: CommunityCreation) => {
    if (isAdminMode) {
      if (window.confirm(`Supprimer définitivement "${creation.title}" en mode Administrateur ?`)) {
        performDirectDelete(creation, ADMIN_MASTER_PASSCODE);
      }
      return;
    }

    setDeleteTarget(creation);
    setDeleteError(null);
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-xl animate-fade-in"
      onClick={handleClose}
    >
      <div 
        className="w-full max-w-7xl h-[92vh] rounded-[28px] shadow-2xl border flex flex-col pointer-events-auto overflow-hidden relative"
        style={{ 
          backgroundColor: theme.bgPanel, 
          borderColor: theme.border, 
          color: theme.textMain 
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top App Bar */}
        <div 
          className="px-6 py-4 border-b flex flex-wrap gap-4 items-center justify-between" 
          style={{ borderColor: theme.border }}
        >
          {/* Logo & Title */}
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-lg leading-tight tracking-tight">Galerie Communautaire</h2>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  Prosopopus Feed
                </span>
              </div>
              <p className="text-xs mt-0.5" style={{ color: theme.textMuted }}>
                Explorez, essayez et animez les créations de la communauté en direct
              </p>
            </div>
          </div>

          {/* Right Action Cluster */}
          <div className="flex items-center gap-2.5">
            {/* Share link to entire gallery */}
            <button
              onClick={copyGalleryUrl}
              className="px-3 py-2 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-all hover:bg-black/5 dark:hover:bg-white/5"
              style={{ borderColor: theme.border }}
              title="Copier le lien direct vers cette galerie"
            >
              {copiedLink === 'gallery' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">Lien copié</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5 opacity-70" />
                  <span>Partager la galerie</span>
                </>
              )}
            </button>

            {/* Publish button */}
            <button
              onClick={() => {
                handleClose();
                onOpenShare();
              }}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 shadow-md shadow-blue-600/20 transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Publier la mienne</span>
            </button>

            {/* Refresh */}
            <button
              onClick={loadData}
              title="Actualiser les créations"
              className="p-2 rounded-xl border hover:bg-black/5 dark:hover:bg-white/5 transition-all"
              style={{ borderColor: theme.border, color: theme.textMuted }}
            >
              <RotateCw className="w-4 h-4" />
            </button>

            {/* Close */}
            <button 
              onClick={handleClose}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/10 dark:hover:bg-white/10 transition-colors ml-1"
              style={{ color: theme.textMuted }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Navigation & Search Bar */}
        <div 
          className="px-6 py-3 border-b flex flex-wrap gap-4 items-center justify-between bg-black/[0.02] dark:bg-white/[0.02]" 
          style={{ borderColor: theme.border }}
        >
          {/* Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'all'
                  ? 'bg-white dark:bg-neutral-800 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'opacity-70 hover:opacity-100'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Récents</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/10 dark:bg-white/10 opacity-75">
                {tabCounts.all}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('popular')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'popular'
                  ? 'bg-white dark:bg-neutral-800 text-rose-600 dark:text-rose-400 shadow-sm'
                  : 'opacity-70 hover:opacity-100'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Populaires</span>
              {tabCounts.popular > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/10 dark:bg-white/10 opacity-75">
                  {tabCounts.popular}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('featured')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'featured'
                  ? 'bg-white dark:bg-neutral-800 text-amber-600 dark:text-amber-400 shadow-sm'
                  : 'opacity-70 hover:opacity-100'
              }`}
            >
              <Star className="w-3.5 h-3.5 fill-current" />
              <span>À la une</span>
              {tabCounts.featured > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold">
                  {tabCounts.featured}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('mine')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'mine'
                  ? 'bg-white dark:bg-neutral-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'opacity-70 hover:opacity-100'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Mes créations</span>
              {tabCounts.mine > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/10 dark:bg-white/10 opacity-75">
                  {tabCounts.mine}
                </span>
              )}
            </button>
          </div>

          {/* Search input & Admin trigger */}
          <div className="flex items-center gap-3 flex-1 justify-end max-w-md">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-40 pointer-events-none" />
              <input 
                type="text" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher animation ou auteur..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border outline-none transition-all focus:ring-2 focus:ring-blue-500/20"
                style={{ backgroundColor: theme.bgApp, borderColor: theme.border, color: theme.textMain }}
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Admin trigger */}
            {isAdminMode ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-semibold text-xs whitespace-nowrap">
                <Shield className="w-3.5 h-3.5" />
                <span>Admin Actif</span>
                <button 
                  onClick={handleAdminLogout} 
                  className="text-[10px] underline hover:opacity-80 ml-1 opacity-70"
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
                className="opacity-70 hover:opacity-100 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border hover:bg-black/5 dark:hover:bg-white/5 transition-all text-xs whitespace-nowrap"
                style={{ borderColor: theme.border }}
                title="Accès Administrateur pour modération et sélection 'À la une'"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Mode Admin</span>
              </button>
            )}
          </div>
        </div>

        {/* Global Feedback notification */}
        {actionMessage && (
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs py-2 px-5 text-center font-medium shadow-md animate-fade-in flex items-center justify-center gap-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{actionMessage}</span>
          </div>
        )}

        {/* Scrollable Gallery Bento / Masonry Feed */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          {isLoading ? (
            <div className="h-80 flex flex-col items-center justify-center gap-3">
              <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs tracking-wide font-medium" style={{ color: theme.textMuted }}>
                Chargement des créations communautaires...
              </p>
            </div>
          ) : processedCreations.length === 0 ? (
            <div className="h-80 flex flex-col items-center justify-center gap-3 text-center max-w-sm mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-2xl shadow-inner">
                🎨
              </div>
              <div>
                <p className="font-bold text-sm">Aucune animation dans cette section</p>
                <p className="text-xs mt-1" style={{ color: theme.textMuted }}>
                  {searchTerm 
                    ? "Essayez d'autres mots-clés de recherche."
                    : activeTab === 'mine'
                      ? "Vous n'avez pas encore partagé d'animation depuis ce navigateur."
                      : activeTab === 'featured'
                        ? "Aucune animation n'a encore été marquée 'À la une'."
                        : "Soyez le premier à partager une création avec la communauté !"}
                </p>
              </div>
              <button
                onClick={() => {
                  handleClose();
                  onOpenShare();
                }}
                className="mt-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-600/20"
              >
                Partager mon animation
              </button>
            </div>
          ) : (
            /* Adaptive Masonry Columns Grid */
            <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-6 [column-fill:_balance]">
              {processedCreations.map((creation) => {
                const isReported = reportedIds.has(creation.id);
                const isLiked = likedIds.has(creation.id);
                const isMine = Boolean(myCreationsMap[creation.id]);
                const isCopied = copiedLink === creation.id;

                return (
                  <div 
                    key={creation.id}
                    className={`break-inside-avoid mb-6 rounded-2xl border flex flex-col group relative overflow-hidden ${
                      creation.featured 
                        ? 'ring-2 ring-amber-400/40 border-amber-400/30' 
                        : ''
                    }`}
                    style={{ 
                      backgroundColor: theme.bgApp, 
                      borderColor: creation.featured ? undefined : theme.border 
                    }}
                  >
                    {/* Interactive Live Preview Area */}
                    <div className="p-2 pb-0">
                      <InteractiveCardPreview
                        projectJson={creation.projectJson}
                        thumbnail={creation.thumbnail}
                        title={creation.title}
                        aspectRatio={creation.aspectRatio}
                        theme={theme}
                        canvasBg={theme.canvasBg}
                      />
                    </div>

                    {/* Minimalist Card Bottom Bar */}
                    <div className="p-3.5 flex flex-col gap-2.5">
                      {/* Title & Author */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 
                              className="font-bold text-sm tracking-tight truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" 
                            >
                              {creation.title}
                            </h4>
                            {creation.featured && (
                              <span className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-amber-500 text-white shadow-xs">
                                <Star className="w-2.5 h-2.5 fill-current" />
                                <span>À la une</span>
                              </span>
                            )}
                            {isMine && (
                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-blue-600 text-white shadow-xs">
                                Mienne
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] truncate flex items-center gap-1 mt-0.5" style={{ color: theme.textMuted }}>
                            <span>par</span>
                            <span className="font-semibold opacity-90">{creation.authorName}</span>
                          </p>
                        </div>

                        {/* Direct Upvote Heart Button */}
                        <button
                          type="button"
                          onClick={() => handleToggleLike(creation.id)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all active:scale-90 ${
                            isLiked
                              ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
                              : 'border-transparent hover:bg-black/5 dark:hover:bg-white/5 opacity-70 hover:opacity-100'
                          }`}
                          title={isLiked ? "Retirer mon vote" : "Voter pour cette animation"}
                        >
                          <Heart className={`w-3.5 h-3.5 transition-transform ${isLiked ? 'fill-current text-rose-500 scale-110' : ''}`} />
                          <span className="tabular-nums font-mono text-[11px]">{creation.likeCount || 0}</span>
                        </button>
                      </div>

                      {/* Action Cluster */}
                      <div className="flex items-center justify-between gap-1.5 pt-2 border-t" style={{ borderColor: theme.border }}>
                        {/* Open in Editor Button */}
                        <button
                          onClick={() => handleLoad(creation)}
                          className="flex-1 py-1.5 px-3 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 shadow-sm transition-all flex items-center justify-center gap-1.5"
                          title="Charger et modifier dans Prosopopus"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>Ouvrir</span>
                        </button>

                        {/* Copy Direct URL */}
                        <button
                          onClick={() => copyCreationUrl(creation.id)}
                          title="Copier le lien direct vers cette animation"
                          className="p-1.5 rounded-xl border hover:bg-black/5 dark:hover:bg-white/5 transition-all text-xs"
                          style={{ borderColor: theme.border }}
                        >
                          {isCopied ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <LinkIcon className="w-3.5 h-3.5 opacity-60 hover:opacity-100" />
                          )}
                        </button>

                        {/* Admin: Toggle Featured Button */}
                        {isAdminMode && (
                          <button
                            onClick={() => handleToggleFeatured(creation)}
                            title={creation.featured ? "Retirer de la sélection 'À la une'" : "Mettre à la une (Featured)"}
                            className={`p-1.5 rounded-xl border text-xs transition-all ${
                              creation.featured
                                ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                                : 'hover:bg-amber-500/10 text-amber-500 border-amber-500/30'
                            }`}
                          >
                            <Star className={`w-3.5 h-3.5 ${creation.featured ? 'fill-current' : ''}`} />
                          </button>
                        )}

                        {/* Report flag */}
                        <button
                          onClick={() => handleReport(creation.id)}
                          disabled={isReported}
                          title={isReported ? "Déjà signalé" : "Signaler aux modérateurs"}
                          className={`p-1.5 rounded-xl border text-xs transition-colors ${
                            isReported 
                              ? 'bg-red-500/10 text-red-500 border-red-500/20 cursor-default' 
                              : 'hover:bg-red-500/10 hover:text-red-600 text-gray-400 border-transparent hover:border-red-200'
                          }`}
                        >
                          <Flag className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete button (Author or Admin) */}
                        <button
                          onClick={() => initiateDelete(creation)}
                          title={
                            isAdminMode 
                              ? "Supprimer directement (Mode Admin)" 
                              : isMine 
                                ? "Supprimer mon animation" 
                                : "Supprimer (avec code PIN ou mot de passe Admin)"
                          }
                          className={`p-1.5 rounded-xl border text-xs transition-all ${
                            isAdminMode
                              ? 'bg-red-600 text-white hover:bg-red-700 border-red-600 shadow-sm'
                              : isMine
                                ? 'bg-orange-500/10 text-orange-600 border-orange-500/20 hover:bg-red-500 hover:text-white'
                                : 'opacity-30 hover:opacity-100 hover:bg-red-500 hover:text-white border-transparent'
                          }`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
          <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
            <div 
              className="w-full max-w-sm p-6 rounded-2xl border shadow-2xl flex flex-col gap-4"
              style={{ backgroundColor: theme.bgPanel, borderColor: theme.border }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                    <Shield className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-sm">Mode Administrateur</h3>
                </div>
                <button 
                  onClick={() => setShowAdminLoginModal(false)}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs opacity-60 hover:opacity-100"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs leading-relaxed" style={{ color: theme.textMuted }}>
                Entrez le mot de passe Administrateur pour débloquer la modération directe et marquer les animations <strong>À la une (Featured)</strong>.
              </p>

              <form onSubmit={handleAdminLogin} className="space-y-3">
                <input 
                  type="password"
                  required
                  autoFocus
                  value={adminInputPassword}
                  onChange={(e) => setAdminInputPassword(e.target.value)}
                  placeholder="Mot de passe admin..."
                  className="w-full px-3.5 py-2 text-xs rounded-xl border outline-none focus:ring-2 focus:ring-blue-500/20"
                  style={{ backgroundColor: theme.bgApp, borderColor: theme.border, color: theme.textMain }}
                />

                {adminLoginError && (
                  <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-[11px] font-medium">
                    {adminLoginError}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAdminLoginModal(false)}
                    className="px-3.5 py-1.5 text-xs rounded-xl border hover:bg-black/5 dark:hover:bg-white/5"
                    style={{ borderColor: theme.border }}
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm"
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
          <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
            <div 
              className="w-full max-w-sm p-6 rounded-2xl border shadow-2xl flex flex-col gap-4"
              style={{ backgroundColor: theme.bgPanel, borderColor: theme.border }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-red-500/10 text-red-600 flex items-center justify-center">
                    <Trash2 className="w-4 h-4" />
                  </div>
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
                <p className="text-[11px] mt-1 leading-relaxed" style={{ color: theme.textMuted }}>
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
                  className="w-full px-3.5 py-2 text-xs rounded-xl border outline-none focus:ring-2 focus:ring-red-500/20 font-mono"
                  style={{ backgroundColor: theme.bgApp, borderColor: theme.border, color: theme.textMain }}
                />

                {deleteError && (
                  <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-[11px] font-medium">
                    {deleteError}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(null)}
                    className="px-3.5 py-1.5 text-xs rounded-xl border hover:bg-black/5 dark:hover:bg-white/5"
                    style={{ borderColor: theme.border }}
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isDeleting || !deleteInputCode.trim()}
                    className="px-4 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm disabled:opacity-50"
                  >
                    {isDeleting ? "Suppression..." : "Confirmer"}
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

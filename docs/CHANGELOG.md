# Changelog

## [2.6.1] - Synchronisation Précise des Slots en Mode Comp & Interpolation Multi-Formes

### Fixed
- **Synchronisation Stricte des Slots Multi-États** :
  - Chaque sous-calque (tracé libre ou forme géométrique) dispose désormais d'un slot unique et persistant garanti sur l'ensemble des états/keyframes.
  - Lorsqu'une nouvelle forme (rectangle, ellipse, polygone) ou un tracé libre est ajouté dans un état (ex. État B), un slot vide (`points: []`) est automatiquement propagé dans les autres états (ex. État A), sans écraser ni décaler les slots existants.
  - Résolution du problème d'interpolation croisée involontaire (ex. un tracé se métamorphosant avec un rectangle au lieu de son tracé correspondant).
  - Préservation intégrale de la liste ordonnée des sous-calques entre les états (`Tracé 1`, `Tracé 2`, `Rectangle 1`, `Tracé 3`).
- **Rendu Canvas Nettoyé** :
  - Les slots vides (`points: []`) ne produisent aucun résidu graphique et ne participent pas à l'interpolation tant qu'ils ne sont pas dessinés sur l'état actif.
- **Ajout Explicite de Sous-Calque** :
  - Ajout de l'action `addCompSlot` et du bouton "+ Nouveau sous-calque" dans le panneau des calques pour pré-créer un sous-calque synchronisé vide avant le dessin.

## [2.6.0] - Calques Composites (Comp) & Gestionnaire de Sous-Calques Rétractables

### Added
- **Nouveau Type de Calque Composite (`comp`)** :
  - Permet d'accumuler plusieurs traits, formes et polylignes au sein d'un même calque sans que les nouveaux tracés n'écrasent les précédents (contrairement au calque matrice classique qui isole un tracé unique).
  - Chaque tracé ou forme possède son propre identifiant persistant, son index ordonné et son nom éditable.
  - Basculement direct du type de calque via le badge du panneau des calques : `MTX` (Matrice classique), `COMP` (Composite multi-tracés), `REP` (Repère statique).
  - Bouton rapide `+ COMP` dans l'en-tête du panneau des calques pour instancier un calque composite en un clic.
- **Sous-Calques Rétractables dans le Panneau des Calques** :
  - Volet déroulant accordéon avec flèche chevron, **rétracté et fermé par défaut** pour préserver la clarté visuelle.
  - Index séquentiels clairs (`#1`, `#2`, ...) et nom du sous-calque modifiable en ligne par double-clic.
  - Icône œil pour masquer ou afficher individuellement chaque sous-calque/tracé (`toggleStrokeVisibility`).
  - Bouton de suppression individuelle (`deleteStrokeFromLayer`).
  - Indicateur d'état dynamique (`non posé`) signalant les tracés déclarés dans un état mais pas encore dessinés sur l'état en cours.
  - Sélection directe en un clic sur le sous-calque pour l'activer sur le canevas et lui assigner sa pose sur l'état courant.
- **Moteur de Rendu Multi-Tracés Interpolé (`Canvas.tsx`)** :
  - Interpolation vectorielle simultanée de l'ensemble des sous-tracés visibles d'un calque `comp` entre les états de la matrice spatiale ou temporelle.
  - Respect strict de la visibilité des sous-tracés au rendu et lors des tests de sélection / pointage.

## [2.5.0] - Galerie Communautaire 2.0 : Préviews Interactives, Bento Box, Likes, Featured & URL Dédiée

### Added
- **Design Grand Format & Bento Box Masonry** :
  - Fenêtre élargie immersive (`max-w-7xl`, `92vh`) avec disposition adaptative en colonnes Masonry (Pinterest/Dribbble style) adaptée aux formats de chaque création (16:9, carré, vertical).
  - Éléments "À la une" (Featured) mis en valeur avec contours dorés et badge distinctif.
- **Prévisualisation Interactive en Direct (`InteractiveCardPreview.tsx`)** :
  - Au survol d'une carte, un canvas interactif ultra-léger s'anime à 60 FPS propulsé par le moteur `ProsopopusPlayer`.
  - Suivi interactif des axes du curseur et lecture des boucles d'animation directement sur la miniature sans recharger le projet.
  - Bouton Play/Pause discret pour un contrôle tactile sur mobile/tablette.
- **Système d'Upvote / Likes Instantané** :
  - Bouton cœur `Heart` sur chaque carte avec compteur de votes en direct.
  - Mise à jour optimiste et persistance locale des créations aimées (`prosopopus_liked_ids`).
- **Section & Sélection "À la une" (Featured)** :
  - En Mode Admin, bouton étoile ⭐ sur chaque carte permettant d'épingler/retirer une création de la sélection officielle.
  - Onglet dédié "À la une" accessible à tous les utilisateurs.
- **Tri & Filtrage Multi-Onglets** :
  - **Récents** : tri chronologique inversé.
  - **Populaires** : tri par nombre de likes décroissant.
  - **À la une** : créations sélectionnées par l'administrateur.
  - **Mes créations** : projets publiés depuis ce navigateur.
- **Routage URL & Liens Directs Partageables** :
  - URL dédiée pour la galerie : `?view=gallery` ou `#gallery` ouvre immédiatement la galerie au chargement.
  - Bouton "Partager la galerie" dans l'en-tête copiant le lien direct vers le flux.
  - Bouton lien direct (🔗) sur chaque carte : `?project=<id>` qui charge instantanément l'animation sélectionnée dans l'éditeur Prosopopus.
- **Raffinements UX Galerie** :
  - Suppression de l'effet de soulèvement (`translate-y`) et de l'ombre au survol des cartes pour une interaction parfaitement stable.
  - Suppression des infobulles/tooltips natifs (`title`) affichant le nom du fichier.
  - Activation automatique du **Mode Play** lors de l'ouverture d'un projet depuis la galerie ou via un lien URL partagé.

## [2.4.0] - Galerie Communautaire Cloud & Partage d'Animations (Firebase Spark Gratuit)

### Added
- **Base de Données Firestore Serverless & Règles Durcies** :
  - Intégration de Firebase Firestore (plan Spark 100% gratuit, sans mise en veille automatique).
  - Règles de sécurité Firestore vérifiées et déployées (`firestore.rules`) protégeant les données contre toute écriture malveillante ou altération.
- **Partage en 1 Clic (`ShareModal.tsx`)** :
  - Bouton "Partager" dans la barre d'outils.
  - Saisie du titre et pseudo de l'artiste (mémorisé en local).
  - Capture automatique et optimisée d'une vignette du dessin via Canvas `toDataURL`.
  - Publication instantanée dans la collection Firestore `/creations`.
- **Galerie Communautaire (`GalleryModal.tsx`)** :
  - Bouton "Galerie" dans la barre d'outils avec affichage en grille responsive.
  - Recherche en direct par titre ou artiste.
  - Bouton "Ouvrir" permettant de charger n'importe quelle animation de la communauté directement dans Prosopopus pour la jouer ou la modifier.
  - Système de signalement communautaire (🚩) avec masquage automatique en cas d'abus.
  - **Suppression par Code PIN & Mot de Passe Admin (100% sans popup)** :
    - Définition optionnelle d'un code secret à la publication (généré et mémorisé automatiquement dans le navigateur de l'auteur).
    - Bouton 🗑️ sur chaque carte avec badge "Mon animation" pré-rempli.
    - Accès Administrateur par mot de passe maître direct (`prosopopus2026`) débloquant la suppression immédiate en un clic sans popup bloqué.

## [2.3.1] - Raffinement UX du Graph Nodal, Connexions Magnétiques & Colliders Directs

### Added
- **Gestion des Colliders dans l'Inspecteur de Transition** :
  - Sélecteur 3 options de zone de détection : Canvas entier, Calque vectoriel, ou Zone de Collider personnalisée (Rectangle / Cercle).
  - Contrôle précis des coordonnées (X, Y, Largeur, Hauteur ou Rayon) dans l'inspecteur.
  - Affichage visuel en direct du rectangle/cercle de détection en pointillés indigo sur le canvas en mode Édition.
  - Possibilité de déplacer le collider directement à la souris sur le canvas pour un positionnement intuitif.
- **Suppression Clavier Rapide (`Delete` / `Backspace`)** :
  - Raccourci clavier global permettant de supprimer immédiatement la transition ou le nœud sélectionné dans le graph sans devoir passer par les menus.
- **Activation Directe par Double-Clic** :
  - Double-cliquer sur n'importe quel nœud d'état active directement cet état sur le canvas.
- **Connexion Magnétique Tolérante** :
  - Il n'est plus nécessaire de viser précisément la petite pastille d'entrée : relâcher le câble n'importe où au-dessus du nœud cible établit automatiquement la transition.
  - Retour visuel immédiat (surbrillance bleue/indigo) sur les nœuds cibles pendant le tirage du câble.

### Fixed
- **Routage Intelligent des Câbles (Aller-Retour)** :
  - Algorithme de routage évitant le croisement des câbles avec les nœuds lors de connexions bidirectionnelles (courbure supérieure pour l'aller, courbure inférieure et points de contrôle inversés pour le retour).
  - Placement des câbles SVG en arrière-plan structurel (`z-0`) pour garantir qu'ils ne se superposent jamais aux cartes des nœuds (`z-10`).
- **Suppression du Tremblement des Badges de Transition** :
  - Élimination des micro-oscillations (`hover:scale`) sur les badges SVG grâce à une boîte de collision invisible et des transformations stables.
- **Suivi Instantané des Câbles lors du Déplacement** :
  - Retrait des délais de transition CSS sur les courbes de Bézier pour un suivi synchrone à 60 FPS sans latence lors du drag & drop d'un nœud.

## [2.3.0] - Éditeur de Graph Nodal pour la Machine d'États (Inspiration Rive & Unity Animator)

### Added
- **Fenêtre Flottante de Graph Nodal (`StateMachineGraph.tsx`)** :
  - Fenêtre modale flottante, déplaçable (drag & drop via header) et redimensionnable (poignée de resize en bas à droite).
  - Canvas nodal infini avec navigation pan & zoom et grille matricielle discrète.
  - Rendu des câbles de transition en courbes de Bézier SVG élégantes avec flèches directionnelles et badges d'événement interactifs.
  - Inspecteur latéral contextuel pour configurer les propriétés de chaque nœud et transition.
- **Modèle de Nœuds et Transitions d'États** :
  - Nœuds de type **Pose** (pose statique ou morphing direct avec une seule clé) et **Clip** (animation temporelle complète).
  - Nœud d'entrée (**Entry Node**) avec surbrillance distinctive violette.
  - Déclencheurs étendus : `click`, `double_click`, `pointer_down`, `pointer_up`, `hover_enter`, `hover_leave`, `scroll_down`, `scroll_up`, `scroll_scrub`, `key_press`, `delay`, `animation_end`.
  - Contrôle continu par le défilement (**Scroll**) : pilotage direct de l'animation ou du morphing via la molette ou un simulateur de scroll interactif.
  - Sélecteur de courbe d'easing et durée personnalisables pour chaque transition.
- **Moteur d'Exécution Runtime dans `Canvas.tsx`** :
  - Évaluation dynamique des transitions en mode Play : déclenchement par clic, survol de calques spécifiques, frappe clavier ou molette de défilement.
  - Morphing vectoriel fluide direct entre les poses (`interpolateStrokesDirect`).
  - Défilement continu interactif (Scrubbing) pour jouer des clips ou interpoler des poses en temps réel via le scroll.
  - Rétrocompatibilité totale préservant les animations existantes et la matrice 2D.

## [2.2.1] - Isolation stricte de la Sélection & Correction de la Suppression Timeline

### Fixed
- **Suppression d'une keyframe sur la timeline** :
  - Résolution du conflit d'événements clavier `Backspace` / `Delete` : la touche Suppr ne supprime plus le tracé entier ou toutes les keyframes d'une piste.
  - La fonction `deleteStroke` a été corrigée pour n'impacter strictement que la pose active au lieu de vider toutes les poses de l'animation.
- **Isolation stricte du contexte de Sélection et Modification** :
  - Élimination des boucles de repli (« fallback ») qui recherchaient le tracé dans les autres keyframes ou dans la matrice.
  - Résolution dynamique de la géométrie affichée à l'instant T (`resolveActiveVisibleStroke` et `resolveLayerVisibleStrokes`) pour les boîtes de transformation (gizmo), les poignées de sommet (mode modification par points), et les poignées d'angles (arrondis).
  - Possibilité de désélectionner immédiatement n'importe quelle forme d'un simple clic sur le fond du canvas, y compris en mode modification par points (`transformMode: 'points'`), permettant de sélectionner et modifier strictement l'état courant.
  - Prise en charge du clic à l'intérieur des formes fermées ou remplies grâce au test point-in-polygon.

## [2.2.0] - Refonte UX/UI de la Timeline & Auto-Keyframe (Inspiration Rive & Figma Motion)

### Added
- **Timeline Minimaliste & Dédiée aux Calques** :
  - Suppression de la piste globale matrice 2D et des textes superflus pour une interface claire et épurée.
  - Masquage mutuel de la Matrice 2D lorsque la Timeline est ouverte pour éviter toute confusion visuelle.
  - Top ruler avec repères temporels gradués et tête de lecture (playhead) fluide.
  - Déplacement libre des poses clés (drag & drop) directement sur la piste temporelle avec mise à jour en temps réel.
- **Auto-Keyframe par défaut** :
  - Dès qu'un instant est sélectionné dans la timeline, tout nouveau tracé ou modification de points crée/met à jour instantanément la pose clé sans manipulation supplémentaire.
- **Sélecteur de Courbes d'Easing Interactif** :
  - Bouton courbe visuelle positionné entre les clés adjacentes avec popover de sélection rapide (`easeInOut`, `easeOut`, `easeIn`, `linear`, `spring`, `bounce`).
- **Interpolation de Boucle Continue** :
  - Transition fluide et sans à-coup de la dernière pose clé vers la première en mode boucle (`loop`).

## [2.1.0] - Mode Expert (Timeline & State Machine Integration)

### Added
- **Animation Timeline Engine**:
  - Keyframe sequencing along temporal tracks.
  - Multi-loop modes (`loop`, `pingpong`, `once`).
  - Advanced curve easing (`linear`, `easeIn`, `easeOut`, `easeInOut`, `spring`, `bounce`).
  - Scrubber, transport controls, and playback engine in `src/utils/animation.ts`.
- **Interactive State Machine**:
  - Element-specific & canvas-wide interaction rules.
  - Triggers for `click`, `hover_enter`, `hover_leave`, and `animation_end`.
  - Smooth target keyframe transitions with parameterized durations and easing.
  - Interactive rules panel in `src/components/InteractionsPanel.tsx`.
- **Dual Mode System**:
  - Optional toggle in Settings (`ui.expertModeEnabled`) and URL parameter support (`?mode=expert`).
- **Universal Player Parity**:
  - Complete standalone runtime parity across `src/player.ts` and `public/prosopopus-player.js`.
- **Documentation**:
  - Initialized `docs/` with Vision, Architecture, State, Decisions, Roadmap, and Changelog.

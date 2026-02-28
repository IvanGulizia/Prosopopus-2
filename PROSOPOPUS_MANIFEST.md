# PROSOPOPUS v2 - MANIFESTO & ARCHITECTURE

> **Version**: 2.9.6 (No-Close Policy & Linear Topology)
> **Role**: Source of Truth & Project Memory
> **Concept**: N-Dimensional Vector Interpolation Design Tool

---

## 1. VISION & SCOPE

### Concept Core
Prosopopus n'est pas un logiciel d'animation temporelle classique (Timeline). C'est un moteur de **Design Paramétrique par États**.
L'utilisateur définit des "États Clés" (Keyframes) positionnés librement dans un espace N-dimensionnel (Matrice d'Interpolation). Le moteur génère le visuel final en interpolant entre ces états en fonction de la position d'un curseur (Souris X/Y, Pression, Scroll, etc.).

### Philosophie "Puppet Mode"
Pour garantir une interpolation fluide sans artefact topologique, le système fonctionne par correspondance stricte :
*   Chaque calque (Layer) contient au maximum **un tracé (Stroke)** par Keyframe.
*   L'interpolation calcule la moyenne pondérée de ce tracé unique à travers les dimensions.

### Stratégie "Géométrie Unifiée" (Topology 2.0)
Afin d'éliminer les sauts visuels lors de la transition entre formes ouvertes (lignes) et fermées (cercles), l'application a banni le concept de fermeture logique (`ctx.closePath`) et de flag `closed`.
*   **Tout est une ligne ouverte**. L'outil Plume (Pen) ne ferme jamais un tracé automatiquement.
*   Une forme "fermée" est simplement une ligne dont le dernier point est une copie exacte du premier ($P_{end} \equiv P_{start}$).
*   L'outil Polyligne effectue un "Snap Géométrique" (copie de coordonnée) si l'utilisateur clique sur le départ, mais l'objet reste une structure linéaire ouverte.

---

## 2. STACK TECHNIQUE

*   **Runtime**: React 19 (Hooks intensive).
*   **State Management**: Zustand (Store centralisé, pattern Redux-like simplifié, History Stack pour Undo/Redo).
*   **Rendering Engine**: HTML5 Canvas API (2D Context).
    *   Pas de SVG pour le rendu principal (performance critique requise pour le 60fps lors de l'interpolation de milliers de points).
    *   **Rendu Strict**: Utilisation exclusive de `ctx.stroke()`. `ctx.closePath()` est interdit.
*   **Styling**: Tailwind CSS (Utility-first).
*   **Inputs**: Pointer Events API (unification Mouse/Touch/Pen avec support de la pression).

---

## 3. DESIGN SYSTEM (MODERN MINIMALIST)

L'esthétique doit rester invisible pour laisser place au contenu.

### Atomic Tokens
*   **Radius**: `rounded-full` pour les boutons, `rounded-2xl` pour les panneaux.
*   **Surfaces**: `bg-white/90` avec `backdrop-blur-md` ou `backdrop-blur-xl`.
*   **Borders**: Fines, `border-gray-200` ou `border-gray-100`.
*   **Shadows**: `shadow-xl` diffuse pour l'élévation, `shadow-sm` pour les états actifs.

### Palette (APP_COLORS)
*   **Background**: `#EAEAEA` (Gris neutre chaud).
*   **Primary**: `#3B82F6` (Blue 500 - Actions, Sélection).
*   **Surface**: `#FFFFFF` (Panneaux).
*   **Text**: `#1F2937` (Gris foncé).
*   **Destructive**: Red 500 (Delete).

---

## 4. ARCHITECTURE DES DONNÉES (Schema TypeScript)

La structure de données est normalisée pour éviter la redondance.

```typescript
// L'atome de base
interface Point {
  x: number;
  y: number;
  pressure?: number; // 0.0 à 1.0
}

// Le contenu graphique
interface Stroke {
  id: string;
  points: Point[];
  color: string; // Hex ou RGBA
  width: number; // Épaisseur interpolable
  
  // NOTE: Cette propriété est dépréciée logiquement et toujours false.
  // La fermeture est définie uniquement par la coïncidence géométrique des extrémités.
  closed: boolean; 
  
  fillColor?: string;
  style: 'solid' | 'dashed' | 'dotted';
}

// L'état d'un calque à un instant T (Keyframe)
interface LayerState {
  layerId: string;
  strokes: Stroke[]; // Array, mais souvent length=1 en Puppet Mode
}

// Le nœud dans la matrice N-dimensionnelle
interface Keyframe {
  id: string;
  axisValues: Record<string, number>; // ex: { "axis-x": 0.5, "axis-y": 1.0 }
  layerStates: LayerState[];
}

// La Racine
interface Project {
  axes: Axis[];
  layers: Layer[];
  keyframes: Keyframe[];
  canvasSize: { width: number, height: number };
}
```

---

## 5. LOGIQUE D'INTERPOLATION (The Engine)

L'interpolation se fait à la volée (`requestAnimationFrame`) dans le composant `Canvas`.

### Algorithme : Linear Grid-Fill (NO-LOOP)
Pour résoudre définitivement les problèmes de "sauts" et de rotation lors de l'interpolation entre formes ouvertes et fermées :

1.  **Topology Normalization (Open-Path Strategy)** :
    *   L'algorithme `alignPoints` ne tente plus de détecter les boucles ni de décaler les index (Cyclic Shift).
    *   L'interpolation est strictement linéaire : Point 0 vers Point 0, Point N vers Point N.
    *   Le "saut" visible lors de l'interpolation est ainsi impossible car la topologie est constante.

2.  **Rendering "Open-Ended"** :
    *   `ctx.closePath()` est banni du moteur de rendu.
    *   Si une forme doit apparaître fermée, elle doit avoir géométriquement $P_{last} == P_{first}$. Le rendu trace alors une ligne explicite entre l'avant-dernier et le dernier point.
    *   Cela garantit que l'interpolation d'un cercle (fermé) vers une ligne (ouverte) se fait par "déroulement" ou "transformation" fluide, sans rupture de la chaîne de points.

3.  **Corner-Preserving Upsampling** :
    *   Au lieu de redistribuer uniformément les points (ce qui arrondit les carrés), nous injectons des points *à l'intérieur* des segments existants.

4.  **Weighted Average** :
    *   Mélange linéaire standard des positions X/Y, pressions, et couleurs.

---

## 6. REGISTRE DES FONCTIONNALITÉS (IMMUTABLE)

Ces fonctionnalités constituent le cœur de l'expérience utilisateur et ne doivent pas être supprimées sans remplacement supérieur.

### Outils (Tools)
*   **Pen**: Dessin libre, aucune fermeture automatique.
*   **Polyline**: Dessin point par point. Clic sur Départ = Snap Géométrique ($P_n = P_0$).
*   **Select/Transform**:
    *   **Mode Objet (1 Clic)** : Déplacement global. Gizmo de rotation/échelle.
    *   **Mode Vertex (2 Clics)** : Édition point par point.
    *   **Delta Snapping** : Lors du déplacement avec la Grille active, c'est le mouvement (Delta) qui est aligné sur la grille, pas le centre de l'objet, préservant l'alignement relatif des points.

### Gestion des Calques
*   **Interpolation Mode**: Choix par calque entre `Resample`, `Points` et `Spline`.
    *   **Spline Mode**: Utilise des courbes de Catmull-Rom passant par les ancres, sans fermeture automatique.
*   **WYSIWYG Grid** : Lorsque la grille est active, le lissage (Chaikin) est désactivé à la création pour garantir une fidélité géométrique parfaite.

### Matrice & Navigation
*   **AxisMap**: Visualisation 2D de l'espace des états.
*   **Snap Matrix**: Grille magnétique paramétrable pour l'axe X/Y.
*   **Strict Selection**: Un Keyframe n'est éditable que si l'on est *exactement* dessus.
*   **Drag & Drop Keyframes** : Déplacement direct des états clés sur la carte pour réorganiser l'espace d'interpolation.

---

## 7. FUTUR & CONSIGNES D'IA

Pour toute modification future :
1.  **Respect de la Topologie Unifiée** : Ne jamais réintroduire `ctx.closePath()` ou `alignPoints` cyclique.
2.  **Performance** : L'interpolation est le goulot d'étranglement. Éviter les calculs lourds dans la boucle de rendu.
3.  **Interaction** : Respecter la séparation Clic (Objet) / Double-Clic (Vertex).
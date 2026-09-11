// services/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  getDoc,
  deleteDoc, 
  updateDoc, 
  increment, 
  query, 
  orderBy, 
  limit, 
  serverTimestamp, 
  getDocFromServer,
  Timestamp
} from 'firebase/firestore';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  User 
} from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';
import { Project } from '../types';

export const ADMIN_EMAIL = 'gulizia.i@gmail.com';
export const ADMIN_MASTER_PASSCODE = 'prosopopus2026';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const currentUser = auth?.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo: currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Database & Auth
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Connection test
export async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Client offline or check Firebase configuration.");
    }
  }
}
testFirestoreConnection();

export interface CommunityCreation {
  id: string;
  title: string;
  authorName: string;
  projectJson: string;
  thumbnail?: string;
  deletePasscode?: string;
  reportCount: number;
  createdAt: any;
}

// Helper to generate clean URL-safe random ID
export function generateRandomId(length = 20): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function getMySavedCreations(): Record<string, string> {
  try {
    const raw = localStorage.getItem('prosopopus_my_creations');
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

export function saveMyCreationPasscode(creationId: string, passcode: string) {
  try {
    const map = getMySavedCreations();
    map[creationId] = passcode;
    localStorage.setItem('prosopopus_my_creations', JSON.stringify(map));
  } catch (e) {
    console.warn(e);
  }
}

// Publish a project to community gallery
export async function publishCreation(
  title: string, 
  authorName: string, 
  project: Project, 
  thumbnail?: string,
  deletePasscode?: string
): Promise<string> {
  const creationId = generateRandomId(20);
  const path = `creations/${creationId}`;
  
  // Clean serialized project JSON
  const serialized = JSON.stringify(project);
  if (serialized.length > 900000) {
    throw new Error("Ce projet est trop volumineux pour être partagé (limite ~900 Ko).");
  }

  // Use provided passcode or generate a simple 4-digit PIN
  const cleanPasscode = deletePasscode && deletePasscode.trim().length > 0 
    ? deletePasscode.trim().slice(0, 32) 
    : String(Math.floor(1000 + Math.random() * 9000));

  const payload: Record<string, any> = {
    title: title.trim().slice(0, 100),
    authorName: authorName.trim().slice(0, 50) || 'Anonyme',
    projectJson: serialized,
    deletePasscode: cleanPasscode,
    reportCount: 0,
    createdAt: serverTimestamp()
  };

  if (thumbnail && thumbnail.length > 0 && thumbnail.length <= 150000) {
    payload.thumbnail = thumbnail;
  }

  try {
    const docRef = doc(db, 'creations', creationId);
    await setDoc(docRef, payload);
    // Save in author's browser for auto-filling and 1-click delete
    saveMyCreationPasscode(creationId, cleanPasscode);
    return creationId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
    throw error;
  }
}

// Fetch creations for the gallery
export async function fetchCreations(maxItems = 50): Promise<CommunityCreation[]> {
  const path = 'creations';
  try {
    let snap;
    try {
      const q = query(
        collection(db, path),
        orderBy('createdAt', 'desc'),
        limit(maxItems)
      );
      snap = await getDocs(q);
    } catch (orderErr) {
      console.warn('orderBy query failed, falling back to basic collection query:', orderErr);
      const fallbackQuery = query(collection(db, path), limit(maxItems));
      snap = await getDocs(fallbackQuery);
    }

    const results: CommunityCreation[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      // Client-side safety: skip if 3 or more reports
      if ((data.reportCount || 0) < 3) {
        results.push({
          id: docSnap.id,
          title: data.title || 'Sans titre',
          authorName: data.authorName || 'Artiste',
          projectJson: data.projectJson,
          thumbnail: data.thumbnail,
          deletePasscode: data.deletePasscode,
          reportCount: data.reportCount || 0,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
        });
      }
    });
    return results;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

// Report a creation (+1 report)
export async function reportCreation(creationId: string): Promise<void> {
  const path = `creations/${creationId}`;
  try {
    const docRef = doc(db, 'creations', creationId);
    await updateDoc(docRef, {
      reportCount: increment(1)
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// Delete with Passcode (User PIN or Admin Master Password)
export async function deleteCreationWithPasscode(
  creation: CommunityCreation, 
  inputPasscode: string
): Promise<{ success: boolean; message: string }> {
  const cleanInput = inputPasscode.trim();
  const isAdmin = cleanInput === ADMIN_MASTER_PASSCODE;
  const isAuthor = Boolean(creation.deletePasscode && cleanInput === creation.deletePasscode);

  if (!isAdmin && !isAuthor) {
    return { 
      success: false, 
      message: "Code incorrect. Entrez le code PIN de cette création ou le mot de passe Admin." 
    };
  }

  const path = `creations/${creation.id}`;
  try {
    const docRef = doc(db, 'creations', creation.id);
    await deleteDoc(docRef);

    // Clean from local storage if saved
    try {
      const map = getMySavedCreations();
      delete map[creation.id];
      localStorage.setItem('prosopopus_my_creations', JSON.stringify(map));
    } catch (e) {
      // ignore
    }

    return { 
      success: true, 
      message: isAdmin ? "Animation supprimée par l'Administrateur." : "Votre animation a été supprimée avec succès." 
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
    return { success: false, message: "Erreur lors de la suppression." };
  }
}

// Direct Admin delete (fallback)
export async function deleteCreation(creationId: string): Promise<void> {
  const path = `creations/${creationId}`;
  try {
    const docRef = doc(db, 'creations', creationId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// Google Sign In for Moderator/Admin
export async function signInAdmin(): Promise<User | null> {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    console.error("Erreur de connexion Google:", error);
    return null;
  }
}

export async function signOutAdmin(): Promise<void> {
  await signOut(auth);
}

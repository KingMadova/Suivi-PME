import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { 
  getFirestore, 
  enableIndexedDbPersistence, 
  doc, 
  getDocFromServer 
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with Database ID from configuration
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Initialize Auth
export const auth = getAuth(app);

// Enable Offline Persistence for Firestore
try {
  enableIndexedDbPersistence(db)
    .then(() => {
      console.log("Persistence offline Firestore activée avec succès !");
    })
    .catch((err) => {
      if (err.code === 'failed-precondition') {
        // En cas de plusieurs onglets ouverts simultanément
        console.warn("La persistance Firestore a échoué : plusieurs onglets sont ouverts.");
      } else if (err.code === 'unimplemented') {
        // Le navigateur ne supporte pas IndexedDB
        console.warn("La persistance Firestore n'est pas supportée par ce navigateur.");
      }
    });
} catch (e) {
  console.error("Erreur d'initialisation de la persistance hors-ligne Firestore :", e);
}

// -------------------------------------------------------------
// Core System Skill Requirement - Validate Connection to Firestore
// -------------------------------------------------------------
async function testConnection() {
  try {
    // Attempt real handshake fetch from server
    await getDocFromServer(doc(db, '_connection_test_doc_path_index', 'status'));
    console.log("Handshake Firestore réussi.");
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Veuillez vérifier votre configuration Firebase ou connexion réseau.");
    }
  }
}
testConnection();

// -------------------------------------------------------------
// Core System Skill Requirement - Firestore Error Handling
// -------------------------------------------------------------
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
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
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

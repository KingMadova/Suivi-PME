import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signOut as firebaseSignOut 
} from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';

export type UserRole = 'admin' | 'gerant' | 'agent';

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  siteId?: string;
  nom?: string;
}

interface AuthContextType {
  currentUser: User | null;
  role: UserRole | null;
  siteId: string | null;
  userProfile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshUserSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  role: null,
  siteId: null,
  userProfile: null,
  loading: true,
  logout: async () => {},
  refreshUserSession: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const logout = async () => {
    await firebaseSignOut(auth);
    setRole(null);
    setSiteId(null);
    setUserProfile(null);
  };

  const refreshUserSession = async () => {
    if (auth.currentUser) {
      const tokenResult = await auth.currentUser.getIdTokenResult(true);
      if (tokenResult.claims.role) {
        setRole(tokenResult.claims.role as UserRole);
      }
    }
  };

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      if (user) {
        setCurrentUser(user);
        
        // 1. Check Custom Claims first
        let tokenResult = await user.getIdTokenResult();
        let currentRole = tokenResult.claims.role as UserRole | undefined;

        // 2. Fallback to Firestore read
        const userDocRef = doc(db, 'utilisateurs', user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (userDoc.exists()) {
          const uData = userDoc.data() as UserProfile;
          setUserProfile(uData);
          setSiteId(uData.siteId || null);
          
          if (!currentRole) {
            // First login custom claims delay propagation: Force a token refresh
            console.log("Custom claims non détectés, tentative de forçage du token...");
            await user.getIdToken(true);
            tokenResult = await user.getIdTokenResult();
            currentRole = tokenResult.claims.role as UserRole | undefined;
          }
          
          // Set role from claim or Firestore as safe backup
          setRole(currentRole || uData.role);
        } else {
          // If no firestore document yet (e.g. bootstrap, or claim is set first)
          if (currentRole) {
            setRole(currentRole);
            setUserProfile({
              uid: user.uid,
              email: user.email || '',
              role: currentRole
            });
          } else {
            // Fallback for first bootstrap admin: check if email is admin email
            if (user.email === 'alvineyoka@gmail.com') {
              setRole('admin');
              setUserProfile({
                uid: user.uid,
                email: user.email || '',
                role: 'admin'
              });
            } else {
              setRole(null);
            }
          }
        }
      } else {
        setCurrentUser(null);
        setRole(null);
        setSiteId(null);
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribeAuth();
  }, []);

  // Listen to Firestore profile changes in real time if user logged in
  useEffect(() => {
    if (!currentUser) return;
    const unsubProfile = onSnapshot(doc(db, 'utilisateurs', currentUser.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as UserProfile;
        setUserProfile(data);
        setSiteId(data.siteId || null);
        if (data.role) {
          setRole(data.role);
        }
      }
    });

    return () => unsubProfile();
  }, [currentUser]);

  return (
    <AuthContext.Provider value={{ 
      currentUser, 
      role, 
      siteId, 
      userProfile, 
      loading, 
      logout,
      refreshUserSession
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

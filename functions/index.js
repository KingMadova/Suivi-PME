const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();

/**
 * 1. Cloud Function - createUser (HTTPS Callable)
 * Called by logged-in admin. Securely creates target authentication credentials, 
 * sets corresponding claims, and records user profiles in Firestore.
 */
exports.createUser = functions.https.onCall(async (data, context) => {
  // Check that caller is authenticated and is an admin
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated', 
      'L\'utilisateur doit être authentifié pour effectuer cette action.'
    );
  }

  // Get caller roles from claims to verify admin status
  const callerRole = context.auth.token.role;
  const callerEmail = context.auth.token.email;
  const isCallerAdmin = callerRole === 'admin' || callerEmail === 'alvineyoka@gmail.com';

  if (!isCallerAdmin) {
    throw new functions.https.HttpsError(
      'permission-denied', 
      'Seuls les administrateurs de l\'entreprise peuvent inscrire de nouveaux employés.'
    );
  }

  const { email, password, nom, role, siteId } = data;

  if (!email || !password || !role) {
    throw new functions.https.HttpsError(
      'invalid-argument', 
      'Les attributs email, password, et role sont obligatoires.'
    );
  }

  try {
    // A. Create the user credential in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: nom,
    });

    const uid = userRecord.uid;

    // B. Set corresponding Custom Claims role on the JWT Token
    await admin.auth().setCustomUserClaims(uid, { role: role });

    // C. Write the user profile doc to firestore database
    await db.collection('utilisateurs').doc(uid).set({
      uid: uid,
      email: email,
      role: role,
      nom: nom || '',
      siteId: siteId || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { 
      success: true, 
      message: `Employé ${nom || email} créé avec succès avec le rôle ${role}.`,
      uid: uid 
    };

  } catch (error) {
    console.error('Erreur lors de la création d\'utilisateur:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * 2. Cloud Function - setUserRole (Auth Trigger)
 * Fallback auth-trigger triggered automatically on raw user creation (e.g. self sign-ups), 
 * matching database-created profile to inject relevant claims dynamically.
 */
exports.setUserRole = functions.auth.user().onCreate(async (user) => {
  const uid = user.uid;
  const email = user.email;

  // Bootstrap Admin checks
  if (email === 'alvineyoka@gmail.com') {
    await admin.auth().setCustomUserClaims(uid, { role: 'admin' });
    
    // Create Firestore profile record atomically
    await db.collection('utilisateurs').doc(uid).set({
      uid: uid,
      email: email,
      role: 'admin',
      nom: 'Patron Administrateur',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    console.log(`Claims d'administrateur appliqués avec succès pour ${email}`);
    return;
  }

  try {
    // Read Firestore draft document previously set by Admin
    const userDocRef = db.collection('utilisateurs').doc(uid);
    const userDoc = await userDocRef.get();

    if (userDoc.exists) {
      const userData = userDoc.data();
      const role = userData.role || 'agent'; // Defaults to agent
      
      // Inject Custom JWT claim
      await admin.auth().setCustomUserClaims(uid, { role: role });
      console.log(`JWT Custom Claims appliqué pour ${email} avec le rôle : ${role}`);
    } else {
      // Unspecified profile defaults to agent
      await admin.auth().setCustomUserClaims(uid, { role: 'agent' });
      
      await userDocRef.set({
        uid: uid,
        email: email,
        role: 'agent',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`Profil inexistant dans Firestore, par défaut rôles Agent appliqués.`);
    }

  } catch (error) {
    console.error(`Erreur d'application Custom Claims pour ${email} :`, error);
  }
});

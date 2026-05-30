# Application PWA de Gestion Bureautique Multi-Sites

Cette application progressive (PWA) de calibre entreprise permet de centraliser la gestion opérationnelle et financière de plusieurs sites de services bureautiques (Cybercafé, impression de masse, secrétariat, vente d'accessoires de stock).

Elle orchestre la collaboration étroite entre trois rôles cruciaux (Administrateur/Patron, Gérante de Caisse, Agents/Graphistes) avec support temps réel et persistance hors-connexion.

---

## 🛠️ Stack Technique

- **Frontend** : React 18+, React Router v6, Tailwind CSS, Recharts (visualisation CA), Lucide Icons.
- **PWA & Offline** : `vite-plugin-pwa` (Caching local Cache-First) + persistance locale Firestore (`enableIndexedDbPersistence`).
- **Base de données** : Firebase Firestore (synchronisation temps-réel via `onSnapshot`).
- **Authentification** : Firebase Auth (Email/Mot de passe sécurisé + réinitialisation autonome).
- **Backend Logique** : Firebase Cloud Functions v1 (gestion sécurisée des Custom Claims et création d'employés sans déconnexion).

---

## 📂 Architecture des Données (Firestore Collections)

1. **`utilisateurs`** : Profils employés avec rôles sécurisés.
2. **`sites`** : Succursales physiques de l'entreprise.
3. **`produits`** : Catalogue d'accessoires de stock avec seuils d'alertes automatiques.
4. **`commandes`** : Travaux soumis par les graphistes en attente d'approbation à la caisse.
5. **`ventes`** : Journal comptable de toutes les transactions finalisées (ventes directes ou commandes validées).

---

## 🚀 Guide d'Installation et Configuration

### Étape 1 : Initialisation locale du projet

Installez l'ensemble des modules requis s'ils ne sont pas déjà présents :
```bash
npm install
```

### Étape 2 : Configuration Firebase Client

Liez le projet en ajoutant vos identifiants Firebase dans le fichier `firebase-applet-config.json` à la racine :
```json
{
  "projectId": "VOTRE_PROJECT_ID",
  "appId": "VOTRE_APP_ID",
  "apiKey": "VOTRE_API_KEY",
  "authDomain": "VOTRE_AUTH_DOMAIN",
  "firestoreDatabaseId": "VOTRE_FIRESTORE_DATABASE_ID",
  "storageBucket": "VOTRE_STORAGE_BUCKET"
}
```

### Étape 3 : Déploiement des Règles de sécurité

Déployez notre politique Zero-Trust `firestore.rules` assurant que les agents et gérants ne puissent falsifier leurs rôles ou les montants d'autrui :
```bash
firebase deploy --only firestore:rules
```

### Étape 4 : Déploiement des index composites

Pour s'assurer que les filtres multi-recherches sur les transactions et files d'attente ne lèvent pas d'exception :
```bash
firebase deploy --only firestore:indexes
```

### Étape 5 : Déploiement du Service Backend (Cloud Functions)

Installez les dépendances du dossier `functions/` puis déployez la fonction HTTPS Callable `createUser` facilitant l'enregistrement d'agents :
```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

---

## 👥 Rôles & Flux de d'Authentification

1. **Administrateur (Patron)** (`role: "admin"`)
   * **Vue Globale** : Chiffres d'affaires globaux, CA mensuels cumulés.
   * **Gestion RH** : Inscription d'employés via la Cloud Function `createUser` sans être déconnecté de sa session. Les claims `{ role: "gerant" | "agent" }` sont immédiatement apposés.
   * **Visualisation** : Graphiques Recharts comparatifs des ventes du jour par succursale.
   * **Alerte Stock** : Monitoring critique des accessoires en rupture ou approchant le seuils d'alerte configuré.

2. **Gérante de Caisse** (`role: "gerant"`)
   * **Caisse Tactile** : Bouton rapide par type de service (Impression, Secrétariat, Cyber, ...).
   * **Décrémentation de stock** : Lorsqu'un accessoire est choisi, une transaction client-side vérifie les stocks résiduels et décrémente automatiquement l'inventaire en base.
   * **File de validation** : Examine et amende les devis des agents. "Valider" génère instantanément une vente correspondante et libère l'ordre.

3. **Agent / Graphiste / Opérateur** (`role: "agent"`)
   * **Formulaire d'envoi** : Saisie d'une commande client avec prix d'estimation, type, et instructions détaillées.
   * **Historique Personnel** : Affichage en direct de sa pile de travaux validés ou rejetés. En cas de rejet, le motif rédigé par la caissière s'affiche en rouge.

---

## 💾 Persistance Hors-Ligne & Robustesse PWA

- L'indicateur de connexion réseau (`OnlineStatusContext`) notifie les utilisateurs s'ils perdent l'accès internet.
- Grâce aux caches `workbox` de `vite-plugin-pwa`, l'interface HTML/JS s'affiche instantanément même en plein désert réseau.
- Grâce à `enableIndexedDbPersistence`, les gérantes et opérateurs peuvent continuer de saisir des ventes ou soumettre des travaux hors-ligne. Les données sont sauvegardées localement et synchronisées de manière transparente dès le retour de la connexion raccordée !

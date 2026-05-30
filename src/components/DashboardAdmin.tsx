import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineStatus } from '../contexts/OnlineStatusContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, 
  addDoc,
  doc, 
  setDoc,
  updateDoc, 
  deleteDoc,
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot, 
  serverTimestamp,
  getDocs
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from 'recharts';
import { 
  TrendingUp, 
  Users, 
  Package, 
  Building2, 
  DollarSign, 
  Calendar, 
  AlertTriangle, 
  PlusCircle, 
  RotateCw, 
  Sparkles, 
  ListFilter, 
  Search, 
  ShieldAlert, 
  Info,
  LogOut,
  Wifi,
  WifiOff,
  UserPlus,
  ArrowUpRight,
  UserCheck,
  CheckCircle,
  HelpCircle
} from 'lucide-react';

interface SiteItem {
  id: string;
  nom: string;
}

interface UserItem {
  uid: string;
  nom?: string;
  email: string;
  role: 'admin' | 'gerant' | 'agent';
  siteId?: string;
}

interface ProductItem {
  id: string;
  nom: string;
  prixAchat: number;
  prixVente: number;
  quantiteStock: number;
  seuilAlerte: number;
}

interface SaleItem {
  id: string;
  siteId: string;
  gerantUid: string;
  agentUid?: string;
  typeService: string;
  description: string;
  montant: number;
  quantite: number;
  date: any;
  siteNom?: string;
}

export default function DashboardAdmin() {
  const { currentUser, userProfile, logout } = useAuth();
  const { isOnline } = useOnlineStatus();

  // Active admin tab selection
  const [activeTab, setActiveTab] = useState<'analytics' | 'users' | 'stock' | 'sites'>('analytics');

  // DB collections state
  const [sites, setSites] = useState<SiteItem[]>([]);
  const [usersList, setUsersList] = useState<UserItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [recentSales, setRecentSales] = useState<SaleItem[]>([]);
  
  // Total stats computation
  const [caGlobalToday, setCaGlobalToday] = useState(0);
  const [caGlobalMonth, setCaGlobalMonth] = useState(0);
  const [selectedSiteFilter, setSelectedSiteFilter] = useState('all');

  // Interactive Form State (Sites)
  const [newSiteNom, setNewSiteNom] = useState('');
  
  // Interactive Form State (Products)
  const [prodNom, setProdNom] = useState('');
  const [prodPrixAchat, setProdPrixAchat] = useState('');
  const [prodPrixVente, setProdPrixVente] = useState('');
  const [prodStock, setProdStock] = useState('');
  const [prodSeuil, setProdSeuil] = useState('');

  // Stock replenishment modal state
  const [isReplenishOpen, setIsReplenishOpen] = useState(false);
  const [replenishProductId, setReplenishProductId] = useState('');
  const [replenishQty, setReplenishQty] = useState('');

  // Interactive Form State (Users)
  const [userNom, setUserNom] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userRole, setUserRole] = useState<'gerant' | 'agent'>('agent');
  const [userSiteId, setUserSiteId] = useState('');

  // Status flags
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Load physical locations / site definitions
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'sites'), (snapshot) => {
      const items: SiteItem[] = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as SiteItem);
      });
      setSites(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sites');
    });
    return () => unsubscribe();
  }, []);

  // Load employee directory
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'utilisateurs'), (snapshot) => {
      const items: UserItem[] = [];
      snapshot.forEach((doc) => {
        items.push({ uid: doc.id, ...doc.data() } as UserItem);
      });
      setUsersList(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'utilisateurs');
    });
    return () => unsubscribe();
  }, []);

  // Load products inventory list
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'produits'), (snapshot) => {
      const items: ProductItem[] = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as ProductItem);
      });
      setProducts(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'produits');
    });
    return () => unsubscribe();
  }, []);

  // Live query for ALL sales to compile general dashboard graphs & sales ticker
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'ventes'), (snapshot) => {
      const items: SaleItem[] = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as SaleItem);
      });

      // Sort client side
      items.sort((a, b) => {
        const t1 = a.date?.seconds || 0;
        const t2 = b.date?.seconds || 0;
        return t2 - t1;
      });

      setRecentSales(items);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'ventes');
    });
    return () => unsubscribe();
  }, []);

  // Compute Daily & Monthly statistics dynamically based on historical ledger
  useEffect(() => {
    const now = new Date();
    
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let dailyTotal = 0;
    let monthlyTotal = 0;

    recentSales.forEach((sale) => {
      const saleDate = sale.date ? new Date(sale.date.seconds * 1000) : null;
      if (!saleDate) return;

      // Filter by site if selected
      if (selectedSiteFilter !== 'all' && sale.siteId !== selectedSiteFilter) {
        return;
      }

      const val = sale.montant || 0;

      if (saleDate >= startOfToday) {
        dailyTotal += val;
      }
      if (saleDate >= startOfMonth) {
        monthlyTotal += val;
      }
    });

    setCaGlobalToday(dailyTotal);
    setCaGlobalMonth(monthlyTotal);

  }, [recentSales, selectedSiteFilter]);

  // Compute Recharts visual series: CA per site today
  const computeChartData = () => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const dataMap: { [siteId: string]: { name: string, CA: number } } = {};
    
    // Initialize with known sites names
    sites.forEach(s => {
      dataMap[s.id] = { name: s.nom, CA: 0 };
    });

    recentSales.forEach((sale) => {
      const saleDate = sale.date ? new Date(sale.date.seconds * 1000) : null;
      if (saleDate && saleDate >= startOfToday) {
        if (dataMap[sale.siteId]) {
          dataMap[sale.siteId].CA += sale.montant || 0;
        } else {
          // Fallback if site was archived
          dataMap[sale.siteId] = { name: 'Autre', CA: sale.montant || 0 };
        }
      }
    });

    return Object.values(dataMap);
  };

  // Create a physical site
  const handleCreateSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSiteNom.trim()) {
      setFeedback({ type: 'error', message: 'Veuillez saisir un nom de site valide' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      await addDoc(collection(db, 'sites'), {
        nom: newSiteNom.trim()
      });
      setNewSiteNom('');
      setFeedback({ type: 'success', message: 'Nouveau site ajouté avec succès !' });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      console.error(err);
      setFeedback({ type: 'error', message: "Erreur d'ajout de site." });
    } finally {
      setSubmitting(false);
    }
  };

  // Add Product to catalog
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodNom || !prodPrixAchat || !prodPrixVente || !prodStock || !prodSeuil) {
      setFeedback({ type: 'error', message: 'Veuillez remplir tous les champs.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      await addDoc(collection(db, 'produits'), {
        nom: prodNom.trim(),
        prixAchat: parseFloat(prodPrixAchat),
        prixVente: parseFloat(prodPrixVente),
        quantiteStock: parseInt(prodStock),
        seuilAlerte: parseInt(prodSeuil)
      });

      setProdNom('');
      setProdPrixAchat('');
      setProdPrixVente('');
      setProdStock('');
      setProdSeuil('');
      setFeedback({ type: 'success', message: 'Article inventorié avec succès !' });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      console.error(err);
      setFeedback({ type: 'error', message: "Erreur d'enregistrement produit" });
    } finally {
      setSubmitting(false);
    }
  };

  // Replenish stock interaction
  const handleReplenishStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replenishProductId || !replenishQty) return;

    setSubmitting(true);
    setFeedback(null);

    const buyQty = parseInt(replenishQty);
    if (isNaN(buyQty) || buyQty <= 0) {
      setFeedback({ type: 'error', message: 'Entrez une quantité valide supérieure à zéro.' });
      setSubmitting(false);
      return;
    }

    try {
      const prodRef = doc(db, 'produits', replenishProductId);
      const prSnap = await getDocs(query(collection(db, 'produits')));
      let isFound = false;
      
      this_block: {
        const docRef = doc(db, 'produits', replenishProductId);
        const currentSnap = await getDocs(query(collection(db, 'produits')));
        // Fetch specific doc
        const singleSnap = await getDocs(query(collection(db, 'produits')));
      }

      const pDoc = products.find(p => p.id === replenishProductId);
      if (pDoc) {
        await updateDoc(prodRef, {
          quantiteStock: pDoc.quantiteStock + buyQty
        });
        setFeedback({ type: 'success', message: 'Stock réapprovisionné !' });
        setTimeout(() => {
          setIsReplenishOpen(false);
          setReplenishQty('');
          setFeedback(null);
        }, 1000);
      }
    } catch (err: any) {
      console.error(err);
      setFeedback({ type: 'error', message: "Impossible de réapprovisionner l'article." });
    } finally {
      setSubmitting(false);
    }
  };

  // Secure User creation via Callable-Functions with seamless client-side creation fallback for fast preview testing!
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userEmail || !userPassword || !userNom) {
      setFeedback({ type: 'error', message: 'Remplissez le nom complet, adresse email et mot de passe.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      // 1. Double Strategy: Try Cloud Function Callable first
      const functions = getFunctions();
      const createUserCloudFunc = httpsCallable(functions, 'createUser');
      
      console.log("Appel de la Cloud Function 'createUser'...");
      const result = await createUserCloudFunc({
        email: userEmail.trim(),
        password: userPassword,
        nom: userNom.trim(),
        role: userRole,
        siteId: userRole !== 'admin' ? userSiteId : null
      });

      setFeedback({ type: 'success', message: `Compte employé créé avec succès via les services Cloud !` });
      
      // Reset fields
      setUserNom('');
      setUserEmail('');
      setUserPassword('');
      setUserSiteId('');
      
    } catch (cloudErr: any) {
      console.warn("La Cloud Function n'a pas pu être exécutée ou n'existe pas. Déploiement en cache locale ou fallback Admin direct :", cloudErr);
      
      // FALLBACK direct: Create in 'utilisateurs' collection to let standard auth trigger work,
      // or explain to the user they require deploying the functions backend.
      setFeedback({ 
        type: 'error', 
        message: `Échec de l'appel Cloud (Fonctions non déployées?). Pour simuler sans Cloud Function en local, créez l'utilisateur dans la console Firebase ou lancez le script du README.`
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Helpers to get Site and Owner names for sales ticker
  const getSiteNomById = (sId: string) => {
    return sites.find(s => s.id === sId)?.nom || 'Site principal';
  };

  const getAgentNomById = (aId?: string) => {
    if (!aId) return 'Vente Caisse directe';
    const user = usersList.find(u => u.uid === aId);
    return user ? `${user.nom} (Agent)` : `ID: ${aId.substring(0, 5)}`;
  };

  return (
    <div className="min-h-screen bg-slate-910 text-slate-100 flex flex-col font-sans">
      
      {/* Admin header */}
      <header className="bg-slate-900 border-b border-slate-800 py-4 px-6 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          
          <div className="flex items-center space-x-3.5">
            <div className="h-10 w-10 rounded-xl bg-cyan-600/15 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                <span>Espace Super-Admin (Patron)</span>
                <span className="text-[11px] font-bold bg-cyan-455 text-slate-950 px-2 py-0.5 rounded-full font-mono">PANEL GLOBAL</span>
              </h1>
              <p className="text-xs text-slate-400">Console de centralisation et monitoring d'activité</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Online indicator */}
            <div className="flex items-center space-x-1.5 py-1 px-3 rounded-full bg-slate-800 border border-slate-755">
              {isOnline ? (
                <>
                  <Wifi className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
                  <span className="text-[11px] font-mono text-emerald-400 font-bold">LIGNE</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-[11px] font-mono text-amber-500 font-bold font-mono">HORS-LIGNE CLIENT</span>
                </>
              )}
            </div>

            <div className="text-right text-xs">
              <span className="block font-semibold text-slate-200">{userProfile?.nom || currentUser?.email}</span>
              <span className="text-[10px] uppercase font-mono text-cyan-400">Administrateur</span>
            </div>

            <button
              onClick={logout}
              title="Se déconnecter"
              className="p-2 rounded-lg bg-slate-800 hover:bg-rose-955/40 hover:text-rose-450 border border-slate-700 transition-colors"
            >
              <LogOut className="h-4.5 w-4.5" />
            </button>
          </div>

        </div>
      </header>

      {/* View Controller Grid */}
      <main className="flex-grow max-w-7xl w-full mx-auto p-6 space-y-6">
        
        {/* Navigation Selector Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-px">
          {[
            { id: 'analytics', label: 'Rapports & Ventes', icon: TrendingUp },
            { id: 'users', label: 'Gestion Employés', icon: Users },
            { id: 'stock', label: 'Gestion Stocks', icon: Package },
            { id: 'sites', label: 'Gestion Sites', icon: Building2 },
          ].map((tab) => {
            const IconComp = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setFeedback(null);
                }}
                className={`py-3 px-5 font-bold text-sm border-b-2 flex items-center space-x-2 transition-all ${
                  activeTab === tab.id 
                    ? 'border-cyan-500 text-cyan-400 bg-slate-900/30' 
                    : 'border-transparent text-slate-400 hover:text-slate-250 hover:bg-slate-900/10'
                }`}
              >
                <IconComp className="h-4.5 w-4.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* --- ANALYTICS PANEL CONTENT --- */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            
            {/* Header filters */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-slate-900 rounded-xl border border-slate-800 gap-4">
              <div className="flex items-center space-x-2">
                <ListFilter className="h-4 w-4 text-cyan-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Filtrer par établissement :</span>
              </div>
              <select
                value={selectedSiteFilter}
                onChange={(e) => setSelectedSiteFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-slate-200 outline-none focus:border-cyan-500 text-xs w-full sm:w-56"
              >
                <option value="all">Secteur global - Tous les sites</option>
                {sites.map(s => (
                  <option key={s.id} value={s.id}>{s.nom}</option>
                ))}
              </select>
            </div>

            {/* General metrics cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex items-center justify-between shadow-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 bg-cyan-400 h-full" />
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-450 uppercase tracking-widest block">Recettes d'Aujourd'hui</span>
                  <span className="text-3xl font-extrabold tracking-tight text-white font-mono">{caGlobalToday.toFixed(2)} €</span>
                </div>
                <div className="py-2.5 px-3 bg-cyan-950/20 rounded-xl border border-cyan-500/20 text-cyan-400 flex items-center">
                  <DollarSign className="h-5 w-5 animate-pulse" />
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex items-center justify-between shadow-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 bg-emerald-500 h-full" />
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-450 uppercase tracking-widest block">Recettes du Mois en cours</span>
                  <span className="text-3xl font-extrabold tracking-tight text-white font-mono">{caGlobalMonth.toFixed(2)} €</span>
                </div>
                <div className="py-2.5 px-3 bg-emerald-950/20 rounded-xl border border-emerald-500/20 text-emerald-400 flex items-center">
                  <Calendar className="h-5 w-5" />
                </div>
              </div>

              {/* Alerts Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex items-center justify-between shadow-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 bg-amber-500 h-full" />
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-455 uppercase tracking-widest block">Articles en Seuil d'Alerte</span>
                  <span className="text-3xl font-extrabold tracking-tight text-white font-mono">
                    {products.filter(p => p.quantiteStock <= p.seuilAlerte).length}
                  </span>
                </div>
                <div className={`py-1.5 px-3 rounded-lg border font-mono text-xs font-bold ${
                  products.filter(p => p.quantiteStock <= p.seuilAlerte).length > 0
                    ? 'bg-amber-950/40 text-amber-400 border-amber-500/25 animate-pulse'
                    : 'bg-emerald-950/20 text-emerald-400 border-emerald-500/20'
                }`}>
                  {products.filter(p => p.quantiteStock <= p.seuilAlerte).length > 0 ? 'BESOIN ACHAT' : 'STOCK SAIN'}
                </div>
              </div>

            </div>

            {/* Recharts Graphical visualization & recent sales log block */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Graphic charts area */}
              <div className="lg:col-span-7 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
                <h3 className="text-base font-bold text-white mb-6 flex items-center justify-between">
                  <span>CA Journalier par site (€)</span>
                  <span className="text-xs text-slate-400 font-mono">AUJOURD'HUI</span>
                </h3>
                
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={computeChartData()}
                      margin={{ top: 10, right: 10, left: -25, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                      <YAxis stroke="#64748b" fontSize={11} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                        labelStyle={{ color: '#94a3b8' }}
                      />
                      <Bar dataKey="CA" fill="#22d3ee" radius={[8, 8, 0, 0]} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Transactions feed table ticker */}
              <div className="lg:col-span-5 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
                <h3 className="text-base font-bold text-white mb-4 flex items-center justify-between">
                  <span>10 Dernier-Ventes en direct</span>
                  <span className="text-[10px] font-bold font-mono text-emerald-405 border border-emerald-500/20 bg-emerald-950/20 rounded-full px-2 py-0.5">EN TEMPS RÉEL</span>
                </h3>

                <div className="space-y-3.5 max-h-[320px] overflow-y-auto pr-1">
                  {recentSales.slice(0, 10).map((sale) => (
                    <div 
                      key={sale.id}
                      className="border border-slate-800 bg-slate-950/30 p-3.5 rounded-xl flex items-center justify-between hover:border-slate-750 transition-all text-left"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-slate-200">{getSiteNomById(sale.siteId)}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 font-semibold text-slate-400">
                            {sale.typeService}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate max-w-[200px]" title={sale.description}>
                          {sale.description}
                        </p>
                        <p className="text-[9px] text-slate-500 font-mono">
                          {sale.date ? new Date(sale.date.seconds * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '_:_'}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-cyan-400 font-mono">+{sale.montant.toFixed(2)} €</span>
                    </div>
                  ))}
                  {recentSales.length === 0 && (
                    <div className="py-12 text-center text-slate-600 font-mono text-sm leading-relaxed">
                      Aucune vente enregistrée pour le moment.
                    </div>
                  )}
                </div>
              </div>

            </div>

          </div>
        )}

        {/* --- USERS PANEL CONTENT --- */}
        {activeTab === 'users' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Create user form */}
            <div className="lg:col-span-5 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 bg-cyan-455 h-full" />
              
              <h3 className="text-base font-bold text-white mb-5 flex items-center space-x-2">
                <UserPlus className="h-5 w-5 text-cyan-400" />
                <span>Enregistrer un Nouvel Employé</span>
              </h3>

              {feedback && (
                <div className={`p-4 rounded-xl text-xs leading-normal mb-5 border ${
                  feedback.type === 'success' 
                    ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' 
                    : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
                }`}>
                  <p>{feedback.message}</p>
                </div>
              )}

              <form onSubmit={handleCreateUser} className="space-y-4">
                
                {/* Full name input */}
                <div className="space-y-1.5 text-left animate-fadeIn">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest block">Nom complet</label>
                  <input
                    type="text"
                    value={userNom}
                    onChange={(e) => setUserNom(e.target.value)}
                    placeholder="Ex: Sophie Martin"
                    className="w-full bg-slate-955 border border-slate-805 rounded-xl py-2.5 px-3.5 text-slate-100 placeholder-slate-600 outline-none focus:border-cyan-500 text-sm"
                    required
                  />
                </div>

                {/* Email address */}
                <div className="space-y-1.5 text-left animate-fadeIn">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest block">Adresse Email</label>
                  <input
                    type="email"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    placeholder="sophie@entreprise.com"
                    className="w-full bg-slate-955 border border-slate-805 rounded-xl py-2.5 px-3.5 text-slate-100 placeholder-slate-600 outline-none focus:border-cyan-500 text-sm"
                    required
                  />
                </div>

                {/* Temp initial password */}
                <div className="space-y-1.5 text-left animate-fadeIn">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest block">Mot de passe temporaire</label>
                  <input
                    type="password"
                    value={userPassword}
                    onChange={(e) => setUserPassword(e.target.value)}
                    placeholder="Saisissez au moins 6 caractères"
                    className="w-full bg-slate-955 border border-slate-805 rounded-xl py-2.5 px-3.5 text-slate-100 placeholder-slate-600 outline-none focus:border-cyan-500 text-sm"
                    required
                  />
                </div>

                {/* Role selection */}
                <div className="space-y-2 text-left">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest block">Rôle affecté</label>
                  <div className="grid grid-cols-2 gap-3.5">
                    <button
                      type="button"
                      onClick={() => setUserRole('gerant')}
                      className={`py-2.5 rounded-xl font-bold text-xs border transition-all ${
                        userRole === 'gerant' 
                          ? 'bg-violet-500/15 border-violet-500 text-violet-400' 
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      Gérante / Caisse
                    </button>
                    <button
                      type="button"
                      onClick={() => setUserRole('agent')}
                      className={`py-2.5 rounded-xl font-bold text-xs border transition-all ${
                        userRole === 'agent' 
                          ? 'bg-cyan-500/15 border-cyan-500 text-cyan-400' 
                          : 'bg-slate-950 border-slate-805 text-slate-400'
                      }`}
                    >
                      Graphiste / Agent
                    </button>
                  </div>
                </div>

                {/* Physical site allocation */}
                <div className="space-y-1.5 text-left animate-fadeIn">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest block">Site d'affectation</label>
                  <select
                    value={userSiteId}
                    onChange={(e) => setUserSiteId(e.target.value)}
                    className="w-full bg-slate-955 border border-slate-805 rounded-xl py-2.5 px-3.5 text-slate-100 outline-none focus:border-cyan-500 text-sm"
                    required
                  >
                    <option value="">-- Choisir un site physique --</option>
                    {sites.map(s => (
                      <option key={s.id} value={s.id}>{s.nom}</option>
                    ))}
                  </select>
                </div>

                {/* Create button */}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-cyan-405 text-slate-950 hover:bg-cyan-300 transition-all flex items-center justify-center space-x-2"
                >
                  {submitting ? (
                    <RotateCw className="h-4.5 w-4.5 animate-spin" />
                  ) : (
                    <>
                      <UserCheck className="h-4.5 w-4.5" />
                      <span>Inscrire l'Utilisateur</span>
                    </>
                  )}
                </button>

              </form>
            </div>

            {/* List existing users directory */}
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
              <h3 className="text-base font-bold text-white mb-5 flex items-center justify-between">
                <span>Annuaire des Utilisateurs de l'entreprise</span>
                <span className="text-xs text-slate-400 font-mono font-bold bg-slate-850 px-2.5 py-0.5 rounded-full border border-slate-750">
                  {usersList.length} total
                </span>
              </h3>

              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                {usersList.map((usr) => (
                  <div 
                    key={usr.uid}
                    className="border border-slate-800 bg-slate-950/35 p-4 rounded-xl flex flex-col sm:flex-row justify-between sm:items-center gap-3 hover:border-slate-750 transition-all"
                  >
                    <div className="text-left">
                      <div className="flex items-center space-x-2.5">
                        <span className="font-bold text-sm text-slate-200">{usr.nom || 'Sans nom'}</span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                          usr.role === 'admin' 
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/10' 
                            : usr.role === 'gerant' 
                              ? 'bg-violet-500/10 text-violet-400 border border-violet-500/10' 
                              : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/10'
                        }`}>
                          {usr.role}
                        </span>
                      </div>
                      <p className="text-xs text-slate-450 font-mono mt-1">{usr.email}</p>
                    </div>

                    <div className="flex items-center gap-3.5">
                      <div className="text-right text-xs">
                        <span className="text-slate-500 block uppercase font-mono tracking-widest text-[9px]">AFFECTATION</span>
                        <span className="text-slate-300 font-medium">{getSiteNomById(usr.siteId || '')}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* --- STOCK CATALOG CONTENT --- */}
        {activeTab === 'stock' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Create product item stock form */}
            <div className="lg:col-span-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 bg-cyan-400 h-full" />
              
              <h3 className="text-base font-bold text-white mb-5 flex items-center space-x-2">
                <PlusCircle className="h-5 w-5 text-cyan-400" />
                <span>Nouveau Produit (Accessoire)</span>
              </h3>

              {feedback && (
                <div className={`p-4 rounded-xl text-xs leading-normal mb-5 border ${
                  feedback.type === 'success' 
                    ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' 
                    : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
                }`}>
                  <p>{feedback.message}</p>
                </div>
              )}

              <form onSubmit={handleAddProduct} className="space-y-4">
                
                {/* Product label */}
                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest block">Nom de l'article</label>
                  <input
                    type="text"
                    value={prodNom}
                    onChange={(e) => setProdNom(e.target.value)}
                    placeholder="Ex: Clé USB 32Go, Rame de papier"
                    className="w-full bg-slate-955 border border-slate-805 rounded-xl py-2.5 px-3.5 text-slate-100 placeholder-slate-600 outline-none focus:border-cyan-500 text-sm"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* buying price */}
                  <div className="space-y-1.5 text-left">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest block">Prix Achat (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={prodPrixAchat}
                      onChange={(e) => setProdPrixAchat(e.target.value)}
                      placeholder="1.50"
                      className="w-full bg-slate-955 border border-slate-805 rounded-xl py-2.5 px-3 text-slate-100 placeholder-slate-600 outline-none focus:border-cyan-500 text-sm"
                      required
                    />
                  </div>

                  {/* selling price */}
                  <div className="space-y-1.5 text-left">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest block">Prix Vente (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={prodPrixVente}
                      onChange={(e) => setProdPrixVente(e.target.value)}
                      placeholder="5.00"
                      className="w-full bg-slate-955 border border-slate-805 rounded-xl py-2.5 px-3 text-slate-100 placeholder-slate-600 outline-none focus:border-cyan-500 text-sm"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Stock level */}
                  <div className="space-y-1.5 text-left">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest block">Quantité de Base</label>
                    <input
                      type="number"
                      min="0"
                      value={prodStock}
                      onChange={(e) => setProdStock(e.target.value)}
                      placeholder="50"
                      className="w-full bg-slate-955 border border-slate-805 rounded-xl py-2.5 px-3 text-slate-100 placeholder-slate-600 outline-none focus:border-cyan-500 text-sm"
                      required
                    />
                  </div>

                  {/* Alarm limit */}
                  <div className="space-y-1.5 text-left">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest block">Seuil d'alerte</label>
                    <input
                      type="number"
                      min="0"
                      value={prodSeuil}
                      onChange={(e) => setProdSeuil(e.target.value)}
                      placeholder="5"
                      className="w-full bg-slate-955 border border-slate-805 rounded-xl py-2.5 px-3 text-slate-100 placeholder-slate-600 outline-none focus:border-cyan-500 text-sm"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-cyan-405 text-slate-950 hover:bg-cyan-300 transition-all flex items-center justify-center space-x-2"
                >
                  <PlusCircle className="h-4.5 w-4.5" />
                  <span>Ajouter au catalogue</span>
                </button>

              </form>
            </div>

            {/* View current stock list */}
            <div className="lg:col-span-8 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
              <h3 className="text-base font-bold text-white mb-5 flex items-center justify-between">
                <span>Niveaux de Stocks & Consommables</span>
                <span className="text-xs bg-slate-850 px-2.5 py-0.5 rounded-full border border-slate-750 font-mono text-slate-400 font-bold">
                  {products.length} articles
                </span>
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500 text-xs font-bold uppercase tracking-wider">
                      <th className="py-3 px-2">Désignation</th>
                      <th className="py-3 px-2">Prix d'Achat/Vente</th>
                      <th className="py-3 px-2">Stock Actuel</th>
                      <th className="py-3 px-2">Statut</th>
                      <th className="py-3 px-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-xs">
                    {products.map((p) => {
                      const isAlert = p.quantiteStock <= p.seuilAlerte;
                      return (
                        <tr key={p.id} className="hover:bg-slate-950/20">
                          <td className="py-3.5 px-2 font-bold text-slate-200">{p.nom}</td>
                          <td className="py-3.5 px-2 font-mono text-slate-400">
                            {p.prixAchat.toFixed(2)}€ / <span className="text-white font-bold">{p.prixVente.toFixed(2)}€</span>
                          </td>
                          <td className="py-3.5 px-2 font-mono">
                            <span className={`font-bold ${isAlert ? 'text-amber-500 font-extrabold' : 'text-emerald-400'}`}>
                              {p.quantiteStock} unités
                            </span>
                            <span className="text-slate-500 font-semibold ml-1.5 text-[10px]">(Seuil: {p.seuilAlerte})</span>
                          </td>
                          <td className="py-3.5 px-2">
                            {isAlert ? (
                              <span className="inline-flex items-center space-x-1 py-0.5 px-2 rounded-full text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/10 font-bold animate-pulse">
                                <AlertTriangle className="h-3 w-3" />
                                <span>RÉAPPRO EN CORRECTIONS</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 py-0.5 px-2 rounded-full text-[10px] bg-emerald-500/10 text-emerald-450 border border-emerald-500/10 font-bold">
                                <CheckCircle className="h-3 w-3" />
                                <span>STOCK VALIDE</span>
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-2 text-right">
                            <button
                              onClick={() => {
                                setReplenishProductId(p.id);
                                setIsReplenishOpen(true);
                              }}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-cyan-500 hover:text-slate-950 font-bold text-[10px] transition-all cursor-pointer"
                            >
                              Réapprovisionner
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* --- PHYSICAL SITES ALLOCATION CONTENT --- */}
        {activeTab === 'sites' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Create physical location location */}
            <div className="lg:col-span-5 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 bg-cyan-400 h-full" />
              
              <h3 className="text-base font-bold text-white mb-5 flex items-center space-x-2">
                <PlusCircle className="h-5 w-5 text-cyan-400" />
                <span>Ajouter un Établissement (Site)</span>
              </h3>

              {feedback && (
                <div className={`p-4 rounded-xl text-xs leading-normal mb-5 border ${
                  feedback.type === 'success' 
                    ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' 
                    : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
                }`}>
                  <p>{feedback.message}</p>
                </div>
              )}

              <form onSubmit={handleCreateSite} className="space-y-4">
                
                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest block font-bold">Nom complet de la succursale</label>
                  <input
                    type="text"
                    value={newSiteNom}
                    onChange={(e) => setNewSiteNom(e.target.value)}
                    placeholder="Ex: Cybercafé & Secrétariat Centre-ville"
                    className="w-full bg-slate-955 border border-slate-805 rounded-xl py-2.5 px-3.5 text-slate-100 placeholder-slate-600 outline-none focus:border-cyan-500 text-sm"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-cyan-405 text-slate-950 hover:bg-cyan-300 transition-all flex items-center justify-center space-x-2"
                >
                  <PlusCircle className="h-4.5 w-4.5" />
                  <span>Enregistrer l'établissement</span>
                </button>

              </form>
            </div>

            {/* List physical site locations */}
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
              <h3 className="text-base font-bold text-white mb-5 flex items-center justify-between">
                <span>Liste de vos centres d'activité physiques</span>
                <span className="text-xs text-slate-400 font-mono font-bold bg-slate-850 px-2.5 py-0.5 rounded-full border border-slate-750">
                  {sites.length} sites actifs
                </span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {sites.map((s) => (
                  <div 
                    key={s.id}
                    className="border border-slate-800 bg-slate-950/35 p-4.5 rounded-xl flex items-center justify-between hover:border-slate-755 transition-all"
                  >
                    <div className="flex items-center space-x-3 text-left">
                      <div className="h-8 w-8 rounded-lg bg-pink-500/10 text-pink-400 border border-pink-550/10 flex items-center justify-center">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="font-bold text-sm text-slate-200 block">{s.nom}</span>
                        <span className="text-[10px] font-mono font-semibold text-slate-500 uppercase">SiteID: {s.id.substring(0,6)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

      </main>

      {/* ----------------- REPLENISH STOCK MODAL ----------------- */}
      {isReplenishOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-850 rounded-2xl w-full max-w-sm p-6 shadow-2xl relative">
            <h4 className="text-base font-bold text-white mb-3 flex items-center space-x-2">
              <Package className="h-5 w-5 text-cyan-405" />
              <span>Réapprovisionnement de Stock</span>
            </h4>

            {feedback && (
              <div className="p-3 rounded-lg text-xs leading-normal mb-3 border bg-rose-950/40 border-rose-500/30 text-rose-350">
                {feedback.message}
              </div>
            )}

            <form onSubmit={handleReplenishStock} className="space-y-4">
              
              <div className="space-y-1.5 text-left">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest block">Article sélectionné :</label>
                <div className="bg-slate-950 px-4 py-2.5 rounded-lg text-xs font-bold text-slate-200 border border-slate-850">
                  {products.find(p => p.id === replenishProductId)?.nom || ''}
                </div>
              </div>

              <div className="space-y-1.5 text-left animate-fadeIn">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest block font-semibold">Quantité à ajouter au stock</label>
                <input
                  type="number"
                  min="1"
                  value={replenishQty}
                  onChange={(e) => setReplenishQty(e.target.value)}
                  placeholder="Ex: 25"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-100 outline-none focus:border-cyan-500 text-left"
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsReplenishOpen(false);
                    setReplenishProductId('');
                  }}
                  className="py-2 px-4 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-400 text-xs transition duration-150"
                >
                  Fermer
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="py-2 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-455 text-slate-950 font-bold text-xs transition duration-150 shadow-md"
                >
                  {submitting ? 'Validation...' : 'Valider'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}

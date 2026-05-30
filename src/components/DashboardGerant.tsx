import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineStatus } from '../contexts/OnlineStatusContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, 
  addDoc, 
  doc, 
  getDoc,
  updateDoc, 
  query, 
  where, 
  onSnapshot, 
  serverTimestamp,
  runTransaction
} from 'firebase/firestore';
import { 
  PlusCircle, 
  Clock, 
  CheckCircle, 
  XCircle, 
  FileText, 
  User, 
  Euro, 
  Layers, 
  AlertCircle,
  HelpCircle,
  LogOut,
  Wifi,
  WifiOff,
  ShoppingBag,
  CreditCard,
  Check,
  Ban,
  TrendingUp,
  Inbox,
  Sparkles,
  ChevronRight,
  Package,
  Calendar
} from 'lucide-react';

interface OrderItem {
  id: string;
  client: string;
  description: string;
  montantEstime: number;
  typeService: string;
  statut: 'en_attente' | 'validee' | 'rejetee';
  commentaireRejet?: string;
  dateCreation: any;
  agentUid: string;
  siteId: string;
}

interface ProductItem {
  id: string;
  nom: string;
  prixVente: number;
  quantiteStock: number;
  seuilAlerte: number;
}

interface SaleItem {
  id: string;
  typeService: string;
  montant: number;
  quantite: number;
  description: string;
  date: any;
  siteNom?: string;
}

export default function DashboardGerant() {
  const { currentUser, userProfile, logout } = useAuth();
  const { isOnline } = useOnlineStatus();
  
  // Tabs
  const [activeTab, setActiveTab] = useState<'caisse' | 'validation'>('caisse');
  
  // Global site info
  const [siteNom, setSiteNom] = useState<string>('Chargement du site...');
  const [siteTotalToday, setSiteTotalToday] = useState<number>(0);
  
  // Products definition (for Accessoires)
  const [products, setProducts] = useState<ProductItem[]>([]);
  
  // Pending orders
  const [pendingOrders, setPendingOrders] = useState<OrderItem[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  
  // Modal stats for Caisse
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalService, setModalService] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [amount, setAmount] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [directDescription, setDirectDescription] = useState('');
  
  // Rejection modal
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null);
  const [rejectionPhrase, setRejectionPhrase] = useState('');
  
  // Order Validaion/Price amendment state
  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
  const [valOrderId, setValOrderId] = useState<string | null>(null);
  const [valProposedPrice, setValProposedPrice] = useState('');
  const [valDescription, setValDescription] = useState('');
  const [valService, setValService] = useState('');
  const [valClient, setValClient] = useState('');
  const [valAgentUid, setValAgentUid] = useState('');

  // Status feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Fetch Site Details
  useEffect(() => {
    if (!userProfile?.siteId) return;
    
    const docRef = doc(db, 'sites', userProfile.siteId);
    getDoc(docRef).then((snap) => {
      if (snap.exists()) {
        setSiteNom(snap.data().nom);
      } else {
        setSiteNom('Site inconnu');
      }
    }).catch(err => {
      console.error(err);
      setSiteNom('Erreur chargement site');
    });
  }, [userProfile?.siteId]);

  // Fetch Products catalog (Accessories)
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

  // Live query for Today's Sales from this site to compute "CA du jour"
  useEffect(() => {
    if (!userProfile?.siteId) return;
    
    // Create timestamps representing start of today (local or UTC)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const q = query(
      collection(db, 'ventes'),
      where('siteId', '==', userProfile.siteId),
      where('date', '>=', startOfToday)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let total = 0;
      snapshot.forEach((doc) => {
        const v = doc.data();
        total += parseFloat(v.montant || '0');
      });
      setSiteTotalToday(total);
    }, (error) => {
      console.error("Erreur d'écoute CA du jour :", error);
    });

    return () => unsubscribe();
  }, [userProfile?.siteId]);

  // Live listen for pending orders at this specific site
  useEffect(() => {
    if (!userProfile?.siteId) return;

    setLoadingOrders(true);
    const q = query(
      collection(db, 'commandes'),
      where('siteId', '==', userProfile.siteId),
      where('statut', '==', 'en_attente')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: OrderItem[] = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as OrderItem);
      });
      
      // Sort client-side for ease
      items.sort((a, b) => {
        const t1 = a.dateCreation?.seconds || 0;
        const t2 = b.dateCreation?.seconds || 0;
        return t2 - t1;
      });

      setPendingOrders(items);
      setLoadingOrders(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'commandes');
      setLoadingOrders(false);
    });

    return () => unsubscribe();
  }, [userProfile?.siteId]);

  const openSaisieModal = (service: string) => {
    setModalService(service);
    setSelectedProductId('');
    setAmount('');
    setQuantity('1');
    setDirectDescription('');
    setIsModalOpen(true);
    setFeedback(null);
  };

  // Auto-fill amount if dynamic product accessory is chosen
  const handleProductChange = (pId: string) => {
    setSelectedProductId(pId);
    const prod = products.find(p => p.id === pId);
    if (prod) {
      const q = parseInt(quantity) || 1;
      setAmount((prod.prixVente * q).toFixed(2));
    }
  };

  const handleQuantityInModalChange = (valStr: string) => {
    setQuantity(valStr);
    const q = parseInt(valStr) || 1;
    if (selectedProductId) {
      const prod = products.find(p => p.id === selectedProductId);
      if (prod) {
        setAmount((prod.prixVente * q).toFixed(2));
      }
    }
  };

  // Submit direct sale and decrement stock if option is chosen
  const handleDirectSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !quantity) {
      setFeedback({ type: 'error', message: 'Veuillez saisir le montant et la quantité.' });
      return;
    }

    const priceNum = parseFloat(amount);
    const qtyNum = parseInt(quantity);
    if (isNaN(priceNum) || priceNum <= 0 || isNaN(qtyNum) || qtyNum <= 0) {
      setFeedback({ type: 'error', message: 'Veuillez entrer des valeurs numériques positives.' });
      return;
    }

    if (modalService === 'Accessoire' && !selectedProductId) {
      setFeedback({ type: 'error', message: 'Veuillez sélectionner un accessoire dans le stock.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      await runTransaction(db, async (transaction) => {
        // If Accessory, check and decrement stock
        let prodNom = '';
        if (modalService === 'Accessoire' && selectedProductId) {
          const prodRef = doc(db, 'produits', selectedProductId);
          const prodSnap = await transaction.get(prodRef);
          
          if (!prodSnap.exists()) {
            throw new Error("L'accessoire sélectionné n'existe pas en stock.");
          }

          const currentStock = prodSnap.data().quantiteStock || 0;
          if (currentStock < qtyNum) {
            throw new Error(`Stock insuffisant (${currentStock} disponible${currentStock > 1 ? 's' : ''}).`);
          }

          // Decrement Stock
          transaction.update(prodRef, {
            quantiteStock: currentStock - qtyNum
          });
          prodNom = prodSnap.data().nom;
        }

        // Add sale transaction
        const saleRef = doc(collection(db, 'ventes'));
        transaction.set(saleRef, {
          siteId: userProfile?.siteId,
          gerantUid: currentUser?.uid,
          typeService: modalService,
          produitId: selectedProductId || null,
          description: directDescription.trim() || `${modalService} en direct` + (prodNom ? ` (${prodNom})` : ''),
          montant: priceNum,
          quantite: qtyNum,
          date: serverTimestamp()
        });
      });

      setFeedback({ type: 'success', message: 'Vente directe enregistrée et stock mis à jour !' });
      setTimeout(() => {
        setIsModalOpen(false);
        setFeedback(null);
      }, 1000);
    } catch (err: any) {
      console.error(err);
      setFeedback({ type: 'error', message: err.message || "Erreur lors de l'enregistrement de la vente." });
    } finally {
      setSubmitting(false);
    }
  };

  // Open amendment validation modal
  const openValidateModal = (order: OrderItem) => {
    setValOrderId(order.id);
    setValProposedPrice(String(order.montantEstime));
    setValDescription(order.description);
    setValService(order.typeService);
    setValClient(order.client);
    setValAgentUid(order.agentUid);
    setIsValidationModalOpen(true);
    setFeedback(null);
  };

  // Validate Order -> update statut to validee + log a selling transaction automatically
  const handleValidateOrderConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valOrderId || !valProposedPrice) return;

    setSubmitting(true);
    setFeedback(null);

    const validatedPrice = parseFloat(valProposedPrice);
    if (isNaN(validatedPrice) || validatedPrice < 0) {
      setFeedback({ type: 'error', message: 'Saisissez un coût valide.' });
      setSubmitting(false);
      return;
    }

    try {
      await runTransaction(db, async (transaction) => {
        const orderRef = doc(db, 'commandes', valOrderId);
        
        // 1. Mark as verified
        transaction.update(orderRef, {
          statut: 'validee',
          montantEstime: validatedPrice,
          dateValidation: serverTimestamp()
        });

        // 2. Generate sale transition
        const saleRef = doc(collection(db, 'ventes'));
        transaction.set(saleRef, {
          siteId: userProfile?.siteId,
          gerantUid: currentUser?.uid,
          agentUid: valAgentUid,
          typeService: valService,
          description: `Commande validée : ${valClient} - ${valDescription}`,
          montant: validatedPrice,
          quantite: 1,
          date: serverTimestamp()
        });
      });

      setFeedback({ type: 'success', message: 'Commande approuvée et transformée en vente !' });
      setTimeout(() => {
        setIsValidationModalOpen(false);
        setValOrderId(null);
        setFeedback(null);
      }, 1000);
    } catch (err: any) {
      console.error(err);
      setFeedback({ type: 'error', message: "Erreur lors de la validation." });
    } finally {
      setSubmitting(false);
    }
  };

  // Settle ordering denial rejection modal
  const openRejectionDialog = (orderId: string) => {
    setRejectingOrderId(orderId);
    setRejectionPhrase('');
    setIsRejectModalOpen(true);
    setFeedback(null);
  };

  const handleDenyOrderConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingOrderId || !rejectionPhrase.trim()) {
      setFeedback({ type: 'error', message: 'Un motif de rejet est obligatoire.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const orderRef = doc(db, 'commandes', rejectingOrderId);
      await updateDoc(orderRef, {
        statut: 'rejetee',
        commentaireRejet: rejectionPhrase.trim(),
        dateValidation: serverTimestamp()
      });

      setFeedback({ type: 'success', message: 'Commande rejetée avec les remarques voulues.' });
      setTimeout(() => {
        setIsRejectModalOpen(false);
        setRejectingOrderId(null);
        setFeedback(null);
      }, 1000);
    } catch (err: any) {
      console.error(err);
      setFeedback({ type: 'error', message: "Erreur lors du rejet." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-910 text-slate-100 flex flex-col font-sans">
      
      {/* Navbar header */}
      <header className="bg-slate-900 border-b border-slate-800 py-4 px-6 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          
          <div className="flex items-center space-x-3.5">
            <div className="h-10 w-10 rounded-xl bg-violet-600/15 border border-violet-500/20 flex items-center justify-center text-violet-400">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">Espace Gérant-Caisse</h1>
              <p className="text-xs text-rose-350 font-medium font-mono uppercase bg-slate-800 px-2.5 py-0.5 rounded-md inline-block border border-slate-750">
                Site : <span className="text-white font-semibold">{siteNom}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Online Indicator */}
            <div className="flex items-center space-x-1.5 py-1 px-3 rounded-full bg-slate-800 border border-slate-750">
              {isOnline ? (
                <>
                  <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-[11px] font-mono text-emerald-400 font-bold">LIGNE</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-[11px] font-mono text-amber-500 font-bold">HORS-LIGNE | CACHE ACTIVE</span>
                </>
              )}
            </div>

            {/* Profile Info */}
            <div className="text-right text-xs">
              <span className="block font-semibold text-slate-200">{userProfile?.nom || currentUser?.email}</span>
              <span className="text-[10px] uppercase font-mono text-violet-400">Gérante de Caisse</span>
            </div>

            {/* Logout */}
            <button
              onClick={logout}
              title="Se déconnecter"
              className="p-2 rounded-lg bg-slate-800 hover:bg-rose-955/40 hover:text-rose-400 border border-slate-700 transition-colors"
            >
              <LogOut className="h-4.5 w-4.5" />
            </button>
          </div>

        </div>
      </header>

      {/* Main Container */}
      <main className="flex-grow max-w-7xl w-full mx-auto p-6 space-y-6">
        
        {/* Statistics Block */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Daily site sales display */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex items-center justify-between shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500" />
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-450 uppercase tracking-widest block">Recettes du Jour (Site local)</span>
              <span className="text-3xl font-extrabold tracking-tight text-white font-mono">{siteTotalToday.toFixed(2)} €</span>
            </div>
            <div className="py-2.5 px-3 bg-emerald-950/20 rounded-xl border border-emerald-500/20 text-emerald-400 flex items-center space-x-1">
              <Sparkles className="h-5 w-5 animate-pulse" />
              <span className="text-[10px] font-bold font-mono">EN DIRECT</span>
            </div>
          </div>

          {/* Pending Queue volume */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex items-center justify-between shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-violet-500" />
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-450 uppercase tracking-widest block">Validation commandes agents</span>
              <span className="text-3xl font-extrabold tracking-tight text-white font-mono">{pendingOrders.length}</span>
            </div>
            <div className={`py-1.5 px-3 rounded-xl border font-mono text-xs font-bold ${
              pendingOrders.length > 0 
                ? 'bg-amber-950/20 text-amber-400 border-amber-500/20' 
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}>
              {pendingOrders.length > 0 ? 'ATTENTION REQUIS' : 'A JOUR'}
            </div>
          </div>
        </div>

        {/* Tab System Selector */}
        <div className="flex border-b border-slate-800">
          <button
            onClick={() => setActiveTab('caisse')}
            className={`py-3.5 px-6 font-bold text-sm border-b-2 transition-all flex items-center space-x-2 ${
              activeTab === 'caisse' 
                ? 'border-violet-500 text-violet-400 bg-slate-900/40' 
                : 'border-transparent text-slate-400 hover:text-slate-205'
            }`}
          >
            <CreditCard className="h-4.5 w-4.5" />
            <span>Caisse Tactile direct (Saisie)</span>
          </button>
          
          <button
            onClick={() => setActiveTab('validation')}
            className={`py-3.5 px-6 font-bold text-sm border-b-2 transition-all flex items-center space-x-2 relative ${
              activeTab === 'validation' 
                ? 'border-violet-500 text-violet-400 bg-slate-900/40' 
                : 'border-transparent text-slate-400 hover:text-slate-205'
            }`}
          >
            <Clock className="h-4.5 w-4.5" />
            <span>Validation travaux d'Agents</span>
            {pendingOrders.length > 0 && (
              <span className="absolute top-2 right-1.5 bg-rose-500 text-white font-bold text-[9px] h-4.5 min-w-4.5 px-1 rounded-full flex items-center justify-center animate-bounce">
                {pendingOrders.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab panes */}
        {activeTab === 'caisse' ? (
          <div className="space-y-6">
            <h3 className="text-slate-200 text-sm font-semibold uppercase tracking-wider">Cliquez sur un service pour enregistrer une vente :</h3>
            
            {/* Cash register pad layout */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {[
                { name: 'Impression', color: 'from-amber-600/20 to-amber-900/10 border-amber-500/20 hover:border-amber-400/50 text-amber-300' },
                { name: 'Photocopie', color: 'from-blue-600/20 to-blue-900/10 border-blue-500/20 hover:border-blue-400/50 text-blue-300' },
                { name: 'Accessoire', color: 'from-emerald-600/20 to-emerald-900/10 border-emerald-500/20 hover:border-emerald-400/50 text-emerald-300_sub' },
                { name: 'Secrétariat', color: 'from-violet-600/20 to-violet-900/10 border-violet-500/20 hover:border-violet-400/50 text-violet-300' },
                { name: 'Cyber', color: 'from-pink-600/20 to-pink-905/10 border-pink-500/20 hover:border-pink-450/40 text-pink-300' },
              ].map((serv) => (
                <button
                  key={serv.name}
                  onClick={() => openSaisieModal(serv.name)}
                  className={`bg-slate-900/80 hover:bg-slate-900 p-6 rounded-2xl border flex flex-col items-center justify-center text-center gap-3.5 transition-all active:scale-95 shadow-lg group cursor-pointer`}
                >
                  <div className={`h-12 w-12 rounded-full flex items-center justify-center bg-gradient-to-br ${serv.color}`}>
                    {serv.name === 'Impression' && <FileText className="h-6 w-6" />}
                    {serv.name === 'Photocopie' && <Layers className="h-6 w-6" />}
                    {serv.name === 'Accessoire' && <ShoppingBag className="h-6 w-6 text-emerald-400" />}
                    {serv.name === 'Secrétariat' && <User className="h-6 w-6 text-violet-400" />}
                    {serv.name === 'Cyber' && <PlusCircle className="h-6 w-6 text-pink-400" />}
                  </div>
                  <span className="font-bold text-sm tracking-wide text-slate-200 group-hover:text-white transition-colors">
                    {serv.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Validation queue pane */
          <div className="space-y-6">
            <h3 className="text-slate-250 text-sm font-semibold uppercase tracking-wider">Demandes soumises par vos agents en attente d'approbation :</h3>
            
            {loadingOrders ? (
              <div className="py-20 text-center text-slate-500">
                <span className="inline-block animate-spin h-6 w-6 border-2 border-slate-700 border-t-violet-500 rounded-full mb-2" />
                <p className="font-mono text-sm">Chargement des commandes de l'agence...</p>
              </div>
            ) : pendingOrders.length === 0 ? (
              <div className="py-20 border border-dashed border-slate-850 rounded-2xl text-center bg-slate-900/10">
                <Inbox className="h-12 w-12 text-slate-650 mx-auto mb-4" />
                <p className="text-sm font-semibold text-slate-350">Aucune commande en attente de caisse</p>
                <p className="text-xs text-slate-500 mt-1">Dès qu'un opérateur ou graphiste soumet des travaux, ils apparaitront ici instantanément.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {pendingOrders.map((order) => (
                  <div 
                    key={order.id} 
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-base text-white">{order.client}</span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-violet-400/10 text-violet-350 border border-violet-500/15 uppercase tracking-wide">
                            {order.typeService}
                          </span>
                        </div>
                        <span className="inline-flex items-center space-x-1 py-0.5 px-2 rounded-full text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/10 font-bold">
                          <Clock className="h-3 w-3" />
                          <span>EN ATTENTE</span>
                        </span>
                      </div>

                      {/* Description */}
                      <p className="text-xs text-slate-400 leading-normal mb-4 bg-slate-950/45 p-3 rounded-lg border border-slate-850">
                        {order.description}
                      </p>

                      <div className="flex flex-col space-y-1 bg-slate-910 p-3 rounded-lg text-xs leading-none">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Montant proposé par l'agent :</span>
                          <span className="text-white font-bold font-mono">{order.montantEstime.toFixed(2)} €</span>
                        </div>
                      </div>
                    </div>

                    {/* Operational approvals actions */}
                    <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-slate-800/60">
                      <button
                        onClick={() => openRejectionDialog(order.id)}
                        className="py-2.5 px-4 rounded-xl border border-rose-500/25 hover:border-rose-500/40 hover:bg-rose-955/15 text-rose-400 text-xs font-bold transition-all flex items-center justify-center space-x-1.5 active:scale-95"
                      >
                        <Ban className="h-4 w-4" />
                        <span>Rejeter pour motif</span>
                      </button>

                      <button
                        onClick={() => openValidateModal(order)}
                        className="py-2.5 px-4 rounded-xl bg-violet-500 hover:bg-violet-455 text-white text-xs font-bold transition-all flex items-center justify-center space-x-1.5 shadow-[0_4px_10px_rgba(139,92,246,0.2)] active:scale-95"
                      >
                        <Check className="h-4 w-4" />
                        <span>Ajuster & Valider</span>
                      </button>
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>

      {/* ----------------- MODALS ----------------- */}

      {/* Direct Sale Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-850 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <h4 className="text-lg font-bold text-white mb-4 flex items-center space-x-2">
              <PlusCircle className="h-5 w-5 text-violet-400" />
              <span>Saisie direct - {modalService}</span>
            </h4>

            {feedback && (
              <div className={`p-3 rounded-lg text-xs font-mono leading-relaxed mb-4 border ${
                feedback.type === 'success' 
                  ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' 
                  : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
              }`}>
                {feedback.message}
              </div>
            )}

            <form onSubmit={handleDirectSaleSubmit} className="space-y-4">
              
              {/* Product accessory selection ONLY if Accessory category */}
              {modalService === 'Accessoire' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest block">Sélectionner l'article en stock</label>
                  <select
                    value={selectedProductId}
                    onChange={(e) => handleProductChange(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-3 text-slate-200 outline-none focus:border-violet-500 text-sm"
                    required
                  >
                    <option value="">-- Choisir un produit catalogue --</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id} disabled={p.quantiteStock === 0}>
                        {p.nom} (P.V: {p.prixVente.toFixed(2)}€ - Stock: {p.quantiteStock} dispo) {p.quantiteStock === 0 ? '[RUPTURE]' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Quantity */}
              <div className="space-y-1.5 animate-fadeIn">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest block">Quantité</label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => handleQuantityInModalChange(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-slate-100 placeholder-slate-600 outline-none focus:border-violet-500 text-sm"
                  required
                />
              </div>

              {/* Price / Montant */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest block">Montant Facturé unitaire ou total (€)</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-600">
                    <Euro className="h-4 w-4" />
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 pl-9 pr-3 text-slate-100 placeholder-slate-600 outline-none focus:border-violet-500 text-sm"
                    required
                  />
                </div>
              </div>

              {/* Comments / description */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest block">Compléments d'infos (Facultatif)</label>
                <input
                  type="text"
                  value={directDescription}
                  onChange={(e) => setDirectDescription(e.target.value)}
                  placeholder="Ex: Impression urgent papier épais, client pressé"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-3 text-slate-100 placeholder-slate-600 outline-none focus:border-violet-500 text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="py-2 px-4 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-400 text-xs transition duration-150"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="py-2 px-4 rounded-xl bg-violet-600 hover:bg-violet-550 text-white font-bold text-xs transition duration-150 shadow-md"
                >
                  {submitting ? 'Validation...' : 'Enregistrer la Vente'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Adjust / Validate Order Modal */}
      {isValidationModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-850 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <h4 className="text-lg font-bold text-white mb-4 flex items-center space-x-2">
              <Check className="h-5 w-5 text-emerald-400" />
              <span>Valider la commande - {valClient}</span>
            </h4>

            {feedback && (
              <div className={`p-3 rounded-lg text-xs leading-normal mb-4 border ${
                feedback.type === 'success' 
                  ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' 
                  : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
              }`}>
                {feedback.message}
              </div>
            )}

            <form onSubmit={handleValidateOrderConfirm} className="space-y-4">
              
              <div className="bg-slate-950/50 p-3 rounded-lg text-xs space-y-2 border border-slate-850 text-left">
                <span className="block text-slate-500">Instructions de la commande :</span>
                <span className="block text-slate-350">{valDescription}</span>
              </div>

              {/* Price adjustment input */}
              <div className="space-y-1.5 text-left">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest block">Montant Final Validé (€)</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-600">
                    <Euro className="h-4 w-4" />
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={valProposedPrice}
                    onChange={(e) => setValProposedPrice(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 pl-9 pr-3 text-slate-100 outline-none focus:border-violet-500 text-sm"
                    required
                  />
                </div>
                <span className="text-[10px] text-slate-500">Vous pouvez ajuster le montant selon la prestation finale réalisée.</span>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsValidationModalOpen(false);
                    setValOrderId(null);
                  }}
                  className="py-2 px-4 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-400 text-xs transition duration-150"
                >
                  Fermer
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="py-2 px-4 rounded-xl bg-violet-600 hover:bg-violet-550 text-white font-bold text-xs transition duration-150"
                >
                  {submitting ? 'Validation...' : 'Valider & Enregistrer'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Mandatory Rejection Comment Modal */}
      {isRejectModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-850 rounded-2xl w-full max-w-sm p-6 shadow-2xl relative">
            <h4 className="text-base font-bold text-white mb-3 flex items-center space-x-2">
              <Ban className="h-5 w-5 text-rose-450" />
              <span>Motif d'annulation de la commande</span>
            </h4>

            {feedback && (
              <div className="p-3 rounded-lg text-xs leading-normal mb-3 border bg-rose-950/40 border-rose-500/30 text-rose-350">
                {feedback.message}
              </div>
            )}

            <form onSubmit={handleDenyOrderConfirm} className="space-y-4">
              
              <div className="space-y-1.5 text-left">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-widest block">Remarques envoyées au graphiste/agent</label>
                <textarea
                  value={rejectionPhrase}
                  onChange={(e) => setRejectionPhrase(e.target.value)}
                  placeholder="Ex: Le client refuse le tarif proposé finalement ou description incomplète d'impression."
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-100 outline-none focus:border-rose-500/60 text-left resize-none"
                  required
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsRejectModalOpen(false);
                    setRejectingOrderId(null);
                  }}
                  className="py-2 px-4 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-400 text-xs transition duration-150"
                >
                  Fermer
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="py-2 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition duration-150 shadow-md"
                >
                  {submitting ? 'Validation...' : 'Enregistrer le rejet'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}

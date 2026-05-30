import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineStatus } from '../contexts/OnlineStatusContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp 
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
  WifiOff
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
  siteId: string;
}

export default function DashboardAgent() {
  const { currentUser, userProfile, logout } = useAuth();
  const { isOnline } = useOnlineStatus();
  
  // Form State
  const [client, setClient] = useState('');
  const [description, setDescription] = useState('');
  const [montantEstime, setMontantEstime] = useState('');
  const [typeService, setTypeService] = useState('Conception Graphique');
  
  // Orders State
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // Load agent command submissions
  useEffect(() => {
    if (!currentUser) return;

    setLoadingOrders(true);
    const q = query(
      collection(db, 'commandes'),
      where('agentUid', '==', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: OrderItem[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        items.push({
          id: doc.id,
          ...data
        } as OrderItem);
      });
      
      // Sort manually client side to avoid missing index errors in standard queries
      items.sort((a, b) => {
        const t1 = a.dateCreation?.seconds || 0;
        const t2 = b.dateCreation?.seconds || 0;
        return t2 - t1;
      });

      setOrders(items);
      setLoadingOrders(false);
    }, (error) => {
      // Use skill handler pattern
      handleFirestoreError(error, OperationType.LIST, 'commandes');
      setLoadingOrders(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !description || !montantEstime) {
      setFeedback({ type: 'error', message: 'Veuillez remplir tous les champs requis.' });
      return;
    }

    if (!userProfile?.siteId) {
      setFeedback({ type: 'error', message: "Aucun site d'affectation relié à votre profil. Contactez l'administrateur." });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    const price = parseFloat(montantEstime);
    if (isNaN(price) || price < 0) {
      setFeedback({ type: 'error', message: 'Le montant estimé doit être un nombre positif.' });
      setSubmitting(false);
      return;
    }

    try {
      const colPath = 'commandes';
      await addDoc(collection(db, colPath), {
        siteId: userProfile.siteId,
        agentUid: currentUser?.uid,
        client: client.trim(),
        description: description.trim(),
        montantEstime: price,
        typeService,
        statut: 'en_attente',
        dateCreation: serverTimestamp(),
      });

      setClient('');
      setDescription('');
      setMontantEstime('');
      setFeedback({ type: 'success', message: 'Commande soumise avec succès et en attente de caissière.' });
      
      // Clear toast success after 4 seconds
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      console.error(err);
      setFeedback({ type: 'error', message: "Erreur lors de la soumission de la commande." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-910 text-slate-100 flex flex-col font-sans">
      
      {/* Header section */}
      <header className="bg-slate-900 border-b border-slate-800 py-4 px-6 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          
          <div className="flex items-center space-x-3.5">
            <div className="h-10 w-10 rounded-xl bg-cyan-600/15 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">Espace Agent</h1>
              <p className="text-xs text-slate-400">Services Bureautiques Multi-Sites</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Online Badge */}
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
              <span className="text-[10px] uppercase font-mono text-cyan-400">Agent</span>
            </div>

            {/* Logout */}
            <button
              onClick={logout}
              title="Se déconnecter"
              className="p-2 rounded-lg bg-slate-800 hover:bg-rose-950/40 hover:text-rose-400 border border-slate-700 transition-colors"
            >
              <LogOut className="h-4.5 w-4.5" />
            </button>
          </div>

        </div>
      </header>

      {/* Main Grid View */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Submit New Task */}
        <section className="lg:col-span-5 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500" />
            
            <h2 className="text-base font-bold text-white mb-5 flex items-center space-x-2">
              <PlusCircle className="h-5 w-5 text-cyan-400" />
              <span>Soumettre un Travail (Commande)</span>
            </h2>

            {feedback && (
              <div className={`p-4 rounded-xl text-sm leading-relaxed mb-5 border ${
                feedback.type === 'success' 
                  ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' 
                  : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
              }`}>
                {feedback.message}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Type Category */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Type de Service
                </label>
                <select
                  value={typeService}
                  onChange={(e) => setTypeService(e.target.value)}
                  className="w-full bg-slate-910 border border-slate-800 rounded-xl px-3.5 py-2.5 text-slate-150 outline-none focus:border-cyan-500/50 text-sm transition-colors"
                >
                  <option value="Conception Graphique">Conception Graphique (Logo, Affiche)</option>
                  <option value="Saisie de texte">Saisie & Secrétariat</option>
                  <option value="Impression">Impression Spécifique (Livre, Flyers)</option>
                  <option value="Reliure Plastification">Reliure & Plastification</option>
                  <option value="Formations / Assistance">Cyber / Assistance Guidée</option>
                  <option value="Autre Service">Autre prestation</option>
                </select>
              </div>

              {/* Client Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Nom du Client
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
                    <User className="h-4.5 w-4.5" />
                  </span>
                  <input
                    type="text"
                    value={client}
                    onChange={(e) => setClient(e.target.value)}
                    placeholder="M. Dupont ou Entreprise X"
                    className="w-full bg-slate-910 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-slate-150 outline-none focus:border-cyan-500/50 text-sm transition-colors text-white"
                    required
                  />
                </div>
              </div>

              {/* Estimated Price */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Montant Estimé (€)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-505">
                    <Euro className="h-4.5 w-4.5 text-slate-400" />
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={montantEstime}
                    onChange={(e) => setMontantEstime(e.target.value)}
                    placeholder="25.00"
                    className="w-full bg-slate-910 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-slate-150 outline-none focus:border-cyan-500/50 text-sm transition-colors text-white"
                    required
                  />
                </div>
              </div>

              {/* Task Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Détail / Instructions du travails
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Impression de 50 rapports avec couverture couleur brillante transparent & spirale noire."
                  rows={4}
                  className="w-full bg-slate-910 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-150 outline-none focus:border-cyan-500/50 text-sm transition-colors text-white resize-none"
                  required
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 rounded-xl font-bold text-sm text-slate-950 bg-cyan-400 hover:bg-cyan-300 transition-all flex items-center justify-center space-x-2 shadow-lg disabled:opacity-50"
              >
                <span>{submitting ? 'Envoi en cours...' : 'Soumettre à la caissière'}</span>
              </button>

            </form>
          </div>
        </section>

        {/* Right Column: History of works submitted */}
        <section className="lg:col-span-7 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h2 className="text-base font-bold text-white mb-5 flex items-center justify-between">
              <span className="flex items-center space-x-2">
                <FileText className="h-5 w-5 text-cyan-400" />
                <span>Historique de mes travaux</span>
              </span>
              <span className="text-xs bg-slate-800 border border-slate-700 text-slate-400 py-1 px-2.5 rounded-full font-mono">
                {orders.length} commande{orders.length > 1 ? 's' : ''}
              </span>
            </h2>

            {loadingOrders ? (
              <div className="py-20 text-center text-slate-500 font-mono text-sm leading-relaxed">
                <div className="inline-block animate-spin h-5 w-5 border-2 border-slate-700 border-t-cyan-500 rounded-full mb-2"></div>
                <div>Chargement de l'historique...</div>
              </div>
            ) : orders.length === 0 ? (
              <div className="py-16 text-center text-slate-5s0 border border-dashed border-slate-800 rounded-xl bg-slate-910/30">
                <HelpCircle className="h-10 w-10 text-slate-650 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-400">Aucune commande soumise pour le moment</p>
                <p className="text-xs text-slate-500 mt-1">Utilisez le panneau de gauche pour ajouter vos premiers clients.</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                {orders.map((order) => (
                  <div 
                    key={order.id} 
                    className="border border-slate-800/80 hover:border-slate-750 bg-slate-950/30 hover:bg-slate-950/60 p-4.5 rounded-xl transition-all"
                  >
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 mb-3.5">
                      <div>
                        <div className="flex items-center space-x-2.5">
                          <span className="text-sm font-bold text-slate-200">{order.client}</span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-400/10 text-cyan-300 border border-cyan-500/10 uppercase tracking-widest">
                            {order.typeService}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                          {order.dateCreation ? new Date(order.dateCreation.seconds * 1000).toLocaleString('fr-FR') : 'En attente...'}
                        </p>
                      </div>

                      {/* Status Badges */}
                      <div>
                        {order.statut === 'en_attente' && (
                          <span className="inline-flex items-center space-x-1.5 py-1 px-3 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Clock className="h-3.5 w-3.5 text-amber-500" />
                            <span>En attente</span>
                          </span>
                        )}
                        {order.statut === 'validee' && (
                          <span className="inline-flex items-center space-x-1.5 py-1 px-3 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                            <span>Validée</span>
                          </span>
                        )}
                        {order.statut === 'rejetee' && (
                          <span className="inline-flex items-center space-x-1.5 py-1 px-3 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            <XCircle className="h-3.5 w-3.5 text-rose-450" />
                            <span>Rejetée</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    <div className="bg-slate-950/55 rounded-lg p-3 text-sm text-slate-350 border border-slate-900 leading-relaxed font-sans mb-3 text-left">
                      {order.description}
                    </div>

                    <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 border-t border-slate-900 pt-3">
                      <div>
                        <span>Montant estimé : </span>
                        <span className="text-slate-200 font-bold font-mono">{order.montantEstime.toFixed(2)} €</span>
                      </div>
                    </div>

                    {/* Rejection comment */}
                    {order.statut === 'rejetee' && order.commentaireRejet && (
                      <div className="mt-3 bg-rose-950/30 border border-rose-900/40 text-rose-350 px-3.5 py-2.5 rounded-lg text-xs leading-normal">
                        <span className="font-bold text-rose-300 block mb-1">Motif du rejet de la gérante :</span>
                        <span>"{order.commentaireRejet}"</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

      </main>

    </div>
  );
}

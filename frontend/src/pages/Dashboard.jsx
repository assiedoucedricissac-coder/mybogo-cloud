import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import {
  TrendingUp, ShoppingCart, Package, Users, AlertTriangle,
  Wallet, BarChart3, Clock, CheckCircle, Star, ArrowUpRight,
  Zap, Activity, ShoppingBag, Banknote, Smartphone, CreditCard, ArrowLeftRight
} from 'lucide-react';

const ICONES_MODE = { especes: Banknote, mobile_money: Smartphone, carte: CreditCard, virement: ArrowLeftRight, mixte: Wallet };
const COULEURS_MODE = {
  especes: 'bg-gradient-to-br from-emerald-400 to-emerald-600',
  mobile_money: 'bg-gradient-to-br from-orange-400 to-orange-600',
  carte: 'bg-gradient-to-br from-blue-500 to-blue-700',
  virement: 'bg-gradient-to-br from-teal-400 to-teal-600',
  mixte: 'bg-gradient-to-br from-purple-400 to-purple-600',
};
import api from '../services/api';

function fcfa(n) {
  if (!n) return '0 FCFA';
  return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' FCFA';
}
function short(n) {
  if (!n) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'k';
  return String(Math.round(n));
}
const JOURS = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const MOIS  = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

function StatCard({ label, value, sub, icon: Icon, gradient, trend }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 text-white ${gradient} shadow-lg`}>
      {/* Cercle décoratif */}
      <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10"/>
      <div className="absolute -right-2 -bottom-6 w-32 h-32 rounded-full bg-white/5"/>
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-inner">
            <Icon size={20} />
          </div>
          {trend !== undefined && (
            <span className="text-xs font-bold bg-white/20 px-2 py-1 rounded-lg flex items-center gap-1">
              <TrendingUp size={10}/> {trend}
            </span>
          )}
        </div>
        <p className="text-3xl font-black leading-none tracking-tight">{value}</p>
        <p className="text-white/70 text-xs font-medium mt-1.5">{label}</p>
        {sub && <p className="text-white/50 text-xs mt-1">{sub}</p>}
      </div>
    </div>
  );
}

function MargeCard({ label, value, taux, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-2xl p-4 flex items-center gap-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={20} className="text-white"/>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-xl font-black text-gray-900 leading-tight">{value}</p>
        {taux > 0 && (
          <div className="flex items-center gap-1.5 mt-1">
            <div className="flex-1 h-1 bg-gray-100 rounded-full">
              <div className="h-1 rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600" style={{ width: `${Math.min(taux, 100)}%` }}/>
            </div>
            <span className="text-xs font-bold text-emerald-600">{taux.toFixed(1)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 text-white rounded-xl shadow-xl px-4 py-3 text-sm border border-gray-700">
      <p className="text-gray-400 text-xs mb-1">{label}</p>
      <p className="font-bold text-blue-400">{fcfa(payload[0].value)}</p>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats]           = useState(null);
  const [loading, setLoading]       = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchStats = () => {
    api.get('/dashboard').then(r => { setStats(r.data); setLastUpdate(new Date()); }).finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStats();
    const id = setInterval(fetchStats, 30000);
    return () => clearInterval(id);
  }, []);

  const now = new Date();
  const dateStr = `${JOURS[now.getDay()]} ${now.getDate()} ${MOIS[now.getMonth()]} ${now.getFullYear()}`;

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center animate-pulse">
        <Activity size={22} className="text-white"/>
      </div>
      <p className="text-sm text-gray-400 font-medium">Chargement du tableau de bord…</p>
    </div>
  );
  if (!stats) return <p className="text-gray-500">Erreur de chargement</p>;

  const hasAlerte = stats.rupture > 0 || stats.stock_faible > 0 || stats.expires > 0;
  const maxVente  = stats.top_produits[0]?.total_vendu || 1;

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">

      {/* ── En-tête ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Tableau de bord</h1>
          <p className="text-sm text-gray-400 flex items-center gap-1.5 mt-0.5 capitalize">
            <Clock size={12}/> {dateStr}
          </p>
        </div>
        {stats.nb_ventes_jour > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-semibold text-emerald-700 shadow-sm border border-emerald-200"
            style={{ background:'linear-gradient(135deg,#ecfdf5,#d1fae5)' }}>
            <Zap size={15} className="text-emerald-500"/>
            {stats.nb_ventes_jour} vente{stats.nb_ventes_jour > 1 ? 's' : ''} aujourd'hui
          </div>
        )}
      </div>

      {/* ── 5 KPI ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Ventes du jour"
          value={fcfa(stats.ca_jour)}
          sub={`${stats.nb_ventes_jour} transaction${stats.nb_ventes_jour !== 1 ? 's' : ''}`}
          icon={ShoppingCart}
          gradient="stat-blue"
        />
        <StatCard
          label="Crédits encaissés"
          value={fcfa(stats.credits_encaisses_jour)}
          sub="remboursements reçus aujourd'hui"
          icon={Wallet}
          gradient="stat-orange"
        />
        <StatCard
          label="Ventes du mois"
          value={fcfa(stats.ca_mois)}
          sub="chiffre d'affaires"
          icon={TrendingUp}
          gradient="stat-green"
        />
        <StatCard
          label="Valeur du stock"
          value={fcfa(stats.valeur_stock)}
          sub={`${stats.nb_produits} produits`}
          icon={Package}
          gradient="stat-purple"
        />
        <StatCard
          label="Clients"
          value={stats.nb_clients}
          sub="fiches enregistrées"
          icon={Users}
          gradient="stat-orange"
        />
      </div>
      <p className="text-xs text-gray-400 -mt-3">💡 Argent attendu dans le tiroir aujourd'hui ≈ fond de caisse + ventes en espèces du jour + crédits encaissés ci-dessus.</p>

      {/* ── Encaissements du jour par mode de paiement ── */}
      {stats.paiements_jour?.length > 0 && (
        <div>
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Wallet size={12}/> Encaissements du jour par mode de paiement
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {stats.paiements_jour.map(p => (
              <MargeCard
                key={p.mode}
                label={`${p.label} — aujourd'hui`}
                value={fcfa(p.montant)}
                taux={0}
                icon={ICONES_MODE[p.mode] || Wallet}
                color={COULEURS_MODE[p.mode] || 'bg-gradient-to-br from-gray-400 to-gray-600'}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Marges ── */}
      <div>
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
          <TrendingUp size={12}/> Marge brute
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MargeCard label="Marge du jour"   value={fcfa(stats.marge_jour)}  taux={stats.taux_marge_jour}  icon={Zap}       color="bg-gradient-to-br from-emerald-400 to-emerald-600"/>
          <MargeCard label="Marge du mois"   value={fcfa(stats.marge_mois)}  taux={stats.taux_marge_mois}  icon={Activity}  color="bg-gradient-to-br from-teal-400 to-teal-600"/>
          <MargeCard label="Marge cumulée"   value={fcfa(stats.marge_total)} taux={0}                       icon={Wallet}    color="bg-gradient-to-br from-blue-500 to-blue-700"/>
        </div>
      </div>

      {/* ── Alertes ── */}
      {hasAlerte && (
        <div className="rounded-2xl overflow-hidden shadow-sm border border-red-100">
          <div className="flex items-center justify-between px-5 py-3.5"
            style={{ background:'linear-gradient(135deg,#fef2f2,#fee2e2)' }}>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-red-100 rounded-xl flex items-center justify-center">
                <AlertTriangle size={15} className="text-red-600"/>
              </div>
              <p className="text-sm font-bold text-red-800">Alertes stock — réapprovisionnement requis</p>
            </div>
            <div className="flex gap-2">
              {stats.rupture > 0 && (
                <span className="text-xs font-bold px-2.5 py-1 rounded-full text-white shadow-sm" style={{background:'linear-gradient(135deg,#ef4444,#dc2626)'}}>
                  {stats.rupture} rupture{stats.rupture > 1 ? 's' : ''}
                </span>
              )}
              {stats.stock_faible > 0 && (
                <span className="text-xs font-bold px-2.5 py-1 rounded-full text-white shadow-sm" style={{background:'linear-gradient(135deg,#f59e0b,#d97706)'}}>
                  {stats.stock_faible} faible{stats.stock_faible > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
          <div className="bg-white divide-y divide-gray-50">
            {stats.alertes_stock.map(p => {
              const rupture = p.qte_actuelle === 0;
              return (
                <div key={p.id} className={`flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors ${rupture ? 'border-l-4 border-red-400' : 'border-l-4 border-amber-400'}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{p.nom}</p>
                      <p className="text-xs text-gray-400 font-mono">#{p.code}</p>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {rupture
                      ? <span className="badge badge-red">Rupture totale</span>
                      : <span className="badge badge-yellow">{p.qte_actuelle} / min {p.qte_min}</span>
                    }
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Graphique + Top produits ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Graphique */}
        <div className="lg:col-span-3 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <BarChart3 size={16} className="text-blue-600"/> Ventes — 7 derniers jours
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">Chiffre d'affaires quotidien</p>
            </div>
          </div>
          {stats.ventes_7j.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-200 gap-3">
              <BarChart3 size={40}/>
              <p className="text-sm text-gray-400">Aucune vente cette semaine</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stats.ventes_7j} barSize={28} margin={{ top:4, right:4, bottom:0, left:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
                <XAxis dataKey="date" tick={{ fontSize:11, fill:'#94a3b8', fontWeight:500 }}
                  tickLine={false} axisLine={false}
                  tickFormatter={d => { const [,m,day]=d.split('-'); return `${parseInt(day)}/${m}`; }}/>
                <YAxis tick={{ fontSize:11, fill:'#94a3b8' }} tickLine={false} axisLine={false}
                  tickFormatter={v => short(v)}/>
                <Tooltip content={<CustomTooltip/>} cursor={{ fill:'#eff6ff', radius:6 }}/>
                <Bar dataKey="total" radius={[8,8,0,0]}
                  fill="url(#barGrad)"/>
                <defs>
                  <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6"/>
                    <stop offset="100%" stopColor="#1d4ed8"/>
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top produits */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 mb-4">
            <Star size={15} className="text-amber-500"/> Top produits du mois
          </h2>
          {stats.top_produits.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-200 gap-3">
              <ShoppingBag size={36}/>
              <p className="text-sm text-gray-400 text-center">Aucune vente ce mois</p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {stats.top_produits.map((p, i) => {
                const medals = ['bg-gradient-to-br from-amber-400 to-amber-600','bg-gradient-to-br from-gray-300 to-gray-500','bg-gradient-to-br from-orange-400 to-orange-600'];
                return (
                  <div key={i} className="flex items-center gap-3 group">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black text-white flex-shrink-0 shadow-sm ${medals[i] || 'bg-gradient-to-br from-blue-400 to-blue-600'}`}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{p.nom}</p>
                      <div className="h-1.5 bg-gray-100 rounded-full mt-1.5 overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-700"
                          style={{ width:`${(p.total_vendu/maxVente)*100}%` }}/>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-black text-gray-800">{p.total_vendu}</p>
                      <p className="text-xs text-gray-400">unités</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Activités récentes ── */}
      {stats.activites_recentes?.length > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 mb-4">
            <Activity size={15} className="text-blue-500"/> Activités récentes
          </h2>
          <div className="space-y-1">
            {stats.activites_recentes.map((a, i) => (
              <div key={a.id || i} className="flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors group">
                <div className="w-2 h-2 rounded-full bg-blue-400 mt-2 flex-shrink-0 group-hover:bg-blue-600 transition-colors"/>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate">{a.details || a.action}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    <span className="font-medium text-gray-500">{a.user_nom}</span>
                    {' · '}
                    {new Date(a.created_at).toLocaleString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}
                  </p>
                </div>
                <ArrowUpRight size={14} className="text-gray-300 group-hover:text-blue-400 mt-1 transition-colors flex-shrink-0"/>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

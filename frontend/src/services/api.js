import axios from 'axios';

// Sans timeout, une requête qui reste bloquée (connexion coupée, backend occupé, etc.) attend
// indéfiniment sans jamais échouer ni afficher d'erreur — l'app paraît alors "gelée" alors
// qu'aucune exception ne s'est produite (rien à voir dans la console).
const api = axios.create({ baseURL: '/api', timeout: 15000 });

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  const boutique = localStorage.getItem('boutique');
  if (boutique) cfg.headers['X-Boutique'] = boutique;
  return cfg;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;

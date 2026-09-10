const API_BASE = window.location.origin;

async function api(url, options = {}) {
  const token = localStorage.getItem('jefram_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers
  });

  if (response.status === 401) {
    localStorage.removeItem('jefram_token');
    localStorage.removeItem('jefram_user');
    if (window.location.pathname.includes('admin')) {
      window.location.href = '/admin/login.html';
    }
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

window.JeframAPI = {
  // Auth
  adminLogin: (email, password) => api('/api/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  }),

  productManagerLogin: (email, password) => api('/api/auth/product-manager/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  }),

  createAdmin: (data) => api('/api/auth/admin/create', {
    method: 'POST', body: JSON.stringify(data)
  }),

  createProductManager: (data) => api('/api/auth/product-manager/create', {
    method: 'POST', body: JSON.stringify(data)
  }),

  recoverAdmin: (data) => api('/api/auth/admin/recover', {
    method: 'POST', body: JSON.stringify(data)
  }),

  customerRegister: (data) => api('/api/auth/customer/register', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  customerLogin: (email, password) => api('/api/auth/customer/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  }),

  getCurrentUser: () => api('/api/auth/me'),

  // Products
  getProducts: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api(`/api/products${query ? '?' + query : ''}`);
  },

  getProduct: (id) => api(`/api/products/${id}`),

  createProduct: (data) => api('/api/products', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  updateProduct: (id, data) => api(`/api/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),

  deleteProduct: (id) => api(`/api/products/${id}`, {
    method: 'DELETE'
  }),

  // Categories
  getCategories: () => api('/api/categories'),

  createCategory: (data) => api('/api/categories', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  // Orders
  getOrders: () => api('/api/orders'),

  getOrder: (id) => api(`/api/orders/${id}`),

  createOrder: (data) => api('/api/orders', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  updateOrderStatus: (id, status) => api(`/api/orders/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status })
  }),

  confirmOrder: (id, data) => api(`/api/orders/${id}/confirm`, {
    method: 'PUT', body: JSON.stringify(data)
  }),

  getDeliveryAgents: () => api('/api/delivery-agents'),
  createDeliveryAgent: (data) => api('/api/delivery-agents', { method: 'POST', body: JSON.stringify(data) }),
  deleteDeliveryAgent: (id) => api(`/api/delivery-agents/${id}`, { method: 'DELETE' }),
  assignDeliveryAgent: (orderId, delivery_agent_id) => api(`/api/orders/${orderId}/assign-agent`, {
    method: 'PUT', body: JSON.stringify({ delivery_agent_id })
  }),

  rateOrder: (id, data) => api(`/api/orders/${id}/rating`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),

  // Reviews
  getReviews: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api(`/api/reviews${query ? '?' + query : ''}`);
  },

  createReview: (data) => api('/api/reviews', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  // Coupons
  getCoupons: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return api(`/api/coupons${query ? '?' + query : ''}`);
  },

  createCoupon: (data) => api('/api/coupons', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  updateCouponUsage: (id) => api(`/api/coupons/${id}/usage`, {
    method: 'PUT'
  }),

  deleteCoupon: (id) => api(`/api/coupons/${id}`, { method: 'DELETE' }),

  // Config
  getConfig: (key) => api(`/api/config/${key}`),

  updateConfig: (key, value) => api(`/api/config/${key}`, {
    method: 'PUT',
    body: JSON.stringify({ value })
  }),

  // Users
  getUsers: () => api('/api/users'),
  getUser: (id) => api(`/api/users/${encodeURIComponent(id)}`),

  deleteUser: (id) => api(`/api/users/${id}`, {
    method: 'DELETE'
  }),

  updateUser: (id, data) => api(`/api/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),

  changePassword: (id, data) => api(`/api/users/${id}/password`, {
    method: 'PUT', body: JSON.stringify(data)
  }),

  // Stats
  getStats: () => api('/api/stats/overview'),
  sendChatMessage: (data) => api('/api/chat/messages', {
    method: 'POST', body: JSON.stringify(data)
  }),
  getChatMessages: (conversationId) => api(`/api/chat/messages/${encodeURIComponent(conversationId)}`),
  getChatConversations: () => api('/api/admin/chat/conversations'),
  getAdminChatMessages: (conversationId) => api(`/api/admin/chat/${encodeURIComponent(conversationId)}`),
  replyToChat: (conversationId, message) => api(`/api/admin/chat/${encodeURIComponent(conversationId)}/reply`, {
    method: 'POST', body: JSON.stringify({ message })
  })
};

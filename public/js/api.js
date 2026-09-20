// ==========================================
// API UTILITY FUNCTIONS
// ==========================================

const API_BASE_URL = window.location.origin + '/api';

/**
 * Wrapper for fetch that automatically adds auth token and handles errors.
 */
async function authFetch(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  // Add token if it exists
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Remove Content-Type if we're sending FormData
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const config = {
    ...options,
    headers
  };

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    const data = await response.json();
    
    // Auto-logout on token expiration
    if (response.status === 401 && !endpoint.includes('/auth/')) {
      app.logout();
      return null;
    }

    if (!response.ok) {
      throw new Error(data.message || 'An error occurred with the request.');
    }

    return data;
  } catch (error) {
    console.error(`API Error on ${endpoint}:`, error);
    throw error;
  }
}

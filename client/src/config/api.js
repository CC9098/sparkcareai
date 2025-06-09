const API_CONFIG = {
  // API Base URL - automatically detects environment
  baseURL: process.env.NODE_ENV === 'production' 
    ? '/api'  // For Vercel deployment, use relative path
    : 'http://localhost:5000/api',  // For development
  
  // Default headers
  headers: {
    'Content-Type': 'application/json',
  },
  
  // Request timeout (30 seconds)
  timeout: 30000,
  
  // Enable credentials for CORS
  withCredentials: true,
};

export default API_CONFIG; 
/** Runtime configuration from Vite env variables (see .env.example). */
export const config = {
  /** demo: in-browser sample data with role switcher and walkthrough. api: FastAPI backend + Entra ID. */
  dataMode: (import.meta.env.VITE_MODE_DATA || 'demo') as 'demo' | 'api',
  apiBase: import.meta.env.VITE_API_BASE || '/api',
  entra: {
    clientId: import.meta.env.VITE_ENTRA_CLIENT_ID || '',
    tenantId: import.meta.env.VITE_ENTRA_TENANT_ID || '',
    apiScope: import.meta.env.VITE_ENTRA_API_SCOPE || ''
  }
};
export const isDemo = config.dataMode === 'demo';

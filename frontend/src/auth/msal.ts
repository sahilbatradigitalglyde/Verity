/**
 * Microsoft Entra ID sign-in (API mode). The access token is sent to FastAPI, which validates it and
 * uses the on-behalf-of flow to call Azure DevOps as the signed-in user — so Verity only shows
 * the orgs, projects and repos the user can already open in Azure DevOps.
 */
import { PublicClientApplication, type AccountInfo } from '@azure/msal-browser';
import { config } from '@/config';

let pca: PublicClientApplication | null = null;

export async function getMsal() {
  if (!pca) {
    pca = new PublicClientApplication({
      auth: {
        clientId: config.entra.clientId,
        authority: `https://login.microsoftonline.com/${config.entra.tenantId}`,
        redirectUri: window.location.origin + '/signin'
      },
      cache: { cacheLocation: 'sessionStorage' }
    });
    await pca.initialize();
    await pca.handleRedirectPromise();
  }
  return pca;
}

export async function signInWithMicrosoft() {
  const app = await getMsal();
  await app.loginRedirect({ scopes: [config.entra.apiScope, 'openid', 'profile'] });
}

export async function getAccount(): Promise<AccountInfo | null> {
  const app = await getMsal();
  return app.getAllAccounts()[0] || null;
}

/** Returns a bearer token for the Verity API, refreshing silently when possible. */
export async function getApiToken(): Promise<string> {
  const app = await getMsal();
  const account = app.getAllAccounts()[0];
  if (!account) throw new Error('Not signed in');
  try {
    const r = await app.acquireTokenSilent({ account, scopes: [config.entra.apiScope] });
    return r.accessToken;
  } catch {
    await app.acquireTokenRedirect({ account, scopes: [config.entra.apiScope] });
    throw new Error('Redirecting to sign in');
  }
}

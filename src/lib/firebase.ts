import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/gmail.send');

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  let redirectChecked = false;
  let latestUser: User | null = null;

  const notify = () => {
    // Nunca derruba a tela enquanto o retorno do Google ainda está sendo processado.
    if (!redirectChecked) return;
    if (latestUser && cachedAccessToken) {
      onAuthSuccess?.(latestUser, cachedAccessToken);
    } else if (!latestUser && !isSigningIn) {
      onAuthFailure?.();
    }
  };

  const unsubscribe = onAuthStateChanged(auth, (user: User | null) => {
    latestUser = user;
    notify();
  });

  // O login por redirecionamento termina aqui, depois da aprovação no Google.
  getRedirectResult(auth)
    .then((result) => {
      const credential = result && GoogleAuthProvider.credentialFromResult(result);
      if (result?.user && credential?.accessToken) {
        cachedAccessToken = credential.accessToken;
        latestUser = result.user;
      }
    })
    .catch((error) => console.error('Redirect sign in error:', error))
    .finally(() => {
      redirectChecked = true;
      notify();
    });

  return unsubscribe;
};

export const googleRedirectSignIn = async (): Promise<void> => {
  isSigningIn = true;
  await signInWithRedirect(auth, provider);
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Não foi possível obter a autorização do Google.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => cachedAccessToken;

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

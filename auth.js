// Configuración Auth0 — reemplazá con tus valores
const AUTH0_DOMAIN   = "chatcito.us.auth0.com";      // p.ej. onceydocepos.us.auth0.com
const AUTH0_CLIENTID = "cHs8vkJC0TNj43C6ZHdp6g1nRih2KmPc";   // p.ej. AbCdEf123...
const AUTH0_AUDIENCE = ""; // opcional si tenés API propia

let auth0Client;

async function initAuth0() {
  auth0Client = await auth0.createAuth0Client({
    domain: AUTH0_DOMAIN,
    clientId: AUTH0_CLIENTID,
    authorizationParams: {
      redirect_uri: window.location.origin + "/",   // vuelve al root
      // audience: AUTH0_AUDIENCE,                  // descomentá si usás API
      prompt: "login" // podés quitarlo; útil para forzar pantalla de login
    },
    cacheLocation: "localstorage", // conserva sesión entre tabs
    useRefreshTokens: true
  });

  // Si Auth0 nos devuelve code/state (después de login redirect), procesarlos
  if (location.search.includes("code=") && location.search.includes("state=")) {
    await auth0Client.handleRedirectCallback();
    // limpiar la query para no dejar code/state en URL
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  const isAuth = await auth0Client.isAuthenticated();
  renderUI(isAuth);
}

function showAppUI(profile) {
  document.getElementById("screen-locked").style.display = "none";
  document.getElementById("app").style.display = "block";

  // Mostrar usuario
  const badge = document.getElementById("user-badge");
  if (profile?.email) {
    badge.textContent = profile.email;
    badge.style.display = "inline-block";
  }

  // Ejemplo: cargar contenido de tu POS (si necesitás token, abajo)
  document.getElementById("app-content").innerHTML = `
    <p>Sesión activa ✅</p>
  `;
}

function showLockedUI() {
  document.getElementById("app").style.display = "none";
  document.getElementById("screen-locked").style.display = "grid";
  document.getElementById("user-badge").style.display = "none";
}

async function renderUI(isAuth) {
  const loginBtn  = document.getElementById("login-btn");
  const logoutBtn = document.getElementById("logout-btn");
  const unlockBtn = document.getElementById("unlock-btn");

  loginBtn.onclick  = unlockBtn.onclick = async () => {
    await auth0Client.loginWithRedirect();
  };
  logoutBtn.onclick = async () => {
    await auth0Client.logout({
      logoutParams: { returnTo: window.location.origin + "/" }
    });
  };

  if (isAuth) {
    loginBtn.style.display = "none";
    logoutBtn.style.display = "inline-block";
    const user = await auth0Client.getUser();
    showAppUI(user);
  } else {
    loginBtn.style.display = "inline-block";
    logoutBtn.style.display = "none";
    showLockedUI();
  }
}

// Si necesitás un Access Token (para llamar APIs protegidas)
export async function getAccessToken() {
  try {
    const token = await auth0Client.getTokenSilently({
      // authorizationParams: { audience: AUTH0_AUDIENCE } // si usás API
    });
    return token;
  } catch (e) {
    // si expiró/ fallo silent, forzá login
    await auth0Client.loginWithRedirect();
  }
}

window.addEventListener("DOMContentLoaded", initAuth0);

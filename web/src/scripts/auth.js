// Funciones de autenticación para usar en todas las páginas

// URL de la API
const API_URL = "http://localhost:3301/api";

// Verificar si el usuario está autenticado
const isAuthenticated = () => {
  return localStorage.getItem("token") !== null;
};

// Obtener el usuario actual
const getCurrentUser = () => {
  const userStr = localStorage.getItem("user");
  return userStr ? JSON.parse(userStr) : null;
};

// Obtener el token de autenticación
const getToken = () => {
  return localStorage.getItem("token");
};

// Cerrar sesión
const logout = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "/login";
};

// Verificar autenticación y redirigir si no está autenticado
const checkAuth = async () => {
  if (!isAuthenticated()) {
    window.location.href = "/login";
    return false;
  }

  // Verificar si el token sigue siendo válido
  try {
    const response = await fetch(`${API_URL}/auth/me`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    if (!response.ok) {
      logout();
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error al verificar autenticación:", error);
    logout();
    return false;
  }
};

// Función para realizar peticiones autenticadas
const fetchWithAuth = async (url, options = {}) => {
  // Asegurar que headers existe
  const headers = options.headers || {};

  // Agregar token de autenticación
  headers["Authorization"] = `Bearer ${getToken()}`;

  // Crear opciones con headers actualizados
  const fetchOptions = {
    ...options,
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
  };

  // Realizar petición
  const response = await fetch(url, fetchOptions);

  // Si hay error de autenticación, cerrar sesión
  if (response.status === 401 || response.status === 403) {
    logout();
    throw new Error("Sesión expirada o inválida");
  }

  return response;
};

// Script para manejar autenticación
export function setupAuth() {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  // Actualizar nombre de usuario
  const userNameEl = document.getElementById("userName");
  if (userNameEl && user.name) {
    userNameEl.textContent = user.name;
  }

  // Verificar autenticación
  if (!token && !window.location.pathname.includes("/login")) {
    window.location.href = "/login";
    return false;
  }

  return { token, user };
}

export function setupLogout() {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    });
  }
}

export {
  isAuthenticated,
  getCurrentUser,
  getToken,
  logout,
  checkAuth,
  fetchWithAuth,
  API_URL,
};

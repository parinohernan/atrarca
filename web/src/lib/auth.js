/**
 * Función para realizar peticiones autenticadas al servidor
 * @param {string} url - URL a la que hacer la petición
 * @param {object} options - Opciones para fetch (método, headers, body, etc.)
 * @returns {Promise} - Promesa con la respuesta de la petición
 */
export async function fetchWithAuth(url, options = {}) {
  // Asegurarse que options.headers existe
  if (!options.headers) {
    options.headers = {};
  }

  // Obtener token del localStorage si existe
  const token = localStorage.getItem("authToken");

  // Añadir token a los headers si existe
  if (token) {
    options.headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, options);

    // Si la respuesta es 401 (No autorizado), podríamos redirigir al login
    if (response.status === 401) {
      console.error("Usuario no autenticado o token expirado");
      // Redirigir a la página de login si es necesario
      // window.location.href = '/login';
    }

    return response;
  } catch (error) {
    console.error("Error en fetchWithAuth:", error);
    throw error;
  }
}

/**
 * Función para verificar si el usuario está autenticado
 * @returns {boolean} - true si hay un token, false en caso contrario
 */
export function isAuthenticated() {
  return !!localStorage.getItem("authToken");
}

/**
 * Función para obtener información del usuario (si se almacena en localStorage)
 * @returns {object|null} - Datos del usuario o null si no está autenticado
 */
export function getUserInfo() {
  const userInfo = localStorage.getItem("userInfo");
  return userInfo ? JSON.parse(userInfo) : null;
}

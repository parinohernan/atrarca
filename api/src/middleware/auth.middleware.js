const jwt = require("jsonwebtoken");
const { getUserByUsername } = require("../data/users");

const JWT_SECRET = process.env.JWT_SECRET || "afip-api-secret-key";

// Middleware para verificar token JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: "Acceso denegado" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Token inválido o expirado" });
    }

    // Obtener datos completos del usuario
    const fullUser = getUserByUsername(user.username);
    if (!fullUser) {
      return res.status(403).json({ error: "Usuario no encontrado" });
    }

    // Agregar usuario a la solicitud
    req.user = fullUser;
    next();
  });
};

// Generar token JWT
const generateToken = (user) => {
  const payload = {
    username: user.username,
    name: user.name,
    role: user.role,
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: "8h" });
};

module.exports = {
  authenticateToken,
  generateToken,
};

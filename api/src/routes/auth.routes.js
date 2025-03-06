const express = require("express");
const router = express.Router();
const { validateUser } = require("../data/users");
const { generateToken } = require("../middleware/auth.middleware");

// Ruta de login
router.post("/login", (req, res) => {
  const { username, password } = req.body;

  // Validar campos
  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Usuario y contraseña son requeridos" });
  }

  // Validar usuario
  const user = validateUser(username, password);
  if (!user) {
    return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
  }

  // Generar token
  const token = generateToken(user);

  // Responder con token y datos básicos del usuario
  res.json({
    success: true,
    token,
    user: {
      username: user.username,
      name: user.name,
      role: user.role,
      empresa: user.empresa
        ? {
            razonSocial: user.empresa.razonSocial,
            cuit: user.empresa.cuit,
          }
        : null,
    },
  });
});

// Ruta para verificar token y obtener datos del usuario
router.get("/me", (req, res) => {
  // Esta ruta usará el middleware authenticateToken, así que tendremos req.user
  if (!req.user) {
    return res.status(401).json({ error: "No autenticado" });
  }

  res.json({
    success: true,
    user: {
      username: req.user.username,
      name: req.user.name,
      role: req.user.role,
      empresa: req.user.empresa
        ? {
            razonSocial: req.user.empresa.razonSocial,
            cuit: req.user.empresa.cuit,
          }
        : null,
    },
  });
});

module.exports = router;

const express = require("express");
const router = express.Router();
const authRoutes = require("./auth.routes");
const afipRoutes = require("./afip.routes");
const astrialRoutes = require("./astrial.routes");

// Rutas de autenticación
router.use("/auth", authRoutes);

// Rutas de AFIP
router.use("/afip", afipRoutes);

// Rutas de Astrial
router.use("/astrial", astrialRoutes);

// Ruta de prueba para verificar que el router está funcionando
router.get("/test", (req, res) => {
  res.json({ message: "API Router funcionando correctamente" });
});

module.exports = router;

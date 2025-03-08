const express = require("express");
const router = express.Router();
const astrialController = require("../controllers/astrial.controller");
const authMiddleware = require("../middleware/auth.middleware");

// Aplicar middleware de autenticación a todas las rutas
router.use(authMiddleware.authenticateToken);

// Rutas para Astrial
router.get("/facturas-sin-cae", astrialController.getFacturasSinCAE);
router.post("/grabar-cae", astrialController.grabarCAE);

module.exports = router;

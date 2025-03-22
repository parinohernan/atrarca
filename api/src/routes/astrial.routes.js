const express = require("express");
const router = express.Router();
const astrialController = require("../controllers/astrial.controller");
const authMiddleware = require("../middleware/auth.middleware");

// Rutas sin autenticación
router.get("/facturas-sin-cae", astrialController.getFacturasSinCAE);

// Rutas con autenticación (ejemplo)
router.post(
  "/grabar-cae",
  //   authMiddleware.authenticateToken,
  astrialController.grabarCAE
);

module.exports = router;

const express = require("express");
const router = express.Router();
const afipController = require("../controllers/afip.controller");
const authMiddleware = require("../middleware/auth.middleware");

// Eliminar esta línea que aplica autenticación global
// router.use(authMiddleware.authenticateToken);

//test
router.get("/test", (req, res) => {
  res.json({ message: "API Router funcionando correctamente" });
});

// Rutas sin autenticación
router.get("/ultimo-comprobante", afipController.getUltimoComprobante);
router.get("/condiciones-iva", afipController.getCondicionesIVA);
router.get(
  "/condiciones-iva-receptor",
  afipController.getCondicionesIVAReceptor
);
router.get("/tipos-comprobantes", afipController.getTiposComprobantes);
router.get("/cotizacion/:moneda", afipController.getCotizacion);
router.post("/obtener-cae", afipController.obtenerCAE);
router.post("/comprobante", afipController.createComprobante);
router.get("/metodos-disponibles", afipController.getMetodosDisponibles);
router.get("/test-certificados", afipController.testCertificados);

module.exports = router;

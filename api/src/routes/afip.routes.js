const express = require("express");
const router = express.Router();
const afipController = require("../controllers/afip.controller");

// Obtener último comprobante
router.get("/ultimo-comprobante", afipController.getUltimoComprobante);
router.get("/condiciones-iva", afipController.getCondicionesIVA);
router.get(
  "/condiciones-iva-receptor",
  afipController.getCondicionesIVAReceptor
);
router.get("/tipos-comprobantes", afipController.getTiposComprobantes);
// Obtener CAE
router.post("/obtener-cae", afipController.obtenerCAE);
router.post("/comprobante", afipController.createComprobante);
router.get("/metodos-disponibles", afipController.getMetodosDisponibles);

module.exports = router;

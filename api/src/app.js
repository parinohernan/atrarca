// Cargar dotenv al inicio, antes de cualquier otro import
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

// Verificar que se cargó correctamente
console.log("Variables de entorno cargadas:");
console.log("AFIP_MODE:", process.env.AFIP_MODE);
console.log("AFIP_CUIT:", process.env.AFIP_CUIT);

const express = require("express");
const cors = require("cors");
const afipRoutes = require("./routes/afip.routes");
const authRoutes = require("./routes/auth.routes");
const { authenticateToken } = require("./middleware/auth.middleware");

const app = express();
const PORT = process.env.PORT || 3301;

// Middleware
app.use(cors());
app.use(express.json());

// Rutas públicas (sin autenticación)
app.use("/api/auth", authRoutes);

// Rutas protegidas (requieren autenticación)
app.use("/api/afip", authenticateToken, afipRoutes);

// Ruta base
app.get("/", (req, res) => {
  res.send("API de AFIP funcionando correctamente");
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en puerto ${PORT}`);
});

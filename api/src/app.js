const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const afipRoutes = require("./routes/afip.routes");

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3301;

// Middleware
app.use(cors());
app.use(express.json());

// Rutas
app.use("/api/afip", afipRoutes);

// Ruta base
app.get("/", (req, res) => {
  res.send("API de AFIP funcionando correctamente");
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en puerto ${PORT}`);
});

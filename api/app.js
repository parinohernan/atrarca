// Importar el router
const astrialRoutes = require("./routes/astrial");

// Registrar el router con el prefijo correcto
app.use("/api/astrial", astrialRoutes);

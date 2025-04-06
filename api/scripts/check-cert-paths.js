const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Rutas en variables de entorno
const certEnv = process.env.EMPRESA_CERTIFICADO;
const keyEnv = process.env.EMPRESA_KEY;

// Rutas absolutas
const basePath = path.resolve(__dirname, "../");
const certPath = path.isAbsolute(certEnv)
  ? certEnv
  : path.resolve(basePath, certEnv);
const keyPath = path.isAbsolute(keyEnv)
  ? keyEnv
  : path.resolve(basePath, keyEnv);

console.log("Verificación de certificados:");
console.log(`Ruta del certificado en .env: ${certEnv}`);
console.log(`Ruta absoluta del certificado: ${certPath}`);
console.log(`El certificado existe: ${fs.existsSync(certPath)}`);
console.log(`Ruta de la clave en .env: ${keyEnv}`);
console.log(`Ruta absoluta de la clave: ${keyPath}`);
console.log(`La clave existe: ${fs.existsSync(keyPath)}`);

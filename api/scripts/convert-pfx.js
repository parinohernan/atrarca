const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Ruta al archivo PFX
const pfxPath = path.resolve("./certificates/tu-certificado.pfx");
// Carpeta de salida
const outputDir = path.resolve("./certificates");
// Archivos de salida
const keyPath = path.join(outputDir, "private.key");
const certPath = path.join(outputDir, "certificate.crt");

// Asegúrate de que la carpeta exista
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log("Convirtiendo PFX a KEY y CRT...");

try {
  // Extraer clave privada
  execSync(
    `openssl pkcs12 -in "${pfxPath}" -nocerts -out "${keyPath}" -nodes`,
    { stdio: "inherit" }
  );

  // Extraer certificado
  execSync(
    `openssl pkcs12 -in "${pfxPath}" -clcerts -nokeys -out "${certPath}"`,
    { stdio: "inherit" }
  );

  console.log("Conversión exitosa!");
  console.log(`Clave privada guardada en: ${keyPath}`);
  console.log(`Certificado guardado en: ${certPath}`);

  // Actualizar tu archivo .env con estas rutas
  console.log("\nAgrega estas líneas a tu archivo .env:");
  console.log(`EMPRESA_CERTIFICADO=${path.relative(process.cwd(), certPath)}`);
  console.log(`EMPRESA_KEY=${path.relative(process.cwd(), keyPath)}`);
} catch (error) {
  console.error("Error al convertir el certificado:", error.message);
}

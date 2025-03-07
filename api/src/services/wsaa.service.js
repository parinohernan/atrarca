const soap = require("soap");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { promisify } = require("util");
const xml2js = require("xml2js");
const moment = require("moment");

// URLs de AFIP (cambiar según entorno)
const WSAA_URL = {
  testing: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms?wsdl",
  production: "https://wsaa.afip.gov.ar/ws/services/LoginCms?wsdl",
};

class WSAAService {
  constructor() {
    // Configuración general
    this.mode = process.env.AFIP_MODE || "testing";
    this.tokenPath = path.resolve(__dirname, "../temp/");
    this.tokens = {}; // Será un objeto con formato: {cuit: {service: tokenData}}
  }

  // Método para establecer la empresa actual
  setEmpresa(empresa) {
    if (!empresa || !empresa.cuit || !empresa.certificado || !empresa.key) {
      throw new Error("Datos de empresa incompletos");
    }

    this.cuit = empresa.cuit;
    this.certPath = path.resolve(__dirname, "../certs/", empresa.certificado);
    this.keyPath = path.resolve(__dirname, "../certs/", empresa.key);

    console.log(`Configuración de empresa establecida: CUIT=${this.cuit}`);
  }

  // Modificar método para verificar token válido
  isValidToken(service) {
    // Verificar si tenemos un token para este CUIT y servicio
    if (!this.cuit) return false;

    if (!this.tokens[this.cuit]) {
      this.tokens[this.cuit] = {};
      return false;
    }

    if (!this.tokens[this.cuit][service]) return false;

    const tokenData = this.tokens[this.cuit][service];
    return this.isValidTokenData(tokenData);
  }

  // Método para guardar token
  async saveToken(service, tokenData) {
    try {
      if (!this.cuit) throw new Error("No hay CUIT configurado");

      // Guardar en memoria, organizado por CUIT
      if (!this.tokens[this.cuit]) {
        this.tokens[this.cuit] = {};
      }
      this.tokens[this.cuit][service] = tokenData;

      // También guardar en archivo si es necesario
      const fileName = `${this.cuit}_${service}_token.json`;
      const filePath = path.join(this.tokenPath, fileName);

      await fs.promises.mkdir(this.tokenPath, { recursive: true });
      await fs.promises.writeFile(filePath, JSON.stringify(tokenData), "utf8");

      console.log(
        `Token guardado para CUIT ${this.cuit} y servicio ${service}`
      );
    } catch (error) {
      console.error("Error al guardar token:", error);
    }
  }

  // Método para cargar token
  async loadToken(service) {
    try {
      if (!this.cuit) return null;

      const fileName = `${this.cuit}_${service}_token.json`;
      const filePath = path.join(this.tokenPath, fileName);

      if (!fs.existsSync(filePath)) {
        return null;
      }

      const data = await fs.promises.readFile(filePath, "utf8");
      const tokenData = JSON.parse(data);

      console.log(`Token cargado para CUIT ${this.cuit} y servicio ${service}`);
      return tokenData;
    } catch (error) {
      console.error("Error al cargar token:", error);
      return null;
    }
  }

  // Método para autenticar
  async authenticate(service, empresa) {
    if (empresa) {
      this.setEmpresa(empresa);
    } else {
      throw new Error("Se requiere información de la empresa para autenticar");
    }

    try {
      console.log(
        `Verificando token para CUIT=${this.cuit}, servicio=${service}`
      );

      // Verificar si ya tenemos un token válido (tanto en memoria como en archivo)
      if (this.isValidToken(service)) {
        console.log(
          `Token válido existente para CUIT=${this.cuit}, servicio=${service}`
        );
        return {
          token: this.tokens[this.cuit][service].token,
          sign: this.tokens[this.cuit][service].sign,
        };
      }

      // Intentar cargar el token del almacenamiento
      const loadedToken = await this.loadToken(service);
      if (loadedToken && this.isValidTokenData(loadedToken)) {
        console.log(
          `Token válido cargado del almacenamiento para CUIT=${this.cuit}, servicio=${service}`
        );

        // Asegurarse que el objeto de tokens para este CUIT existe
        if (!this.tokens[this.cuit]) {
          this.tokens[this.cuit] = {};
        }

        this.tokens[this.cuit][service] = loadedToken;
        return {
          token: loadedToken.token,
          sign: loadedToken.sign,
        };
      }

      // Si llegamos aquí, necesitamos un nuevo token
      console.log(
        `Generando nuevo token para CUIT=${this.cuit}, servicio=${service}`
      );

      // Generar y firmar TRA
      const traPath = this.generateTRA(service);
      const cms = this.signTRA(traPath);

      try {
        // Llamar al servicio WSAA
        const tokenData = await this.callWSAA(cms);

        // Guardar el token para uso futuro
        await this.saveToken(service, tokenData);

        return {
          token: tokenData.token,
          sign: tokenData.sign,
        };
      } catch (error) {
        // Verificar si el error es porque ya existe un token válido
        if (error.message && error.message.includes("alreadyAuthenticated")) {
          console.log(
            "AFIP informa que ya hay un token válido. Intentando recuperarlo..."
          );

          // Intentar recuperar el token existente
          // Aquí podríamos usar un método alternativo para obtener el token actual
          // Como llamar a otro servicio de AFIP que no requiera autenticación adicional

          // Por ahora, vamos a buscar si hay un token guardado reciente (de esta sesión)
          const recentToken = await this.findMostRecentToken(service);
          if (recentToken) {
            console.log("Se encontró un token reciente que podría ser válido");
            this.tokens[this.cuit][service] = recentToken;
            return {
              token: recentToken.token,
              sign: recentToken.sign,
            };
          }

          // Si no encontramos un token reciente, esperamos un tiempo y reintentamos
          // Esto es porque AFIP podría estar procesando aún la solicitud anterior
          console.log("Esperando 5 segundos antes de reintentar...");
          await new Promise((resolve) => setTimeout(resolve, 5000));

          // Limpiamos el token anterior por si acaso
          delete this.tokens[this.cuit][service];

          // Reintentar la autenticación
          return this.authenticate(service);
        }

        throw error;
      }
    } catch (error) {
      console.error(`Error en autenticación para CUIT=${this.cuit}:`, error);
      throw error;
    }
  }

  generateTRA(service) {
    // Genera el XML de TRA
    // Importante: AFIP usa GMT-3 (Argentina), ajustamos fechas para evitar errores de zona horaria
    const now = moment().subtract(3, "hours"); // Ajuste para la zona horaria argentina
    const expirationTime = moment().add(12, "hours").subtract(3, "hours");

    // Formato ISO 8601 específico para AFIP
    const formatAFIPDate = (date) => {
      return date.format("YYYY-MM-DDTHH:mm:ss") + "-03:00"; // Zona horaria Argentina (-03:00)
    };

    const tra = `<?xml version="1.0" encoding="UTF-8" ?>
    <loginTicketRequest version="1.0">
      <header>
        <uniqueId>${Math.floor(Date.now() / 1000)}</uniqueId>
        <generationTime>${formatAFIPDate(now)}</generationTime>
        <expirationTime>${formatAFIPDate(expirationTime)}</expirationTime>
      </header>
      <service>${service}</service>
    </loginTicketRequest>`;

    // Guardar TRA temporalmente para debug
    const traPath = path.resolve(this.tokenPath, "TRA.xml");
    fs.writeFileSync(traPath, tra);

    console.log("Generado TRA con fecha:", formatAFIPDate(now));

    return traPath;
  }

  signTRA(traPath) {
    try {
      // Asegurarnos que existen los directorios
      if (!fs.existsSync(this.tokenPath)) {
        fs.mkdirSync(this.tokenPath, { recursive: true });
      }

      // Paths para archivos temporales
      const cmsPath = path.resolve(this.tokenPath, "TRA.cms");
      const derPath = path.resolve(this.tokenPath, "TRA.der");

      // Método directo: Generar directamente el archivo DER
      console.log("Firmando TRA con certificado directamente a DER...");
      const directCommand = `openssl cms -sign -in "${traPath}" -out "${derPath}" -signer "${this.certPath}" -inkey "${this.keyPath}" -nodetach -outform DER`;
      execSync(directCommand);

      // Codificar DER a Base64 puro
      console.log("Codificando a Base64...");
      const derContent = fs.readFileSync(derPath);
      const base64Content = derContent.toString("base64");

      // Para debug, guardar el contenido Base64 en un archivo
      fs.writeFileSync(path.resolve(this.tokenPath, "TRA.b64"), base64Content);

      console.log("Proceso de firma completado.");
      return base64Content;
    } catch (error) {
      console.error("Error al firmar TRA:", error);
      throw new Error("No se pudo firmar el TRA: " + error.message);
    }
  }

  async callWSAA(cms) {
    try {
      console.log("Estableciendo conexión con WSAA...");
      // Crear cliente SOAP
      const client = await promisify(soap.createClient)(WSAA_URL[this.mode]);

      console.log("Enviando solicitud de autenticación...");
      // Llamar al servicio
      const resultado = await promisify(client.loginCms)({ in0: cms });

      console.log("Procesando respuesta...");
      // Verificar si hay respuesta válida
      if (!resultado || !resultado.loginCmsReturn) {
        throw new Error("Respuesta vacía del servicio WSAA");
      }

      // Procesar respuesta
      const loginTicketResponse = await this.parseLoginTicketResponse(
        resultado.loginCmsReturn
      );

      console.log("Token obtenido exitosamente.");
      return {
        token: loginTicketResponse.credentials.token,
        sign: loginTicketResponse.credentials.sign,
        expirationTime: loginTicketResponse.header.expirationTime,
      };
    } catch (error) {
      console.error("Error al llamar WSAA:", error);

      // Extraer mensaje detallado de error si existe
      let errorMsg = error.message;
      if (
        error.root &&
        error.root.Envelope &&
        error.root.Envelope.Body &&
        error.root.Envelope.Body.Fault
      ) {
        const fault = error.root.Envelope.Body.Fault;
        errorMsg = fault.faultcode + ": " + fault.faultstring;
      }

      throw new Error("Error en el servicio WSAA: " + errorMsg);
    }
  }

  async parseLoginTicketResponse(xmlResponse) {
    try {
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await promisify(parser.parseString)(xmlResponse);
      return result.loginTicketResponse;
    } catch (error) {
      console.error("Error al parsear respuesta XML:", error);
      throw new Error("No se pudo interpretar la respuesta del WSAA");
    }
  }

  // Método auxiliar para encontrar el token más reciente
  async findMostRecentToken(service) {
    try {
      const tokenPath = path.resolve(
        this.tokenPath,
        `${this.cuit}_${service}_token.json`
      );
      if (fs.existsSync(tokenPath)) {
        const tokenData = JSON.parse(fs.readFileSync(tokenPath, "utf8"));
        // Verificar si el token parece válido (tiene fecha de expiración en el futuro)
        if (
          tokenData.expirationTime &&
          new Date(tokenData.expirationTime) > new Date()
        ) {
          return tokenData;
        }
      }
      return null;
    } catch (error) {
      console.error("Error al buscar token reciente:", error);
      return null;
    }
  }

  // Método auxiliar para verificar si los datos del token son válidos
  isValidTokenData(tokenData) {
    if (
      !tokenData ||
      !tokenData.token ||
      !tokenData.sign ||
      !tokenData.expirationTime
    ) {
      return false;
    }

    return new Date(tokenData.expirationTime) > new Date();
  }
}

module.exports = new WSAAService();

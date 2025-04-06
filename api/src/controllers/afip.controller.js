const afipService = require("../services/afip.service");

exports.getUltimoComprobante = async (req, res) => {
  console.log("getUltimoComprobante", req.query);
  try {
    // Debuggear valores de variables de entorno
    console.log("Valores de configuración:", {
      cuit: process.env.EMPRESA_CUIT,
      certificado: process.env.EMPRESA_CERTIFICADO,
      key: process.env.EMPRESA_KEY,
    });

    const empresahc = {
      cuit: process.env.EMPRESA_CUIT,
      razonSocial: process.env.EMPRESA_RAZON_SOCIAL,
      certificado: process.env.EMPRESA_CERTIFICADO,
      key: process.env.EMPRESA_KEY,
      dbType: process.env.EMPRESA_DB_TYPE,
      dbHost: process.env.EMPRESA_DB_HOST,
      dbPort: parseInt(process.env.EMPRESA_DB_PORT),
      dbUser: process.env.EMPRESA_DB_USER,
      dbPassword: process.env.EMPRESA_DB_PASSWORD,
      dbName: process.env.EMPRESA_DB_NAME,
    };

    // Verificar que la empresa tenga todos los datos necesarios
    if (!empresahc.cuit || !empresahc.certificado || !empresahc.key) {
      throw new Error(
        "Faltan datos de configuración de la empresa (CUIT, certificado o key)"
      );
    }

    req.user = { empresa: empresahc };
    // Verificar explícitamente si existe req.user
    // if (!req.user) {
    //   return res.status(401).json({
    //     error: "No autenticado o sesión expirada",
    //     detalle: "Debe iniciar sesión nuevamente",
    //   });
    // }

    const { puntoVenta, tipoComprobante } = req.query;

    // Usar la empresa del usuario autenticado
    const empresa = req.user.empresa;
    if (!empresa) {
      return res.status(403).json({
        error: "El usuario no tiene una empresa asociada",
      });
    }

    // Asegurarnos de que el token pertenezca a la empresa actual
    console.log(`Consultando con CUIT: ${empresa.cuit}`);

    // Pasar la empresa al servicio
    const resultado = await afipService.consultarUltimoComprobante(
      parseInt(puntoVenta),
      parseInt(tipoComprobante),
      empresa
    );

    res.json(resultado);
  } catch (error) {
    console.error("Error en controlador:", error);

    // Mejorar respuesta de error para mostrar más detalles
    res.status(500).json({
      error: "Error al consultar AFIP",
      detalle: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

exports.obtenerCAE = async (req, res) => {
  try {
    const datosComprobante = req.body;

    // Usar la empresa del usuario autenticado
    const empresa = req.user.empresa;
    if (!empresa) {
      return res.status(403).json({
        error: "El usuario no tiene una empresa asociada",
      });
    }

    if (!datosComprobante) {
      return res.status(400).json({
        error: "Debe proporcionar los datos del comprobante",
      });
    }

    // Pasar la empresa al servicio
    const resultado = await afipService.obtenerCAE(datosComprobante, empresa);
    res.json(resultado);
  } catch (error) {
    console.error("Error en controlador:", error);
    res.status(500).json({
      error: "Error al obtener CAE",
      detalle: error.message,
    });
  }
};

exports.createComprobante = async (req, res) => {
  try {
    const datosComprobante = req.body;

    // Validar datos requeridos
    if (
      !datosComprobante.puntoVenta ||
      !datosComprobante.tipoComprobante ||
      !datosComprobante.docNro ||
      !datosComprobante.importeTotal
    ) {
      return res.status(400).json({
        error: "Faltan datos requeridos para el comprobante",
      });
    }

    console.log("Solicitando CAE para comprobante:", datosComprobante);

    // Llamar al servicio AFIP para obtener el CAE
    const resultado = await afipService.obtenerCAE(datosComprobante);
    // console.log("resultado", JSON.stringify(resultado));
    res.status(200).JSON.stringify(resultado);
  } catch (error) {
    console.error("Error al solicitar CAE:", error);
    res.status(500).json({
      error: error.message || "Error al solicitar CAE",
    });
  }
};

exports.getCondicionesIVA = async (req, res) => {
  try {
    const condiciones = await afipService.consultarCondicionesIVA();
    res.json(condiciones);
  } catch (error) {
    console.error("Error al consultar condiciones IVA:", error);
    res.status(500).json({
      error: error.message || "Error al consultar condiciones IVA",
    });
  }
};

exports.getCondicionesIVAReceptor = async (req, res) => {
  try {
    const condiciones = await afipService.consultarCondicionesIVAReceptor();
    res.json(condiciones);
  } catch (error) {
    console.error("Error al consultar condiciones IVA receptor:", error);
    res.status(500).json({
      error: error.message || "Error al consultar condiciones IVA receptor",
    });
  }
};

exports.getTiposComprobantes = async (req, res) => {
  try {
    const client = await afipService.getWSFEClient();
    const auth = await afipService.getAuthData();

    const resultado = await new Promise((resolve, reject) => {
      client.FEParamGetTiposCbte({ Auth: auth }, function (err, result) {
        if (err) return reject(err);
        resolve(result);
      });
    });

    res.json(resultado);
  } catch (error) {
    console.error("Error al consultar tipos de comprobantes:", error);
    res.status(500).json({
      error: error.message || "Error al consultar tipos de comprobantes",
    });
  }
};

exports.getMetodosDisponibles = async (req, res) => {
  try {
    const client = await afipService.getWSFEClient();

    // Mostrar todos los métodos disponibles en el cliente SOAP
    const metodos = [];
    for (const key in client) {
      if (typeof client[key] === "function" && key.startsWith("FEParam")) {
        metodos.push(key);
      }
    }

    res.json({
      metodos: metodos,
    });
  } catch (error) {
    console.error("Error al consultar métodos disponibles:", error);
    res.status(500).json({
      error: error.message || "Error al consultar métodos disponibles",
    });
  }
};

exports.getCotizacion = async (req, res) => {
  try {
    const { moneda } = req.params;

    if (!moneda) {
      return res.status(400).json({
        error: "Debe proporcionar el código de moneda (ej: DOL para dólar)",
      });
    }

    console.log(`Consultando cotización para moneda: ${moneda}`);

    const resultado = await afipService.consultarCotizacion(moneda);
    res.json(resultado);
  } catch (error) {
    console.error("Error al consultar cotización:", error);
    res.status(500).json({
      error: "Error al consultar cotización",
      detalle: error.message,
    });
  }
};

exports.testCertificados = async (req, res) => {
  try {
    console.log("Iniciando test de certificados por solicitud del usuario");

    // Usar los certificados configurados en variables de entorno
    const empresahc = {
      cuit: process.env.EMPRESA_CUIT,
      razonSocial: process.env.EMPRESA_RAZON_SOCIAL,
      certificado: process.env.EMPRESA_CERTIFICADO,
      key: process.env.EMPRESA_KEY,
    };

    // Verificaciones básicas
    const fs = require("fs");
    const path = require("path");

    const certPath = path.resolve(empresahc.certificado);
    const keyPath = path.resolve(empresahc.key);

    const diagnostico = {
      configuracion: {
        cuit: empresahc.cuit,
        certificadoPath: empresahc.certificado,
        keyPath: empresahc.key,
      },
      archivos: {
        certificadoExiste: fs.existsSync(certPath),
        certificadoRutaAbsoluta: certPath,
        keyExiste: fs.existsSync(keyPath),
        keyRutaAbsoluta: keyPath,
      },
      wsaaUrl: "https://wsaa.afip.gov.ar/ws/services/LoginCms?wsdl",
    };

    // Solo intentar la autenticación si los certificados existen
    if (
      diagnostico.archivos.certificadoExiste &&
      diagnostico.archivos.keyExiste
    ) {
      try {
        // Importar servicios solo cuando sea necesario
        const soap = require("soap");
        const url = diagnostico.wsaaUrl;

        // Verificar si el servicio está disponible
        diagnostico.servicio = { intentando: true };

        try {
          const client = await soap.createClientAsync(url, { timeout: 5000 });
          diagnostico.servicio = {
            disponible: true,
            metodos: Object.keys(client).filter(
              (m) => typeof client[m] === "function"
            ),
          };
        } catch (error) {
          diagnostico.servicio = {
            disponible: false,
            error: error.message,
          };
        }
      } catch (error) {
        diagnostico.autenticacion = {
          success: false,
          error: error.message,
        };
      }
    }

    res.json({
      success: true,
      diagnostico,
    });
  } catch (error) {
    console.error("Error al probar certificados:", error);
    res.status(500).json({
      success: false,
      error: "Error al probar certificados",
      detalle: error.message,
    });
  }
};

const afipService = require("../services/afip.service");

exports.getUltimoComprobante = async (req, res) => {
  console.log("getUltimoComprobante", req.query);
  try {
    const { puntoVenta, tipoComprobante } = req.query;

    if (!puntoVenta || !tipoComprobante) {
      return res.status(400).json({
        error: "Debe proporcionar punto de venta y tipo de comprobante",
      });
    }

    const resultado = await afipService.consultarUltimoComprobante(
      parseInt(puntoVenta),
      parseInt(tipoComprobante)
    );

    res.json(resultado);
    console.log("resultado", resultado);
  } catch (error) {
    console.error("Error en controlador:", error);
    res.status(500).json({
      error: "Error al consultar AFIP",
      detalle: error.message,
    });
  }
};

exports.obtenerCAE = async (req, res) => {
  try {
    const datosComprobante = req.body;

    if (!datosComprobante) {
      return res.status(400).json({
        error: "Debe proporcionar los datos del comprobante",
      });
    }

    const resultado = await afipService.obtenerCAE(datosComprobante);
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

    res.json(resultado);
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

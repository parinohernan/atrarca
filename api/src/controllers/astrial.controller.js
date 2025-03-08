const dbService = require("../services/db.service");
const afipService = require("../services/afip.service");

// Mapeo de tipos de comprobante Astrial a AFIP
const tipoComprobanteMap = {
  FCA: "1", // Factura A
  FCB: "6", // Factura B
  NCA: "3", // Nota de Crédito A
  NCB: "8", // Nota de Crédito B
};

// Obtener facturas sin CAE
exports.getFacturasSinCAE = async (req, res) => {
  console.log("getFacturasSinCAE");
  try {
    // Obtener parámetros de consulta
    console.log("Query params:", req.query); // Log para depuración
    const { puntoVenta, tipo } = req.query;

    // Verificar que el usuario tenga una empresa asociada
    const empresa = req.user.empresa;
    if (!empresa || !empresa.dbName) {
      return res.status(403).json({
        error: "El usuario no tiene configuración de base de datos",
      });
    }

    // Verificar que la empresa tenga datos de conexión completos
    if (!empresa.dbHost || !empresa.dbUser || !empresa.dbPassword) {
      return res.status(400).json({
        error: "Configuración de base de datos incompleta",
      });
    }

    // Si usamos filtros en la consulta SQL
    let query = `
      SELECT 
        DocumentoTipo, 
        DocumentoSucursal, 
        DocumentoNumero, 
        Fecha, 
        ClienteCodigo, 
        ImporteNeto,
        ImporteIva1,
        ImporteTotal,
        PorcentajeIva1
      FROM facturacabeza 
      WHERE (afip_cae IS NULL OR afip_cae = '')
    `;

    // Agregar condiciones de filtro si se proporcionaron
    const params = [];

    if (puntoVenta) {
      query += ` AND DocumentoSucursal = ?`;
      params.push(puntoVenta);
    }

    if (tipo) {
      query += ` AND DocumentoTipo = ?`;
      params.push(tipo);
    }

    query += ` ORDER BY Fecha DESC LIMIT 100`;

    // Ejecutar consulta con parámetros
    const facturas = await dbService.query(empresa, query, params);

    // Transformar los resultados para la respuesta
    const facturasFormateadas = facturas.map((f) => ({
      tipo: f.DocumentoTipo,
      puntoVenta: f.DocumentoSucursal,
      numero: f.DocumentoNumero,
      fecha: f.Fecha ? f.Fecha.toISOString().split("T")[0] : null,
      cliente: f.ClienteCodigo,
      importeNeto: f.ImporteNeto,
      importeIva: f.ImporteIva1,
      total: f.ImporteTotal,
      alicuotaIva: f.PorcentajeIva1,
    }));

    res.json({
      success: true,
      facturas: facturasFormateadas,
    });
  } catch (error) {
    console.error("Error al consultar facturas sin CAE:", error);
    res.status(500).json({
      error: "Error al consultar la base de datos",
      detalle: error.message,
    });
  }
};

// Grabar CAE en una factura
exports.grabarCAE = async (req, res) => {
  try {
    // Verificar que el usuario tenga una empresa asociada
    const empresa = req.user.empresa;
    if (!empresa || !empresa.dbName) {
      return res.status(403).json({
        error: "El usuario no tiene configuración de base de datos",
      });
    }

    // Obtener datos del cuerpo de la solicitud
    const { tipo, puntoVenta, numero, cae, fechaVencimiento, solicitarCAE } =
      req.body;

    // Validar datos obligatorios
    if (!tipo || !puntoVenta || !numero) {
      return res.status(400).json({
        error: "Debe proporcionar tipo, punto de venta y número de factura",
      });
    }

    // Si solicitarCAE es true, primero solicitamos el CAE a AFIP
    let caeData = null;
    if (solicitarCAE) {
      try {
        // Obtener los datos de la factura de la base de datos
        const queryDatosFactura = `
          SELECT 
            DocumentoTipo, 
            DocumentoSucursal, 
            DocumentoNumero, 
            Fecha, 
            ClienteCodigo, 
            ImporteNeto,
            ImporteIva1,
            ImporteTotal,
            PorcentajeIva1
          FROM facturacabeza 
          WHERE DocumentoTipo = ? AND DocumentoSucursal = ? AND DocumentoNumero = ?
        `;

        const facturas = await dbService.query(empresa, queryDatosFactura, [
          tipo,
          puntoVenta,
          numero,
        ]);

        if (facturas.length === 0) {
          return res.status(404).json({
            error: "Factura no encontrada",
          });
        }

        const factura = facturas[0];

        // Preparar datos para solicitar CAE
        const datosComprobante = {
          puntoVenta: puntoVenta,
          tipoComprobante: tipoComprobanteMap[tipo] || "1", // Default a Factura A si no se encuentra
          concepto: "1", // Productos
          docTipo: "80", // CUIT
          docNro: req.body.docNro || "20000000001", // Cliente genérico si no se proporciona
          importeNeto: parseFloat(factura.ImporteNeto),
          importeIVA: parseFloat(factura.ImporteIva1),
          importeTotal: parseFloat(factura.ImporteTotal),
          fecha: factura.Fecha.toISOString().split("T")[0].replace(/-/g, ""),
          alicuotaIVA: factura.PorcentajeIva1 === 21 ? "5" : "4", // 5 para 21%, 4 para 10.5%
          iva: [
            {
              Id: factura.PorcentajeIva1 === 21 ? 5 : 4,
              BaseImp: parseFloat(factura.ImporteNeto),
              Importe: parseFloat(factura.ImporteIva1),
            },
          ],
        };

        // Solicitar CAE a AFIP
        caeData = await afipService.obtenerCAE(datosComprobante, empresa);

        if (!caeData.success) {
          return res.status(400).json({
            error: "Error al solicitar CAE a AFIP",
            detalle: caeData.error,
          });
        }
      } catch (error) {
        return res.status(500).json({
          error: "Error al solicitar CAE a AFIP",
          detalle: error.message,
        });
      }
    }

    // Si llegamos aquí, o bien tenemos un CAE de AFIP o bien nos proporcionaron uno
    const caeToSave = caeData ? caeData.cae : cae;
    const fechaVencimientoToSave = caeData
      ? caeData.fechaVencimientoCAE
      : fechaVencimiento;

    if (!caeToSave || !fechaVencimientoToSave) {
      return res.status(400).json({
        error: "Debe proporcionar CAE y fecha de vencimiento",
      });
    }

    // Formatear fecha para MySQL (YYYY-MM-DD)
    let fechaFormateada = fechaVencimientoToSave;
    if (fechaVencimientoToSave.includes("/")) {
      const parts = fechaVencimientoToSave.split("/");
      fechaFormateada = `${parts[2]}-${parts[1]}-${parts[0]}`;
    } else if (fechaVencimientoToSave.length === 8) {
      // Formato AAAAMMDD
      fechaFormateada = `${fechaVencimientoToSave.substr(
        0,
        4
      )}-${fechaVencimientoToSave.substr(4, 2)}-${fechaVencimientoToSave.substr(
        6,
        2
      )}`;
    }

    // Actualizar la factura en la base de datos
    const query = `
      UPDATE facturacabeza 
      SET afip_cae = ?, afip_cae_vencimiento = ? 
      WHERE DocumentoTipo = ? AND DocumentoSucursal = ? AND DocumentoNumero = ?
    `;

    const result = await dbService.query(empresa, query, [
      caeToSave,
      fechaFormateada,
      tipo,
      puntoVenta,
      numero,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: "No se pudo actualizar la factura, posiblemente no existe",
      });
    }

    res.json({
      success: true,
      message: "CAE grabado correctamente",
      cae: caeToSave,
      fechaVencimiento: fechaFormateada,
      factura: {
        tipo,
        puntoVenta,
        numero,
      },
    });
  } catch (error) {
    console.error("Error al grabar CAE:", error);
    res.status(500).json({
      error: "Error al actualizar la base de datos",
      detalle: error.message,
    });
  }
};

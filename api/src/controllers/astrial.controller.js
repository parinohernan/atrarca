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

// Grabar CAE en factura Astrial
exports.grabarCAE = async (req, res) => {
  try {
    // Verificar que el usuario tenga una empresa asociada
    const empresa = req.user.empresa;
    if (!empresa || !empresa.dbName) {
      return res.status(403).json({
        error: "El usuario no tiene configuración de base de datos",
      });
    }

    const { tipo, puntoVenta, numero, solicitarCAE } = req.body;

    // Validar que todos los campos requeridos estén presentes
    if (!tipo || !puntoVenta || !numero) {
      return res.status(400).json({
        error: "Faltan parámetros requeridos (tipo, puntoVenta, numero)",
      });
    }

    // Validar que los valores numéricos sean realmente números válidos
    const puntoVentaNum = parseInt(puntoVenta, 10);
    const numeroFactura = parseInt(numero, 10);

    if (isNaN(puntoVentaNum) || isNaN(numeroFactura)) {
      return res.status(400).json({
        error: "El punto de venta y número deben ser valores numéricos válidos",
        detalles: {
          puntoVenta: puntoVenta,
          numero: numero,
          puntoVentaParseado: puntoVentaNum,
          numeroParseado: numeroFactura,
        },
      });
    }

    // Buscar la factura en la base de datos y obtener datos del cliente
    const query = `
      SELECT f.*, c.cuit as ClienteCUIT, c.tipodocumento as ClienteTipoDoc
      FROM facturaCabeza f
      LEFT JOIN t_clientes c ON f.ClienteCodigo = c.codigo
      WHERE f.DocumentoTipo = ? 
        AND f.DocumentoSucursal = ? 
        AND f.DocumentoNumero = ?
        AND f.FechaAnulacion IS NULL
    `;

    // Ejecutar consulta
    const facturas = await dbService.query(empresa, query, [
      tipo,
      puntoVenta,
      numero,
    ]);

    if (!facturas || facturas.length === 0) {
      return res.status(404).json({
        error: "No se encontró la factura especificada",
      });
    }

    const factura = facturas[0];
    console.log("Datos de cliente encontrados:", {
      codigo: factura.ClienteCodigo,
      cuit: factura.ClienteCUIT,
      tipoDoc: factura.ClienteTipoDoc,
    });

    // Si se solicita CAE
    if (solicitarCAE) {
      // Establecer el tipo de documento y número según los datos del cliente
      let tipoDocReceptor = 80; // Por defecto CUIT
      let nroDocReceptor = "20000000001"; // Valor por defecto

      if (factura.ClienteCUIT) {
        // Limpiar el CUIT/DNI de caracteres no numéricos
        nroDocReceptor = factura.ClienteCUIT.replace(/\D/g, "");

        // Si está definido el tipo de documento del cliente, usarlo
        if (factura.ClienteTipoDoc) {
          tipoDocReceptor = parseInt(factura.ClienteTipoDoc, 10);
        }
        // Si no hay tipo definido pero el número parece DNI (menor a 10 millones)
        else if (parseInt(nroDocReceptor, 10) < 10000000) {
          tipoDocReceptor = 96; // DNI
        }
      }

      // Preparar datos para solicitar CAE
      const datosComprobante = {
        tipoComprobante: mapearTipoComprobante(tipo),
        puntoVenta: puntoVentaNum.toString(),
        numero: numeroFactura.toString(),
        fecha: factura.Fecha
          ? new Date(factura.Fecha).toISOString().slice(0, 10).replace(/-/g, "")
          : new Date().toISOString().slice(0, 10).replace(/-/g, ""),
        importeTotal: parseFloat(factura.ImporteTotal) || 0,
        importeNeto: parseFloat(factura.ImporteNeto) || 0,
        importeIva: parseFloat(factura.ImporteIva1) || 0,
        conceptoIncluido: 1, // 1 = Productos
        tipoDocReceptor: tipoDocReceptor,
        nroDocReceptor: nroDocReceptor,
        alicuotaIva: parseFloat(factura.PorcentajeIva1) || 21,
        condicionVenta: 1, // 1 = Contado
      };

      console.log("Datos comprobante preparados:", datosComprobante);

      // Solicitar CAE a AFIP
      const resultadoAFIP = await afipService.obtenerCAE(
        datosComprobante,
        empresa
      );

      console.log("Respuesta AFIP completa:", resultadoAFIP);
      console.log("CAE obtenido:", resultadoAFIP.cae);
      console.log("Fecha vencimiento:", resultadoAFIP.fechaVencimiento);

      if (!resultadoAFIP.success) {
        return res.status(400).json({
          error: "Error al obtener CAE de AFIP",
          detalle: resultadoAFIP.error,
        });
      }

      // Actualizar la factura con el CAE y su fecha de vencimiento
      const updateQuery = `
        UPDATE facturaCabeza 
        SET afip_cae = ?, afip_cae_vencimiento = ?
        WHERE DocumentoTipo = ? 
          AND DocumentoSucursal = ? 
          AND DocumentoNumero = ?
      `;

      await dbService.query(empresa, updateQuery, [
        resultadoAFIP.cae,
        resultadoAFIP.fechaVencimiento,
        tipo,
        puntoVenta,
        numero,
      ]);

      return res.json({
        success: true,
        mensaje: "CAE obtenido y registrado correctamente",
        cae: resultadoAFIP.cae,
        fechaVencimiento: resultadoAFIP.fechaVencimiento,
      });
    }

    // Si no se solicita CAE, solo devolver la información de la factura
    return res.json({
      success: true,
      factura: {
        tipo: factura.DocumentoTipo,
        puntoVenta: factura.DocumentoSucursal,
        numero: factura.DocumentoNumero,
        fecha: factura.Fecha,
        cliente: factura.ClienteCodigo,
        importeNeto: factura.ImporteNeto,
        importeIva: factura.ImporteIva1,
        total: factura.ImporteTotal,
      },
    });
  } catch (error) {
    console.error("Error al procesar factura:", error);
    res.status(500).json({
      error: "Error al procesar la factura",
      detalle: error.message,
    });
  }
};

// Función auxiliar para mapear tipos de comprobante
function mapearTipoComprobante(tipoAstrial) {
  const mapa = {
    FCA: 1, // Factura A
    FCB: 6, // Factura B
    NCA: 3, // Nota de Crédito A
    NCB: 8, // Nota de Crédito B
  };

  return mapa[tipoAstrial] || 1; // Default a Factura A si no se encuentra
}

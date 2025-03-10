const dbService = require("../services/db.service");
const afipService = require("../services/afip.service");

// Mapeo de tipos de comprobante Astrial a AFIP
const tipoComprobanteMap = {
  FCA: "1", // Factura A
  FCB: "6", // Factura B
  NCA: "3", // Nota de Crédito A
  NCB: "8", // Nota de Crédito B
};

// Obtener facturas y notas de crédito sin CAE
exports.getFacturasSinCAE = async (req, res) => {
  console.log("getFacturasSinCAE");
  try {
    // Obtener parámetros de consulta
    console.log("Query params:", req.query);
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

    let facturas = [];

    // 1. Consulta para las facturas
    if (!tipo || tipo === "FCA" || tipo === "FCB") {
      let queryFacturas = `
        SELECT 
          DocumentoTipo, 
          DocumentoSucursal, 
          DocumentoNumero, 
          Fecha, 
          ClienteCodigo as CodigoCliente, 
          ImporteNeto,
          ImporteIva1,
          ImporteTotal,
          PorcentajeIva1,
          'factura' as TipoDocumento
        FROM facturaCabeza 
        WHERE (afip_cae IS NULL OR afip_cae = '')
      `;

      // Agregar condiciones de filtro
      const paramsFacturas = [];

      if (puntoVenta) {
        queryFacturas += ` AND DocumentoSucursal = ?`;
        paramsFacturas.push(puntoVenta);
      }

      if (tipo) {
        queryFacturas += ` AND DocumentoTipo = ?`;
        paramsFacturas.push(tipo);
      }

      queryFacturas += ` ORDER BY Fecha DESC LIMIT 50`;

      // Ejecutar consulta para facturas
      const facturasResult = await dbService.query(
        empresa,
        queryFacturas,
        paramsFacturas
      );
      facturas = facturas.concat(facturasResult);
    }

    // 2. Consulta para las notas de crédito
    if (!tipo || tipo === "NCA" || tipo === "NCB") {
      let queryNC = `
        SELECT 
          DocumentoTipo, 
          DocumentoSucursal, 
          DocumentoNumero, 
          Fecha, 
          CodigoCliente, 
          ImporteNeto,
          ImporteIva1,
          ImporteTotal,
          PorcentajeIva1,
          'notacredito' as TipoDocumento,
          factura_tipo,
          factura_sucursal,
          factura_numero
        FROM notacreditocabeza 
        WHERE (afip_cae IS NULL OR afip_cae = '')
      `;

      // Agregar condiciones de filtro
      const paramsNC = [];

      if (puntoVenta) {
        queryNC += ` AND DocumentoSucursal = ?`;
        paramsNC.push(puntoVenta);
      }

      if (tipo) {
        queryNC += ` AND DocumentoTipo = ?`;
        paramsNC.push(tipo);
      }

      queryNC += ` ORDER BY Fecha DESC LIMIT 50`;

      // Ejecutar consulta para notas de crédito
      const ncResult = await dbService.query(empresa, queryNC, paramsNC);
      facturas = facturas.concat(ncResult);
    }

    // Ordenar por fecha descendente
    facturas.sort((a, b) => new Date(b.Fecha) - new Date(a.Fecha));

    // Transformar los resultados para la respuesta
    const facturasFormateadas = facturas.map((f) => ({
      tipo: f.DocumentoTipo,
      puntoVenta: f.DocumentoSucursal,
      numero: f.DocumentoNumero,
      fecha: f.Fecha ? f.Fecha.toISOString().split("T")[0] : null,
      cliente: f.CodigoCliente, // Usamos CodigoCliente para ambos tipos de documentos
      importeNeto: f.ImporteNeto,
      importeIva: f.ImporteIva1,
      total: f.ImporteTotal,
      alicuotaIva: f.PorcentajeIva1,
      tipoDocumento: f.TipoDocumento,
      facturaRef: f.factura_tipo
        ? {
            tipo: f.factura_tipo,
            puntoVenta: f.factura_sucursal,
            numero: f.factura_numero,
          }
        : null,
    }));

    res.json({
      success: true,
      facturas: facturasFormateadas,
    });
  } catch (error) {
    console.error("Error al consultar documentos sin CAE:", error);
    res.status(500).json({
      error: "Error al consultar la base de datos",
      detalle: error.message,
    });
  }
};

// Grabar CAE en factura o nota de crédito
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

    // Determinar si es factura o nota de crédito
    const esNotaCredito = tipo === "NCA" || tipo === "NCB";
    const tabla = esNotaCredito ? "notacreditocabeza" : "facturaCabeza";
    const clienteField = esNotaCredito ? "CodigoCliente" : "ClienteCodigo";

    // Buscar el documento en la base de datos y obtener datos del cliente
    const query = `
      SELECT d.*, c.cuit as ClienteCUIT, c.tipodocumento as ClienteTipoDoc
      FROM ${tabla} d
      LEFT JOIN t_clientes c ON d.${clienteField} = c.codigo
      WHERE d.DocumentoTipo = ? 
        AND d.DocumentoSucursal = ? 
        AND d.DocumentoNumero = ?
        AND d.FechaAnulacion IS NULL
    `;

    // Ejecutar consulta
    const documentos = await dbService.query(empresa, query, [
      tipo,
      puntoVenta,
      numero,
    ]);

    if (!documentos || documentos.length === 0) {
      return res.status(404).json({
        error: "No se encontró el documento especificado",
      });
    }

    const documento = documentos[0];
    console.log(
      `Datos de ${esNotaCredito ? "nota de crédito" : "factura"} encontrados:`,
      {
        codigo: documento[clienteField],
        cuit: documento.ClienteCUIT,
        tipoDoc: documento.ClienteTipoDoc,
      }
    );

    // Si se solicita CAE
    if (solicitarCAE) {
      // Establecer el tipo de documento y número según los datos del cliente
      let tipoDocReceptor = 80; // Por defecto CUIT
      let nroDocReceptor = "20000000001"; // Valor por defecto

      if (documento.ClienteCUIT) {
        // Limpiar el CUIT/DNI de caracteres no numéricos
        nroDocReceptor = documento.ClienteCUIT.replace(/\D/g, "");

        // Si está definido el tipo de documento del cliente, usarlo
        if (documento.ClienteTipoDoc) {
          tipoDocReceptor = parseInt(documento.ClienteTipoDoc, 10);
        }
        // Si no hay tipo definido pero el número parece DNI (menor a 10 millones)
        else if (parseInt(nroDocReceptor, 10) < 10000000) {
          tipoDocReceptor = 96; // DNI
        }
      }

      // Datos adicionales para notas de crédito
      let datosAdicionales = {};
      if (
        esNotaCredito &&
        documento.factura_tipo &&
        documento.factura_sucursal &&
        documento.factura_numero
      ) {
        datosAdicionales = {
          comprobantesAsociados: [
            {
              Tipo: mapearTipoComprobante(documento.factura_tipo),
              PtoVta: parseInt(documento.factura_sucursal, 10),
              Nro: parseInt(documento.factura_numero, 10),
            },
          ],
        };
      }

      // Preparar datos para solicitar CAE
      const datosComprobante = {
        tipoComprobante: mapearTipoComprobante(tipo),
        puntoVenta: puntoVentaNum.toString(),
        numero: numeroFactura.toString(),
        fecha: documento.Fecha
          ? new Date(documento.Fecha)
              .toISOString()
              .slice(0, 10)
              .replace(/-/g, "")
          : new Date().toISOString().slice(0, 10).replace(/-/g, ""),
        importeTotal: parseFloat(documento.ImporteTotal) || 0,
        importeNeto: parseFloat(documento.ImporteNeto) || 0,
        importeIva: parseFloat(documento.ImporteIva1) || 0,
        conceptoIncluido: 1, // 1 = Productos
        tipoDocReceptor: tipoDocReceptor,
        nroDocReceptor: nroDocReceptor,
        alicuotaIva: parseFloat(documento.PorcentajeIva1) || 21,
        condicionVenta: 1, // 1 = Contado
        ...datosAdicionales,
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

      // Actualizar el documento con el CAE
      const updateQuery = `
        UPDATE ${tabla} 
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

    // Si no se solicita CAE, solo devolver la información del documento
    return res.json({
      success: true,
      documento: {
        tipo: documento.DocumentoTipo,
        puntoVenta: documento.DocumentoSucursal,
        numero: documento.DocumentoNumero,
        fecha: documento.Fecha,
        cliente: documento[clienteField],
        importeNeto: documento.ImporteNeto,
        importeIva: documento.ImporteIva1,
        total: documento.ImporteTotal,
      },
    });
  } catch (error) {
    console.error("Error al procesar documento:", error);
    res.status(500).json({
      error: "Error al procesar el documento",
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

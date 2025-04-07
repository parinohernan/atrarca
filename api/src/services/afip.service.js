const soap = require("soap");
const wsaaService = require("./wsaa.service");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const xml2js = require("xml2js");

// URLs de servicios AFIP
const URLS = {
  testing: {
    wsfe: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL",
  },
  production: {
    wsfe: "https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL",
  },
};

class AfipService {
  constructor() {
    this.mode = process.env.AFIP_MODE || "testing";
    this.wsfeClient = null;
    this.cuit = process.env.AFIP_CUIT; // Se establecerá por empresa
    console.log("AAAAAAAFIP_CUIT", this.cuit);
  }

  // Método para establecer la empresa actual
  setEmpresa(empresa) {
    if (!empresa || !empresa.cuit) {
      throw new Error("Datos de empresa incompletos");
    }

    this.cuit = empresa.cuit;
    console.log(`Usando CUIT: ${this.cuit} para operaciones AFIP`);
  }

  async getWSFEClient() {
    if (!this.wsfeClient) {
      try {
        this.wsfeClient = await new Promise((resolve, reject) => {
          soap.createClient(URLS[this.mode].wsfe, (err, client) => {
            if (err) return reject(err);
            resolve(client);
          });
        });
      } catch (error) {
        console.error("Error al crear cliente SOAP:", error);
        throw new Error(
          "No se pudo conectar con el servicio de AFIP: " + error.message
        );
      }
    }
    return this.wsfeClient;
  }

  // Modificar getAuthData para usar la empresa del usuario
  async getAuthData(empresa) {
    try {
      if (empresa) {
        this.setEmpresa(empresa);
      }
      // Verificar que el CUIT está configurado
      if (!this.cuit) {
        throw new Error("No se ha configurado el CUIT de la empresa");
      }

      // Pasar la empresa al servicio WSAA
      const { token, sign } = await wsaaService.authenticate("wsfe", empresa);
      return {
        Token: token,
        Sign: sign,
        Cuit: this.cuit,
      };
    } catch (error) {
      console.error("Error al obtener datos de autenticación:", error);
      throw error;
    }
  }

  async consultarUltimoComprobante(puntoVenta, tipoComprobante, empresa) {
    try {
      // Pasar la empresa a getAuthData
      const authData = await this.getAuthData(empresa);

      // Obtener el cliente SOAP para WSFE
      const client = await this.getWSFEClient();

      // Preparar parámetros para la solicitud
      const params = {
        Auth: authData,
        PtoVta: puntoVenta,
        CbteTipo: tipoComprobante,
      };

      // Llamar al método FECompUltimoAutorizado
      const resultado = await new Promise((resolve, reject) => {
        client.FECompUltimoAutorizado(params, function (err, result) {
          if (err) return reject(err);
          resolve(result);
        });
      });

      // Agregar esto para depuración
      console.log(
        "Estructura de respuesta AFIP:",
        JSON.stringify(resultado, null, 2)
      );

      // Verificar si hay errores en la respuesta
      if (resultado.FECompUltimoAutorizadoResult.Errors) {
        const errors = this.formatearErrores(
          resultado.FECompUltimoAutorizadoResult.Errors
        );
        throw new Error(`Error de AFIP: ${errors}`);
      }

      // Formatear respuesta
      return {
        success: true,
        fecha: new Date().toISOString().slice(0, 10),
        ultimoComprobante: resultado.FECompUltimoAutorizadoResult.CbteNro,
      };
      // return {
      //   success: true,
      //   fecha: new Date().toISOString().slice(0, 10),
      //   ultimoComprobante: "1234567890",
      // };
    } catch (error) {
      console.error("Error al consultar último comprobante:", error);
      throw new Error(
        `Error al consultar último comprobante: ${error.message}`
      );
    }
  }

  async consultarCondicionesIVA() {
    try {
      console.log("Consultando condiciones IVA válidas...");

      // Obtener cliente SOAP
      const client = await this.getWSFEClient();
      if (!client) {
        throw new Error("No se pudo obtener el cliente SOAP");
      }

      // Obtener datos de autenticación
      const auth = await this.getAuthData();

      // Ejecutar consulta
      const resultado = await new Promise((resolve, reject) => {
        client.FEParamGetTiposIva({ Auth: auth }, function (err, result) {
          if (err) {
            console.error("Error en llamada a FEParamGetTiposIva:", err);
            return reject(err);
          }
          if (!result) {
            console.error("Respuesta vacía de AFIP");
            return reject(new Error("Respuesta vacía de AFIP"));
          }
          resolve(result);
        });
      });

      console.log("Respuesta de condiciones IVA:", JSON.stringify(resultado));
      return resultado;
    } catch (error) {
      console.error("Error al consultar condiciones IVA:", error);
      throw error;
    }
  }

  async consultarCondicionesIVAReceptor() {
    try {
      console.log("Consultando condiciones IVA del receptor válidas...");

      // Obtener cliente SOAP
      const client = await this.getWSFEClient();
      if (!client) {
        throw new Error("No se pudo obtener el cliente SOAP");
      }

      // Obtener datos de autenticación
      const auth = await this.getAuthData();

      // Ejecutar consulta - Ahora usamos el método correcto que hemos confirmado que existe
      const resultado = await new Promise((resolve, reject) => {
        client.FEParamGetCondicionIvaReceptor(
          { Auth: auth },
          function (err, result) {
            if (err) {
              console.error(
                "Error en llamada a FEParamGetCondicionIvaReceptor:",
                err
              );
              return reject(err);
            }
            if (!result) {
              console.error("Respuesta vacía de AFIP");
              return reject(new Error("Respuesta vacía de AFIP"));
            }
            console.log(
              "Respuesta de FEParamGetCondicionIvaReceptor:",
              JSON.stringify(result)
            );
            resolve(result);
          }
        );
      });

      return resultado;
    } catch (error) {
      console.error("Error al consultar condiciones IVA del receptor:", error);
      throw error;
    }
  }

  async obtenerCAE(datosComprobante, empresa) {
    try {
      console.log("Solicitando CAE para:", datosComprobante);

      // Pasar la empresa a getAuthData
      const authData = await this.getAuthData(empresa);

      // Obtener cliente SOAP
      const client = await this.getWSFEClient();
      if (!client) {
        throw new Error("No se pudo obtener el cliente SOAP");
      }

      // Obtener datos de autenticación
      console.log("Datos de autenticación obtenidos:", {
        token: authData.Token ? "presente" : "ausente",
        sign: authData.Sign ? "presente" : "ausente",
        cuit: authData.Cuit,
      });

      // Formatear TODOS los importes con exactamente 2 decimales
      // Usamos Math.round(value * 100) / 100 para mayor precisión
      const importeTotal =
        Math.round(parseFloat(datosComprobante.importeTotal || 0) * 100) / 100;
      const importeNeto =
        Math.round(parseFloat(datosComprobante.importeNeto || 0) * 100) / 100;
      const importeIva =
        Math.round(parseFloat(datosComprobante.importeIva || 0) * 100) / 100;

      // Verificar que los importes sean válidos
      if (isNaN(importeTotal) || isNaN(importeNeto) || isNaN(importeIva)) {
        throw new Error("Los importes deben ser números válidos");
      }

      // Verificar que los importes sumen correctamente
      const sumaCalculada = importeNeto + importeIva;
      if (Math.abs(sumaCalculada - importeTotal) > 0.01) {
        console.warn(
          `Inconsistencia en importes: Total=${importeTotal}, Suma(Neto+IVA)=${sumaCalculada}`
        );
        // Ajustar importeTotal para que sea exactamente la suma
        datosComprobante.importeTotal = sumaCalculada;
      } else {
        datosComprobante.importeTotal = importeTotal;
      }

      datosComprobante.importeNeto = importeNeto;
      datosComprobante.importeIva = importeIva;

      // Asegurarse de que la fecha no sea futura
      const fechaActual = new Date()
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, "");
      if (datosComprobante.fecha > fechaActual) {
        console.warn(
          `Fecha futura detectada: ${datosComprobante.fecha}, usando fecha actual`
        );
        datosComprobante.fecha = fechaActual;
      }

      console.log(
        `NÚMERO DE COMPROBANTE DEFINITIVO: ${datosComprobante.numero}`
      );

      // Verificar el tipo de comprobante y establecer condición IVA adecuada
      const tipoComprobante = parseInt(datosComprobante.tipoComprobante, 10);
      let codIVAReceptor;

      // Forzar el tipo correcto (number) y el valor esperado según el tipo de comprobante
      if (
        tipoComprobante === 1 ||
        tipoComprobante === 2 ||
        tipoComprobante === 3
      ) {
        // Para Facturas A, usamos Responsable Inscripto (1)
        codIVAReceptor = 1; // Forzamos el valor correcto

        // Validar CUIT para factura tipo A (debe ser un CUIT válido, no DNI)
        if (datosComprobante.docTipo === 80 && datosComprobante.docNro) {
          // El CUIT debe tener 11 dígitos para Argentina
          if (
            datosComprobante.docNro.toString().replace(/\D/g, "").length !== 11
          ) {
            throw new Error(
              "Para Facturas A, el CUIT del receptor debe tener 11 dígitos"
            );
          }
        }
      } else {
        // Para Facturas B, C, etc.
        codIVAReceptor = 5; // Consumidor Final por defecto
      }

      console.log(
        `Usando código IVA receptor: ${codIVAReceptor} (tipo number: ${typeof codIVAReceptor})`
      );

      const nroComprobante = parseInt(datosComprobante.numero, 10);
      if (isNaN(nroComprobante)) {
        throw new Error(
          `Número de comprobante inválido: ${datosComprobante.numero}`
        );
      }

      // Asegurarse de que el DocNro sea numérico y válido
      const docNro = datosComprobante.nroDocReceptor
        ? parseInt(datosComprobante.nroDocReceptor.replace(/\D/g, ""), 10)
        : 0;

      if (!docNro || isNaN(docNro) || docNro < 1) {
        throw new Error(
          `Número de documento del receptor inválido: ${datosComprobante.nroDocReceptor}`
        );
      }

      console.log(
        `CUIT del receptor procesado: ${docNro} (original: ${datosComprobante.nroDocReceptor})`
      );

      // Asegurar consistencia en los importes
      const sumaImportes = importeNeto + importeIva;

      if (Math.abs(importeTotal - sumaImportes) > 0.1) {
        console.warn(
          `⚠️ Advertencia: El importe total (${importeTotal}) no coincide con la suma de importes (${sumaImportes})`
        );
        console.warn("Ajustando importe total para coincidir con la suma...");
      }

      // Verificar que haya información de IVA si hay importe neto
      const baseImp = importeNeto;
      const importeIvaCalc = importeIva;
      let alicuotaId = 5; // 5 = 21%

      // Determinar ID de alícuota según el porcentaje
      const porcentajeIva = parseFloat(datosComprobante.alicuotaIva) || 21;
      if (porcentajeIva === 27) alicuotaId = 6;
      else if (porcentajeIva === 10.5) alicuotaId = 4;
      else if (porcentajeIva === 5) alicuotaId = 8;
      else if (porcentajeIva === 2.5) alicuotaId = 9;
      else if (porcentajeIva === 0) alicuotaId = 3;

      // Agregar comprobantes asociados para notas de crédito
      let comprobantesAsociados = null;
      if (
        datosComprobante.comprobantesAsociados &&
        datosComprobante.comprobantesAsociados.length > 0
      ) {
        comprobantesAsociados = {
          CbteAsoc: datosComprobante.comprobantesAsociados.map((c) => ({
            Tipo: c.Tipo,
            PtoVta: c.PtoVta,
            Nro: c.Nro,
          })),
        };
      }

      // Construcción del objeto de solicitud
      const solicitud = {
        Auth: authData,
        FeCAEReq: {
          FeCabReq: {
            CantReg: 1,
            PtoVta: parseInt(datosComprobante.puntoVenta),
            CbteTipo: parseInt(tipoComprobante),
          },
          FeDetReq: {
            FECAEDetRequest: {
              Concepto: parseInt(datosComprobante.conceptoIncluido || 1),
              DocTipo: parseInt(datosComprobante.tipoDocReceptor || 80),
              DocNro: datosComprobante.nroDocReceptor,
              CbteDesde: nroComprobante,
              CbteHasta: nroComprobante,
              CbteFch: datosComprobante.fecha,
              ImpTotal: parseFloat(datosComprobante.importeTotal.toFixed(2)),
              ImpTotConc: 0,
              ImpNeto: parseFloat(datosComprobante.importeNeto.toFixed(2)),
              ImpOpEx: 0,
              ImpIVA: parseFloat(datosComprobante.importeIva.toFixed(2)),
              ImpTrib: 0,
              FchServDesde: null,
              FchServHasta: null,
              FchVtoPago: null,
              MonId: "PES",
              MonCotiz: 1,
              CondicionIVAReceptorId: codIVAReceptor,
              // Siempre agregar objeto IVA si hay importe neto
              Iva:
                importeNeto > 0
                  ? {
                      AlicIva: [
                        {
                          Id: alicuotaId,
                          BaseImp: baseImp,
                          Importe: importeIvaCalc,
                        },
                      ],
                    }
                  : null,
              // Añadir comprobantes asociados si existen (para notas de crédito)
              ...(comprobantesAsociados
                ? { CbtesAsoc: comprobantesAsociados }
                : {}),
            },
          },
        },
      };

      // Si el objeto IVA tiene valor null, eliminarlo para no enviarlo
      if (!solicitud.FeCAEReq.FeDetReq.FECAEDetRequest.Iva) {
        delete solicitud.FeCAEReq.FeDetReq.FECAEDetRequest.Iva;
      }

      console.log(
        "PASO 2: Enviando solicitud a AFIP:",
        JSON.stringify(solicitud)
      );

      // En el método obtenerCAE, antes de enviar la solicitud
      console.log("Solicitud a AFIP detallada:");
      console.log("- Auth:", {
        Token: "***TOKEN***", // No imprimir el token completo por seguridad
        Sign: "***SIGN***", // No imprimir la firma completa por seguridad
        Cuit: authData.Cuit,
      });
      console.log("- Datos del comprobante:");
      console.log(
        "  - Tipo:",
        solicitud.FeCAEReq.FeDetReq.FECAEDetRequest.CbteTipo
      );
      console.log(
        "  - Punto de venta:",
        solicitud.FeCAEReq.FeDetReq.FECAEDetRequest.PtoVta
      );
      console.log(
        "  - Número:",
        solicitud.FeCAEReq.FeDetReq.FECAEDetRequest.CbteDesde
      );
      console.log(
        "  - Fecha:",
        solicitud.FeCAEReq.FeDetReq.FECAEDetRequest.CbteFch
      );
      console.log(
        "  - Doc. Receptor:",
        solicitud.FeCAEReq.FeDetReq.FECAEDetRequest.DocTipo,
        solicitud.FeCAEReq.FeDetReq.FECAEDetRequest.DocNro
      );
      console.log("  - Importes:", {
        Total: solicitud.FeCAEReq.FeDetReq.FECAEDetRequest.ImpTotal,
        Neto: solicitud.FeCAEReq.FeDetReq.FECAEDetRequest.ImpNeto,
        IVA: solicitud.FeCAEReq.FeDetReq.FECAEDetRequest.ImpIVA,
      });

      // Ejecutar solicitud
      const resultado = await new Promise((resolve, reject) => {
        client.FECAESolicitar(solicitud, function (err, result) {
          if (err) {
            console.error("Error en llamada a FECAESolicitar:", err);
            return reject(err);
          }
          if (!result) {
            console.error("Respuesta vacía de AFIP");
            return reject(new Error("Respuesta vacía de AFIP"));
          }
          console.log(
            "Respuesta de FECAESolicitar recibida:",
            JSON.stringify(result)
          );
          resolve(result);
        });
      });

      console.log("Procesando respuesta de AFIP:", JSON.stringify(resultado));

      // Verificar errores en la respuesta
      if (resultado.FECAESolicitarResult.Errors) {
        const errorInfo = resultado.FECAESolicitarResult.Errors.Err;
        if (Array.isArray(errorInfo)) {
          const errorMsg = errorInfo
            .map((e) => `Error ${e.Code}: ${e.Msg}`)
            .join("; ");
          throw new Error(errorMsg);
        } else if (errorInfo) {
          throw new Error(`Error ${errorInfo.Code}: ${errorInfo.Msg}`);
        } else {
          throw new Error("Hubo un error en la solicitud de CAE sin detalles");
        }
      }

      // Verificar si hay detalle de respuesta
      if (
        !resultado.FECAESolicitarResult.FeDetResp ||
        !resultado.FECAESolicitarResult.FeDetResp.FECAEDetResponse
      ) {
        throw new Error("Respuesta de AFIP sin detalles del CAE");
      }

      // Obtener el detalle de la respuesta (como puede ser un array, aseguramos acceder al primer elemento)
      const detalle = Array.isArray(
        resultado.FECAESolicitarResult.FeDetResp.FECAEDetResponse
      )
        ? resultado.FECAESolicitarResult.FeDetResp.FECAEDetResponse[0]
        : resultado.FECAESolicitarResult.FeDetResp.FECAEDetResponse;

      console.log("Detalle de respuesta CAE:", JSON.stringify(detalle));

      // Verificar si hay CAE en la respuesta y es válido
      console.log("Verificando CAE recibido:", detalle.CAE);

      // Verificar si hay observaciones
      const tieneCae = detalle.CAE && detalle.CAE.length > 0;
      const tieneObservaciones =
        detalle.Observaciones && detalle.Observaciones.Obs;

      if (tieneCae) {
        console.log("CAE obtenido exitosamente:", detalle.CAE);
        console.log("Fecha vencimiento CAE:", detalle.CAEFchVto);

        // Formatear fecha de vencimiento si existe
        let fechaVencimiento = null;
        if (detalle.CAEFchVto) {
          // La fecha viene en formato AAAAMMDD, convertir a YYYY-MM-DD para MySQL
          const fechaStr = detalle.CAEFchVto;
          if (fechaStr.length === 8) {
            fechaVencimiento = `${fechaStr.substring(
              0,
              4
            )}-${fechaStr.substring(4, 6)}-${fechaStr.substring(6, 8)}`;
          } else {
            fechaVencimiento = fechaStr;
          }
          console.log("Fecha vencimiento formateada:", fechaVencimiento);
        }

        return {
          success: true,
          cae: detalle.CAE,
          fechaVencimiento: fechaVencimiento,
          resultado: detalle.Resultado,
          detalleCompleto: detalle,
        };
      } else {
        // Verificar si hay observaciones
        let observaciones = [];
        if (tieneObservaciones) {
          if (Array.isArray(detalle.Observaciones.Obs)) {
            observaciones = detalle.Observaciones.Obs.map(
              (o) => `${o.Code}: ${o.Msg}`
            );
          } else {
            observaciones = [
              `${detalle.Observaciones.Obs.Code}: ${detalle.Observaciones.Obs.Msg}`,
            ];
          }
          console.warn("Observaciones:", observaciones);
        }

        return {
          success: detalle.Resultado === "A",
          cae: null,
          fechaVencimientoCAE: null,
          resultado: detalle.Resultado,
          observaciones: observaciones,
        };
      }
    } catch (error) {
      console.error("Error al obtener CAE:", error);
      throw new Error(`Error al obtener CAE: ${error.message}`);
    }
  }

  formatearFecha(fechaString) {
    // Convertir AAAAMMDD a fecha legible
    if (!fechaString) return null;
    const año = fechaString.substr(0, 4);
    const mes = fechaString.substr(4, 2);
    const dia = fechaString.substr(6, 2);
    return `${dia}/${mes}/${año}`;
  }

  async consultarCotizacion(moneda) {
    try {
      console.log(`Consultando cotización para moneda: ${moneda}`);

      // Obtener cliente SOAP
      const client = await this.getWSFEClient();
      if (!client) {
        throw new Error("No se pudo obtener el cliente SOAP");
      }

      // Obtener datos de autenticación
      const auth = await this.getAuthData();
      console.log(
        "Datos de autenticación obtenidos para consulta de cotización"
      );

      // Preparar parámetros (MonId es el código de moneda según AFIP)
      const params = {
        Auth: auth,
        MonId: moneda.toUpperCase(),
      };

      console.log(
        `Enviando consulta de cotización a AFIP para moneda: ${moneda}`
      );

      // Ejecutar consulta
      const resultado = await new Promise((resolve, reject) => {
        client.FEParamGetCotizacion(params, function (err, result) {
          if (err) {
            console.error("Error en llamada a FEParamGetCotizacion:", err);
            return reject(err);
          }
          if (!result) {
            console.error("Respuesta vacía de AFIP");
            return reject(new Error("Respuesta vacía de AFIP"));
          }
          resolve(result);
        });
      });

      console.log(
        "Respuesta de cotización recibida:",
        JSON.stringify(resultado)
      );

      // Verificar si hay errores en la respuesta
      if (resultado.FEParamGetCotizacionResult.Errors) {
        const errorInfo = resultado.FEParamGetCotizacionResult.Errors.Err;
        if (Array.isArray(errorInfo)) {
          const errorMsg = errorInfo
            .map((e) => `Error ${e.Code}: ${e.Msg}`)
            .join("; ");
          throw new Error(errorMsg);
        } else if (errorInfo) {
          throw new Error(`Error ${errorInfo.Code}: ${errorInfo.Msg}`);
        }
      }

      // Verificar que la respuesta tenga la estructura esperada
      if (!resultado.FEParamGetCotizacionResult.ResultGet) {
        throw new Error("Respuesta de AFIP con formato inesperado");
      }

      // Extraer datos de la cotización
      const cotizacionData = resultado.FEParamGetCotizacionResult.ResultGet;

      return {
        success: true,
        moneda: cotizacionData.MonId,
        fecha: this.formatearFecha(cotizacionData.FchCotiz),
        cotizacion: parseFloat(cotizacionData.MonCotiz),
        respuestaCompleta: cotizacionData,
      };
    } catch (error) {
      console.error("Error al consultar cotización:", error);
      throw new Error(`Error al consultar cotización: ${error.message}`);
    }
  }

  // Método para formatear errores de AFIP en un mensaje legible
  formatearErrores(errors) {
    try {
      if (!errors) return "Error desconocido";

      // Si es un arreglo de errores
      if (Array.isArray(errors.Err)) {
        return errors.Err.map((e) => `Código ${e.Code}: ${e.Msg}`).join(". ");
      }

      // Si es un solo error
      if (errors.Err) {
        return `Código ${errors.Err.Code}: ${errors.Err.Msg}`;
      }

      // Si tiene una estructura diferente
      return JSON.stringify(errors);
    } catch (error) {
      console.error("Error al formatear errores:", error);
      return "Error al procesar la respuesta de AFIP";
    }
  }

  /**
   * Genera un ticket de acceso para el servicio especificado
   */
  async generarTicketAcceso(service, empresa) {
    try {
      console.log(`Generando ticket de acceso para servicio ${service}`);
      const fs = require("fs");
      const path = require("path");
      const soap = require("soap");
      const crypto = require("crypto");
      const xml2js = require("xml2js");

      // Verificar existencia de certificados
      const { certPath, keyPath } = this.getCertificatePaths(empresa);

      if (!fs.existsSync(certPath)) {
        throw new Error(`Certificado no encontrado en ${certPath}`);
      }

      if (!fs.existsSync(keyPath)) {
        throw new Error(`Clave privada no encontrada en ${keyPath}`);
      }

      // Generar TRA
      const currentTime = new Date();
      const expirationTime = new Date(currentTime.getTime() + 600000); // 10 minutos

      const traXml = `<?xml version="1.0" encoding="UTF-8" ?>
      <loginTicketRequest version="1.0">
        <header>
          <uniqueId>${Math.floor(Date.now() / 1000)}</uniqueId>
          <generationTime>${currentTime.toISOString()}</generationTime>
          <expirationTime>${expirationTime.toISOString()}</expirationTime>
        </header>
        <service>${service}</service>
      </loginTicketRequest>`;

      // Firmar TRA
      const cert = fs.readFileSync(certPath, "utf8");
      const key = fs.readFileSync(keyPath, "utf8");

      const p7 = crypto.createSign("RSA-SHA1");
      p7.write(traXml);
      p7.end();

      const signature = p7.sign({ key, cert }, "base64");

      // Llamar a WSAA
      const wsdlUrl = "https://wsaa.afip.gov.ar/ws/services/LoginCms?wsdl";
      const client = await soap.createClientAsync(wsdlUrl);

      const result = await client.loginCmsAsync({
        in0: signature,
      });

      // Parsear respuesta
      const response = result[0].loginCmsReturn;
      const parser = new xml2js.Parser({ explicitArray: false });
      const parsedResponse = await parser.parseStringPromise(response);

      return {
        token: parsedResponse.loginTicketResponse.credentials.token,
        sign: parsedResponse.loginTicketResponse.credentials.sign,
        expirationTime:
          parsedResponse.loginTicketResponse.header.expirationTime,
      };
    } catch (error) {
      console.error(`Error al generar ticket de acceso: ${error.message}`);
      throw new Error(`Error al generar ticket de acceso: ${error.message}`);
    }
  }

  getCertificatePaths(empresa) {
    const path = require("path");

    // Obtener la ruta base de la aplicación
    const basePath = path.resolve(__dirname, "../../");

    // Corregir las rutas para evitar duplicaciones
    let certPath = empresa.certificado;
    let keyPath = empresa.key;

    // Si las rutas son relativas, resolverlas correctamente
    if (!path.isAbsolute(certPath)) {
      certPath = path.resolve(basePath, certPath);
    }

    if (!path.isAbsolute(keyPath)) {
      keyPath = path.resolve(basePath, keyPath);
    }

    console.log("Rutas de certificados resueltas:", {
      certPath,
      keyPath,
      existeCert: require("fs").existsSync(certPath),
      existeKey: require("fs").existsSync(keyPath),
    });

    return { certPath, keyPath };
  }
}

async function testCertificado() {
  try {
    const cuit = process.env.EMPRESA_CUIT;
    const certPath = process.env.EMPRESA_CERTIFICADO;
    const keyPath = process.env.EMPRESA_KEY;

    console.log("Probando certificados con CUIT:", cuit);
    console.log(
      "Certificado:",
      fs.existsSync(certPath) ? "Existe" : "No existe"
    );
    console.log(
      "Clave privada:",
      fs.existsSync(keyPath) ? "Existe" : "No existe"
    );

    // Generar TRA (XML de solicitud de ticket)
    const tra = generarTRA("wsfe");

    // Firmar TRA con certificados
    const cms = firmarTRA(tra, certPath, keyPath);

    // Llamar a WSAA para obtener TA
    const wsaaWsdl =
      "https://servicios1.afip.gov.ar/wso/services/LoginCms?wsdl";
    const client = await soap.createClientAsync(wsaaWsdl);

    const result = await client.loginCmsAsync({
      in0: cms,
    });

    console.log("Autenticación exitosa! Ticket obtenido.");
    return "Certificados válidos";
  } catch (error) {
    console.error("Error en prueba de certificados:", error);
    return `Error: ${error.message}`;
  }
}

function generarTRA(service) {
  // Actual TRA generation code...
  // (Simplificado para este ejemplo)
}

function firmarTRA(tra, cert, key) {
  // Actual signing code...
  // (Simplificado para este ejemplo)
}

// testCertificado().then(console.log).catch(console.error);

module.exports = new AfipService();

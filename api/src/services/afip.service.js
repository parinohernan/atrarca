const soap = require("soap");
const wsaaService = require("./wsaa.service");

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
    this.cuit = null; // Se establecerá por empresa
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

      console.log(`Usando CUIT: ${this.cuit} para autenticación`);

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
      console.log(
        `Consultando último comprobante: PV=${puntoVenta}, TC=${tipoComprobante}`
      );

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

      // Verificar formato de fecha
      if (datosComprobante.fecha && datosComprobante.fecha.includes("-")) {
        datosComprobante.fecha = datosComprobante.fecha.replace(/-/g, "");
      }

      // Primera consulta explícita para obtener el último comprobante autorizado
      console.log(
        "PASO 1: Consultando explícitamente el último comprobante autorizado..."
      );
      try {
        // Preparar parámetros
        const paramsConsulta = {
          Auth: authData,
          PtoVta: parseInt(datosComprobante.puntoVenta, 10),
          CbteTipo: parseInt(datosComprobante.tipoComprobante, 10),
        };

        console.log("Parámetros de consulta:", JSON.stringify(paramsConsulta));

        // Ejecutar consulta directamente
        const resultadoConsulta = await new Promise((resolve, reject) => {
          client.FECompUltimoAutorizado(paramsConsulta, function (err, result) {
            if (err) {
              console.error("Error en llamada a FECompUltimoAutorizado:", err);
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
          "RESPUESTA DE ÚLTIMO COMPROBANTE:",
          JSON.stringify(resultadoConsulta)
        );

        // Determinar el número a usar
        let ultimoNumero;
        let siguienteNumero;

        if (
          resultadoConsulta.FECompUltimoAutorizadoResult &&
          resultadoConsulta.FECompUltimoAutorizadoResult.CbteNro !== undefined
        ) {
          ultimoNumero = resultadoConsulta.FECompUltimoAutorizadoResult.CbteNro;
          siguienteNumero = ultimoNumero + 1;
          console.log(
            `Último comprobante según AFIP: ${ultimoNumero}, Siguiente: ${siguienteNumero}`
          );
        } else if (
          resultadoConsulta.FECompUltimoAutorizadoResult &&
          resultadoConsulta.FECompUltimoAutorizadoResult.Errors
        ) {
          // Si hay errores, es posible que sea porque no hay comprobantes previos
          const errors = Array.isArray(
            resultadoConsulta.FECompUltimoAutorizadoResult.Errors.Err
          )
            ? resultadoConsulta.FECompUltimoAutorizadoResult.Errors.Err
            : [resultadoConsulta.FECompUltimoAutorizadoResult.Errors.Err];

          // Código 1502 indica que no hay comprobantes previos
          if (errors.some((e) => e.Code === 1502)) {
            console.log(
              "AFIP informa que no hay comprobantes previos. Se usará número 1."
            );
            ultimoNumero = 0;
            siguienteNumero = 1;
          } else {
            // Otro tipo de error
            const errorMsg = errors
              .map((e) => `${e.Code}: ${e.Msg}`)
              .join("; ");
            throw new Error(
              `Errores al consultar último comprobante: ${errorMsg}`
            );
          }
        } else {
          throw new Error(
            "Formato de respuesta inesperado al consultar último comprobante"
          );
        }

        // Establecer el número de comprobante correcto
        datosComprobante.numero = siguienteNumero;
        console.log(
          `NÚMERO DE COMPROBANTE DEFINITIVO: ${datosComprobante.numero}`
        );
      } catch (error) {
        console.error("Error al consultar último comprobante:", error);

        // Si el error es por "no existe comprobante", usamos número 1
        if (
          error.message.includes("1502") ||
          error.message.includes("no existe") ||
          error.message.includes("inexistente")
        ) {
          console.log(
            "Error esperado: No hay comprobantes previos. Se usará número 1."
          );
          datosComprobante.numero = 1;
        } else {
          throw new Error(
            `No se pudo determinar el número de comprobante: ${error.message}`
          );
        }
      }

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

      // Construcción del objeto de solicitud
      const solicitud = {
        Auth: authData,
        FeCAEReq: {
          FeCabReq: {
            CantReg: 1,
            PtoVta: parseInt(datosComprobante.puntoVenta, 10),
            CbteTipo: tipoComprobante,
          },
          FeDetReq: {
            FECAEDetRequest: {
              Concepto: parseInt(datosComprobante.concepto || 1, 10),
              DocTipo: parseInt(datosComprobante.docTipo || 80, 10),
              DocNro: datosComprobante.docNro,
              CbteDesde: parseInt(datosComprobante.numero, 10),
              CbteHasta: parseInt(datosComprobante.numero, 10),
              CbteFch: datosComprobante.fecha,
              ImpTotal: parseFloat(datosComprobante.importeTotal),
              ImpTotConc: parseFloat(datosComprobante.importeNoGravado || 0),
              ImpNeto: parseFloat(datosComprobante.importeNeto),
              ImpOpEx: parseFloat(datosComprobante.importeExento || 0),
              ImpIVA: parseFloat(datosComprobante.importeIVA || 0),
              ImpTrib: parseFloat(datosComprobante.importeTributos || 0),
              FchServDesde: datosComprobante.fechaServicioDesde || null,
              FchServHasta: datosComprobante.fechaServicioHasta || null,
              FchVtoPago: datosComprobante.fechaVencimientoPago || null,
              MonId: datosComprobante.moneda || "PES",
              MonCotiz: parseFloat(datosComprobante.cotizacion || 1),
              CondicionIVAReceptorId: codIVAReceptor, // Nombre correcto del campo
            },
          },
        },
      };

      // Si hay IVA, agregarlo al request
      if (datosComprobante.iva && datosComprobante.iva.length > 0) {
        solicitud.FeCAEReq.FeDetReq.FECAEDetRequest.Iva = {
          AlicIva: datosComprobante.iva.map((item) => ({
            Id: parseInt(item.Id, 10),
            BaseImp: parseFloat(item.BaseImp),
            Importe: parseFloat(item.Importe),
          })),
        };
      }

      console.log(
        "PASO 2: Enviando solicitud a AFIP:",
        JSON.stringify(solicitud)
      );

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

      if (!detalle.CAE || detalle.CAE === "") {
        console.warn("No se recibió CAE en la respuesta");

        // Verificar si hay observaciones
        let observaciones = [];
        if (detalle.Observaciones && detalle.Observaciones.Obs) {
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

      // Si llegamos aquí, hay un CAE válido
      console.log("CAE obtenido exitosamente:", detalle.CAE);

      // Respuesta normal con CAE
      return {
        success: true,
        cae: detalle.CAE,
        fechaVencimientoCAE: this.formatearFecha(detalle.CAEFchVto),
        resultado: detalle.Resultado,
        observaciones: detalle.Observaciones
          ? Array.isArray(detalle.Observaciones.Obs)
            ? detalle.Observaciones.Obs.map((o) => `${o.Code}: ${o.Msg}`)
            : [
                `${detalle.Observaciones.Obs.Code}: ${detalle.Observaciones.Obs.Msg}`,
              ]
          : [],
      };
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
}

module.exports = new AfipService();

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
    this.cuit = process.env.AFIP_CUIT || "20278280641";
    this.wsfeClient = null;
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

  async getAuthData() {
    try {
      // Verificar que el CUIT está configurado
      if (!this.cuit) {
        throw new Error(
          "No se ha configurado el CUIT. Verifique la variable de entorno AFIP_CUIT"
        );
      }

      console.log(`Usando CUIT: ${this.cuit} para autenticación`);

      const { token, sign } = await wsaaService.authenticate("wsfe");
      return {
        Token: token,
        Sign: sign,
        Cuit: this.cuit, // Asegurarse que se usa el mismo CUIT del certificado
      };
    } catch (error) {
      console.error("Error al obtener datos de autenticación:", error);
      throw error;
    }
  }

  async consultarUltimoComprobante(puntoVenta, tipoComprobante) {
    try {
      console.log(
        `Consultando último comprobante: PV=${puntoVenta}, TC=${tipoComprobante}`
      );

      // Obtener cliente SOAP
      const client = await this.getWSFEClient();
      if (!client) {
        throw new Error("No se pudo obtener el cliente SOAP");
      }

      // Obtener datos de autenticación
      const auth = await this.getAuthData();
      console.log("Datos de autenticación obtenidos:", {
        token: auth.Token ? "presente" : "ausente",
        sign: auth.Sign ? "presente" : "ausente",
        cuit: auth.Cuit,
      });

      // Preparar parámetros
      const params = {
        Auth: auth,
        PtoVta: parseInt(puntoVenta, 10),
        CbteTipo: parseInt(tipoComprobante, 10),
      };

      console.log("Enviando consulta a AFIP con CUIT:", auth.Cuit);

      // Ejecutar consulta
      const resultado = await new Promise((resolve, reject) => {
        client.FECompUltimoAutorizado(params, function (err, result) {
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

      console.log("Respuesta de AFIP recibida:", JSON.stringify(resultado));

      // Verificar que la respuesta tenga la estructura esperada
      if (!resultado.FECompUltimoAutorizadoResult) {
        throw new Error("Respuesta de AFIP con formato inesperado");
      }

      // Procesar respuesta - Manejar el error específico 601
      if (resultado.FECompUltimoAutorizadoResult.Errors) {
        if (Array.isArray(resultado.FECompUltimoAutorizadoResult.Errors.Err)) {
          // Si hay múltiples errores
          const errors = resultado.FECompUltimoAutorizadoResult.Errors.Err;
          const errorMsgs = errors
            .map((e) => `Error ${e.Code}: ${e.Msg}`)
            .join("; ");

          // Verificar si alguno de los errores es el específico para "no existe comprobante"
          if (errors.some((e) => e.Code === 1502)) {
            console.log(
              "No existen comprobantes para ese punto de venta y tipo. Se utilizará número 1."
            );
            return {
              success: true,
              ultimoComprobante: 0,
              puntoVenta,
              tipoComprobante,
              fecha: new Date().toLocaleDateString(),
            };
          }

          throw new Error(errorMsgs);
        } else if (resultado.FECompUltimoAutorizadoResult.Errors.Err) {
          // Si hay un solo error
          const error = resultado.FECompUltimoAutorizadoResult.Errors.Err;

          // Error específico de CUIT
          if (error.Code === 601) {
            throw new Error(
              `El CUIT ${this.cuit} no está autorizado. Verifique que el certificado fue generado para este CUIT.`
            );
          }

          // Error específico para "no existe comprobante"
          if (error.Code === 1502) {
            console.log(
              "No existen comprobantes para ese punto de venta y tipo. Se utilizará número 1."
            );
            return {
              success: true,
              ultimoComprobante: 0,
              puntoVenta,
              tipoComprobante,
              fecha: new Date().toLocaleDateString(),
            };
          }

          throw new Error(`Error ${error.Code}: ${error.Msg}`);
        } else {
          throw new Error("Hubo un error en la consulta a AFIP sin detalles");
        }
      }

      return {
        success: true,
        ultimoComprobante: resultado.FECompUltimoAutorizadoResult.CbteNro,
        puntoVenta,
        tipoComprobante,
        fecha: new Date().toLocaleDateString(),
      };
    } catch (error) {
      console.error("Error al consultar último comprobante:", error);

      // Comprobar si el error es por "no existe comprobante"
      if (
        error.message.includes("no existe") ||
        error.message.includes("inexistente") ||
        error.message.includes("1502")
      ) {
        console.log(
          "No existen comprobantes para ese punto de venta y tipo. Se utilizará número 1."
        );
        return {
          success: true,
          ultimoComprobante: 0,
          puntoVenta,
          tipoComprobante,
          fecha: new Date().toLocaleDateString(),
        };
      }

      // Manejo seguro del mensaje de error
      const errorMsg = error.message || "Error desconocido";
      throw new Error(`Error al consultar AFIP: ${errorMsg}`);
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

  async obtenerCAE(datosComprobante) {
    try {
      console.log(
        "Iniciando solicitud de CAE con datos:",
        JSON.stringify(datosComprobante)
      );

      // Obtener cliente SOAP
      const client = await this.getWSFEClient();
      if (!client) {
        throw new Error("No se pudo obtener el cliente SOAP");
      }

      // Obtener datos de autenticación
      const auth = await this.getAuthData();
      console.log("Datos de autenticación obtenidos:", {
        token: auth.Token ? "presente" : "ausente",
        sign: auth.Sign ? "presente" : "ausente",
        cuit: auth.Cuit,
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
          Auth: auth,
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
        Auth: auth,
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

      const detalle = resultado.FECAESolicitarResult.FeDetResp.FECAEDetResponse;

      console.log("Detalle de respuesta CAE:", JSON.stringify(detalle));

      // Verificar si hay CAE en la respuesta
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
}

module.exports = new AfipService();

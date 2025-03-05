const soap = require("soap");
const fs = require("fs");
const path = require("path");

// Configuración del certificado y clave
const certificado = fs.readFileSync(
  path.resolve(__dirname, "certificado.crt"),
  "utf8"
);
const clave = fs.readFileSync(path.resolve(__dirname, "clave.key"), "utf8");

// Obtener token de acceso (WSAA)
const wsaa_url = "https://wsaa.afip.gov.ar/ws/services/LoginCms?wsdl";
const solicitud = `<loginTicketRequest>
    <header>
        <uniqueId>${Date.now()}</uniqueId>
        <generationTime>${new Date().toISOString()}</generationTime>
        <expirationTime>${new Date(
          Date.now() + 3600 * 1000
        ).toISOString()}</expirationTime>
    </header>
    <service>wsfe</service>
</loginTicketRequest>`;

soap.createClient(wsaa_url, (err, client) => {
  if (err) throw err;

  client.loginCms({ in0: solicitud }, (err, result) => {
    if (err) throw err;

    const token = result.loginCmsReturn;

    // Usar el token en WSFE para emitir factura
    const wsfe_url = "https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL";
    soap.createClient(wsfe_url, (err, client_wsfe) => {
      if (err) throw err;

      const factura = {
        Auth: {
          Token: token,
          Sign: "firma",
          Cuit: "TU_CUIT",
        },
        FeCAEReq: {
          // Datos de la factura
        },
      };

      client_wsfe.FECAESolicitar(factura, (err, result) => {
        if (err) throw err;

        const cae = result.FECAESolicitarResult.FeCabResp.CAE;
        console.log("CAE obtenido:", cae);
      });
    });
  });
});

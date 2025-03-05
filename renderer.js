document.addEventListener("DOMContentLoaded", () => {
  const consultaForm = document.getElementById("consultaForm");
  const resultadoDiv = document.getElementById("resultado");
  const errorDiv = document.getElementById("error");

  consultaForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Resetear mensajes anteriores
    resultadoDiv.style.display = "none";
    errorDiv.textContent = "";

    const puntoVenta = document.getElementById("puntoVenta").value;
    const tipoComprobante = document.getElementById("tipoComprobante").value;

    if (!puntoVenta || !tipoComprobante) {
      errorDiv.textContent = "Por favor, completa todos los campos.";
      return;
    }

    try {
      // Llamar a la función expuesta por el preload.js
      const respuesta = await window.electronAPI.consultarUltimoComprobante({
        puntoVenta: parseInt(puntoVenta),
        tipoComprobante: parseInt(tipoComprobante),
      });

      if (respuesta.exito) {
        resultadoDiv.innerHTML = `
                    <h3>Resultado de la consulta</h3>
                    <p><strong>Último comprobante:</strong> ${
                      respuesta.datos.ultimoComprobante
                    }</p>
                    <p><strong>Fecha:</strong> ${
                      respuesta.datos.fecha || "No disponible"
                    }</p>
                    <pre>${JSON.stringify(respuesta.datos, null, 2)}</pre>
                `;
        resultadoDiv.style.display = "block";
      } else {
        errorDiv.textContent = `Error: ${respuesta.error}`;
      }
    } catch (error) {
      errorDiv.textContent = `Error inesperado: ${error.message}`;
      console.error(error);
    }
  });
});

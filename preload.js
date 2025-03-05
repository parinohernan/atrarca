const { contextBridge, ipcRenderer } = require("electron");

// Expone funciones seguras al proceso de renderizado
contextBridge.exposeInMainWorld("electronAPI", {
  consultarUltimoComprobante: (datos) =>
    ipcRenderer.invoke("consultar-ultimo-comprobante", datos),
});

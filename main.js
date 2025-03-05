const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const afip = require("./afip");

// Mantén una referencia global del objeto window para evitar que se cierre automáticamente
let mainWindow;

function createWindow() {
  // Crear la ventana del navegador
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Cargar el archivo HTML de la aplicación
  mainWindow.loadFile("index.html");

  // Abre las DevTools (opcional, para desarrollo)
  // mainWindow.webContents.openDevTools();

  // Emitido cuando la ventana es cerrada
  mainWindow.on("closed", function () {
    // Desreferencia el objeto window
    mainWindow = null;
  });
}

// Este método se llamará cuando Electron haya terminado de inicializarse
app.whenReady().then(() => {
  createWindow();

  app.on("activate", function () {
    // En macOS es común volver a crear una ventana cuando
    // se hace clic en el icono del dock y no hay otras ventanas abiertas
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Salir de la aplicación cuando todas las ventanas estén cerradas
app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});

// Maneja la comunicación desde el proceso de renderizado
ipcMain.handle("consultar-ultimo-comprobante", async (event, datos) => {
  try {
    const resultado = await afip.consultarUltimoComprobante(datos);
    return { exito: true, datos: resultado };
  } catch (error) {
    return { exito: false, error: error.message };
  }
});

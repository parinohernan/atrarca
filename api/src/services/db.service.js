const mysql = require("mysql2/promise");

class DBService {
  constructor() {
    this.connections = {};
  }

  // Obtener una conexión para una empresa específica
  async getConnection(empresa) {
    if (!empresa) {
      throw new Error(
        "Se requiere información de la empresa para conectar a la base de datos"
      );
    }

    const connectionKey = `${empresa.dbHost}_${empresa.dbName}_${empresa.dbUser}`;

    // Si ya tenemos una conexión activa, la reutilizamos
    if (
      this.connections[connectionKey] &&
      this.connections[connectionKey].connection
    ) {
      try {
        // Verificar que la conexión siga activa
        await this.connections[connectionKey].connection.query("SELECT 1");
        return this.connections[connectionKey].connection;
      } catch (error) {
        console.log("Conexión expirada, creando una nueva");
        // Si la conexión falló, creamos una nueva
        delete this.connections[connectionKey];
      }
    }

    try {
      // Crear una nueva conexión
      const connection = await mysql.createConnection({
        host: empresa.dbHost,
        port: empresa.dbPort || 3306,
        user: empresa.dbUser,
        password: empresa.dbPassword,
        database: empresa.dbName,
      });

      // Guardar la conexión para uso futuro
      this.connections[connectionKey] = {
        connection,
        lastUsed: new Date(),
      };

      console.log(
        `Conexión establecida con ${empresa.dbHost}/${empresa.dbName}`
      );
      return connection;
    } catch (error) {
      console.error("Error al conectar a la base de datos:", error);
      throw new Error(`Error de conexión a la base de datos: ${error.message}`);
    }
  }

  // Ejecutar una consulta en la base de datos
  async query(empresa, sql, params = []) {
    const connection = await this.getConnection(empresa);
    try {
      const [results] = await connection.query(sql, params);
      return results;
    } catch (error) {
      console.error("Error al ejecutar consulta SQL:", error);
      throw new Error(`Error en consulta SQL: ${error.message}`);
    }
  }

  // Método para limpiar conexiones antiguas
  cleanupConnections() {
    const now = new Date();
    const timeout = 30 * 60 * 1000; // 30 minutos

    Object.keys(this.connections).forEach((key) => {
      const connectionInfo = this.connections[key];
      if (now - connectionInfo.lastUsed > timeout) {
        console.log(`Cerrando conexión inactiva: ${key}`);
        try {
          connectionInfo.connection.end();
        } catch (e) {
          console.error("Error al cerrar conexión:", e);
        }
        delete this.connections[key];
      }
    });
  }
}

// Iniciar la limpieza de conexiones cada 15 minutos
const dbService = new DBService();
setInterval(() => dbService.cleanupConnections(), 15 * 60 * 1000);

module.exports = dbService;

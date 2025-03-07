// Constante con usuarios y empresas registradas
const users = [
  {
    username: "admin",
    password: "admin123",
    name: "Administrador",
    role: "admin",
  },
  {
    username: "empresa1",
    password: "empresa1",
    name: "JHP DEVELOPMENT",
    role: "user",
    empresa: {
      cuit: "20278280641",
      razonSocial: "JHP DEVELOPMENT SRL",
      certificado: "jhp.crt",
      key: "jhp.key",
    },
  },
  {
    username: "empresa2",
    password: "empresa2",
    name: "deliverydeagua",
    role: "user",
    empresa: {
      cuit: "27248910297",
      razonSocial: "deliverydeagua",
      certificado: "agua.crt",
      key: "agua.key",
    },
  },
  {
    username: "empresa3",
    password: "empresa3",
    name: "SAAS SRL",
    role: "user",
    empresa: {
      cuit: "33708222629",
      razonSocial: "SAAS SRL",
      certificado: "saa.crt",
      key: "saa.key",
    },
  },
];

// Función para validar usuario
const validateUser = (username, password) => {
  const user = users.find(
    (u) => u.username === username && u.password === password
  );
  return user || null;
};

// Función para obtener usuario por username
const getUserByUsername = (username) => {
  return users.find((u) => u.username === username) || null;
};

module.exports = {
  users,
  validateUser,
  getUserByUsername,
};

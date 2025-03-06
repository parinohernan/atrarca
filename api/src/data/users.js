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
    name: "Empresa Uno SRL",
    role: "user",
    empresa: {
      cuit: "20278280641",
      razonSocial: "Empresa Uno SRL",
      certificado: "jhp.crt",
      key: "jhp.key",
    },
  },
  {
    username: "empresa2",
    password: "empresa2",
    name: "Distribuidora Dos SA",
    role: "user",
    empresa: {
      cuit: "20267565393",
      razonSocial: "Distribuidora Dos SA",
      certificado: "empresa2.crt",
      key: "empresa2.key",
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

// export const socketConfig = {
//   origin: "*",
//   methods: ["GET", "POST"],
// };


export const socketConfig = {
  cors: {
    origin: "",
    methods: ["GET", "POST", "OPTIONS", "PUT", "PATCH", "DELETE"],
    credentials: true,
    allowedHeaders: [""],
  },
  allowEIO3: true,
  transports: ['websocket', 'polling'],
  path: '/socket.io/',
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  allowUpgrades: true
};
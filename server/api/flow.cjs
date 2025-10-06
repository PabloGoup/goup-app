// /api/flow.cjs
const serverless = require('serverless-http');

// IMPORTA tu app Express desde tu server actual.
// Asegúrate que flowServer.cjs exporte el "app" de Express (module.exports = app)
const app = require('../server/flowServer.cjs');

// Si tu flowServer.cjs arranca el .listen(), envuélvelo para que NO escuche en vercel.
// Tip: en flowServer.cjs protege el listen con: if (!process.env.VERCEL) app.listen(PORT)
module.exports = async (req, res) => {
  const handler = serverless(app);
  return handler(req, res);
};
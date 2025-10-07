// Endpoint mínimo, NO usa tu Express.
module.exports = (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(JSON.stringify({ ok: true, ts: Date.now() }));
  };
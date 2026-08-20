const net = require('net');

['localhost', '127.0.0.1', '::1'].forEach((host) => {
  const s = net.createConnection({ port: 5432, host }, () => {
    console.log(`[SUCCESS] Connected to ${host}:5432`);
    s.destroy();
  });
  s.on('error', (err) => {
    console.error(`[FAILED] ${host}:5432 - ${err.message}`);
  });
});

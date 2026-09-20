const fs = require('fs');
try {
  require('./src/routes/passwordRoutes.js');
} catch (e) {
  fs.writeFileSync('err.txt', e.stack || e.toString());
}

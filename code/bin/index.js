var express = require('express');
var router = express.Router();

// router.get('/', function(req, res, next) {
//   res .format ({
//     'text/html': () => res .send ('<title>moneyMap</title><script src="js/Init.js"></script>')
//   });
// });

router.get('/', function(req, res, next) {
  const head = '<title>moneyMap</title><script src="js/Init.js"></script>';
  const html = '<!DOCTYPE html> <html><head>' + head + '</head></html>';
  res .format ({
    'text/html': () => res .send (html)
  });
});




module.exports = router;

var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
  res .format ({
    'text/html': () => res .send ('<title>moneyMap</title><script src="js/Init.js"></script>')
  });
});

module.exports = router;

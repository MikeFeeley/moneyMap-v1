'use strict';

var util = require ('../browser/js/util');

for (let x of Object .keys (util))
  exports [x] = util [x];


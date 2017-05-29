'use strict';

var express  = require ('express');
var async    = require ('../lib/async.js');
var ObjectID = require ('mongodb').ObjectID
var router  = express.Router();

// Workaround Mongodb limitation that $not can not be compbined with $regex
function notregexReplace (obj) {
  for (let p in obj)
    if (p == '$notregex') {
      obj ['$not'] = new RegExp (obj [p]);
      delete obj ['$notregex'];
    } else if (typeof obj [p] == 'object')
      notregexReplace (obj [p])
}

function* find (req, res, next) {
  try {
    notregexReplace (req.body.query);
    res.json (yield (yield dbPromise) .collection (req.body.collection) .find (req.body.query, req.body.projection) .sort (req.body.sort) .toArray());
  } catch (e) {
    console .log ('find: ', e, req.body);
    next (e);
  }
}

router.post ('/', function(req, res, next) {
  async (find) (req, res, next);
});

module.exports = router;

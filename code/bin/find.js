'use strict';

var express  = require ('express');
var async    = require ('../lib/async.js');
var ObjectID = require ('mongodb').ObjectID
var router   = express .Router();

// Workaround Mongodb limitation that $not can not be combined with $regex
function notregexReplace (obj) {
  for (let p in obj)
    if (p == '$notregex') {
      obj ['$not'] = new RegExp (obj [p]);
      delete obj ['$notregex'];
    } else if (typeof obj [p] == 'object')
      notregexReplace (obj [p])
}

async function get (req, res, next) {
  try {
    notregexReplace (req.body.query);
    res.json (await (await req .dbPromise) .collection (req.body.collection) .find (req.body.query, req.body.projection) .sort (req.body.sort) .toArray());
  } catch (e) {
    console .log ('get: ', e, req .body);
    next (e);
  }
}

async function has (req, res, next) {
  try {
    notregexReplace (req .body .query);
    res .json ((await (await req .dbPromise) .collection (req .body .collection) .findOne (req .body .query)) != null);
  } catch (e) {
    console .log ('has: ', e, req .body);
    next (e);
  }
}

router .post ('/get', function (req, res, next) {
  (async () => {try {await get (req, res, next)} catch (e) {console .log (e)}}) ();
});

router .post ('/has', function (req, res, next) {
  (async () => {try {await has (req, res, next)} catch (e) {console .log (e)}}) ();
});

module .exports = router;

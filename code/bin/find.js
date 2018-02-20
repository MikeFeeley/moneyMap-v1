'use strict';

var express  = require ('express');
var async    = require ('../lib/async.js');
var ObjectID = require ('mongodb').ObjectID
var router   = express .Router();

// Workaround Mongodb limitation that $not can not be combined with $regex and use $regexi for case insensitive
function handleNonStandardQueryOptions (obj) {
  for (let p in obj)
    if (p == '$notregex') {
      obj ['$not'] = new RegExp (obj [p]);
      delete obj ['$notregex'];
    } else if (p == '$regexi') {
      obj .$regex = new RegExp (obj [p], 'i');
      delete obj .$regexi;
    } else if (typeof obj [p] == 'object')
      handleNonStandardQueryOptions (obj [p])
}

async function get (req, res, next) {
  try {
    let limit = req .body .query && req .body .query .$limit;
    if (limit)
      delete req .body .query .$limit;
    let sort =  req .body .query && req .body .query .$sort;
    if (sort)
      delete req .body .query .$sort;
    handleNonStandardQueryOptions (req .body .query);
    let find = (await req .dbPromise) .collection (req.body.collection) .find (req.body.query, req.body.projection);
    if (limit)
      find = limit? find .sort (sort || req.body.sort) .limit (limit): find .sort (sort || req.body.sort);
    res.json (await find .toArray());
  } catch (e) {
    console .log ('get: ', e, req .body);
    next (e);
  }
}

async function has (req, res, next) {
  try {
    handleNonStandardQueryOptions (req .body .query);
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

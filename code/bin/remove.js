'use strict';

var express  = require ('express');
var assert   = require ('assert');
var app      = require ('./app.js');
var router  = express.Router();

async function remove (req, collection, id) {
  var db = await req .dbPromise;
  await db .collection (collection) .remove ({_id: id});
  return true;
}

async function removeOne (req, res, next) {
  try {
    res.json (await remove (req, req .body .collection, req .body .id));
    app .notifyOtherClients (req .body .database, req .body .sessionId, {collection: req .body .collection, remove: req .body .id});
  } catch (e) {
    console .log ('removeOne: ', e, req.body);
    next (e);
  }
}

async function removeList (req, res, next) {
  try {
    if (! req .body .list)
      throw ('No list in body')
    var results = [];
    for (let id of req .body .list)
      results .push (await remove (req, req .body .collection, id))
    res.json (results);
    app .notifyOtherClients (req .body .database, req .body .sessionId, {collection: req .body .collection, removeList: req .body .list});
  } catch (e) {
    console .log ('removeList: ', e, req.body);
    next (e);
  }
}

router.post ('/one', function(req, res, next) {
  (async () => {try {await removeOne (req, res, next)} catch (e) {console .log (e)}}) ();
});

router.post ('/list', function(req, res, next) {
  (async () => {try {await removeList (req, res, next)} catch (e) {console .log (e)}}) ();
});

module.exports = router;

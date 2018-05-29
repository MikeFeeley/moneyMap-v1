'use strict';

var express  = require ('express');
var app      = require ('./app.js');
var router   = express.Router();

async function updateOne (req, res, next) {
  try {
    if (!req.body.update)
      throw 'No update in body';
    var result = await (await req .dbPromise) .collection (req.body.collection) .update ({_id: req.body.id}, {$set: req.body.update});
    res.json (result && result .result .ok);
    app .notifyOtherClients (req .body .database, req .body .sessionId, {collection: req .body .collection, id: req .body .id, update: req .body .update});
  } catch (e) {
    console .log ('updateOne: ', e, req.body);
    next (e);
  }
}

async function updateList (req, res, next) {
  try {
    if (!req.body.list)
      throw 'No list in body';
    var allOkay = true;
    for (let item of req.body.list) {
      if (!item .update)
        throw 'No update in list';
      var result = await (await req .dbPromise) .collection (req.body.collection) .update ({_id: item .id}, {$set: item .update});
      allOkay &= result && result .result .ok;
    }
    res.json (allOkay);
    app .notifyOtherClients (req .body .database, req .body .sessionId, {collection: req .body .collection, updateList: req .body .list});
  } catch (e) {
    console .log ('updateList: ', e, req.body);
    next (e);
  }
}

router.post ('/one', function(req, res, next) {
  (async () => {try {await updateOne (req, res, next)} catch (e) {console .log (e)}}) ();
  async (updateOne) (req, res, next);
});

router.post ('/list', function(req, res, next) {
  (async () => {try {await updateList (req, res, next)} catch (e) {console .log (e)}}) ();
  async (updateList) (req, res, next);
});

module.exports = router;

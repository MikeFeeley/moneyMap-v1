'use strict';

var express  = require ('express');
var async    = require ('../lib/async.js');
var util     = require ('../lib/util.js');
var router   = express.Router();
var ObjectID = require('mongodb').ObjectID

async function handleSeq (db, id, insert) {
  if (insert._seq === null)
    insert._seq = (
      await db .collection ('counters')
        .findOneAndUpdate ({_id: id}, {$inc: {seq: 1}}, {upsert: true, returnOriginal: false})
    ) .value .seq;
}

async function newUID (db) {
  return (
    await db .collection ('counters')
      .findOneAndUpdate ({_id:  'transactions'}, {$inc: {uid: 1}}, {upsert: true, returnOriginal: false})
  ) .value .uid;
}

async function apply (db, pt, accId) {
  var accounts     = db .collection ('accounts');
  var transactions = db .collection ('transactions');
  var amount       = 0;
  if (pt .update) {
    if (pt .update .account && pt._master) {
      if (pt .update .account != accId) {
        var tpt = {
          uid:    pt .uid,
          _id:    pt._id,
          update: {account: pt .update .account}
        }
        await accounts .updateOne ({_id: tpt .update .account, pendingTransactions: {$not: {$elemMatch: {uid: tpt .uid}}}}, {$push: {pendingTransactions: tpt}});
        await apply               (db, tpt, tpt .update. account);
      } else
        delete pt .update .account;
    }
    if (Object .keys (pt .update) .length) {
      var prev = (await transactions .findOneAndUpdate ({_id: pt._id}, {$set: pt .update})) .value;
      if (pt .update .debit != null)
        amount += pt .update .debit - (prev .debit || 0);
      if (pt .update .credit != null)
        amount -= pt .update .credit - (prev .credit || 0);
      if (pt .update .account) {
        if (pt._master)
          amount = - ((prev .debit || 0) - (prev .credit || 0));
        else if (prev .account != accId)
          amount = ((prev .debit || 0) - (prev .credit || 0));
      }
    } else
      amount = 0;
  } else if (pt .insert) {
    try {
      await transactions .insertOne (pt .insert);
      amount = (pt .insert .debit || 0) - (pt .insert .credit || 0);
    } catch (e) {
      console .log ('Transaction apply: duplicate insert ignored', e, pt);
    }
  } else if (pt .remove) {
    try {
      var prev = (await transactions .findOneAndDelete ({_id: pt._id})) .value;
      amount = -((prev .debit || 0) - (prev .credit || 0));
    } catch (e) {
      console .log ('Transaction apply: duplicate remove ignored', e, pt);
    }
  }
  if (accId) {
    var creditBalance = (await accounts .findOne ({_id: accId})) .creditBalance;
    await accounts .updateOne ({_id: accId, 'pendingTransactions.uid': pt .uid}, {
      $inc:  {balance: amount * (creditBalance? -1: 1)},
      $pull: {pendingTransactions: {uid: pt .uid}}
    })
  }
}

async function findAccountAndRollForward (db, query) {
  var accounts = db .collection ('accounts');
  for (let acc of await accounts .find (query) .toArray())
    for (let pt of (acc && acc .pendingTransactions) || [])
      await apply (db, pt, acc._id);
  return await accounts .find (query) .toArray();
}

async function insert (db, tran) {
  var accounts     = db .collection ('accounts');
  var transactions = db .collection ('transactions');
  tran._id = tran._id || new ObjectID() .toString();
  await handleSeq (db, 'transactions', tran);
  addDateToActualsBlacklist (db, tran .date);
  if (tran .account != null && (tran .debit != null || tran .credit != null)) {
    var pt = {
      uid:    await newUID (db),
      insert: tran
    }
    await accounts .updateOne ({_id: tran .account}, {$push: {pendingTransactions: pt}});
    await apply              (db, pt, tran .account);
  } else
    await transactions .insertOne (tran);
  return tran;
}

async function update (db, id, update) {

  let accounts     = db .collection ('accounts');
  let transactions = db .collection ('transactions');

  if (update .debit != null || update .credit != null || update .account != null) {

    let tran = await transactions .findOne ({_id: id});
    if (!tran)
      throw 'Update transaction not found ' + id;
    if (update .debit != null || update .credit != null)
      addDateToActualsBlacklist (db, tran .date);

    // update account balance
    if (tran .account) {
      let pt = {
        uid:    await newUID (db),
        _id:    id,
        update: update,
      }
      pt._master = update .account != null;
      await accounts .updateOne ({_id: tran .account}, {$push: {pendingTransactions: pt}});
      await apply              (db, pt, tran .account);
      return true;
    } else if (update .account) {
      let pt = {
        uid:     await newUID (db),
        _master: true,
        _id:     id,
        update:  update
      }
      await accounts .updateOne ({_id: update .account}, {$push: {pendingTransactions: pt}});
      await apply               (db, pt);
    }

  } else if (update .category != null) {
    let tran = await transactions .findOne ({_id: id});
    if (!tran)
      throw 'Update transaction not found ' + id;
    addDateToActualsBlacklist (db, tran .date);
  }
  await transactions .updateOne ({_id: id}, {$set: update});
  return true;
}

async function remove (db, id) {
  var accounts     = db .collection ('accounts');
  var transactions = db .collection ('transactions');
  var tran = await transactions .findOne ({_id: id});
  if (!tran)
    throw 'Remove Transaction not found';
  addDateToActualsBlacklist (db, tran .date);
  if (tran .account) {
    var pt = {
      uid:    await newUID (db),
      _id:    id,
      remove: true
    }
    await accounts .updateOne ({_id: tran .account}, {$push: {pendingTransactions: pt}});
    await apply               (db, pt, tran .account);
    return true;
  }
  return (await transactions .deleteOne ({_id: id})) .deletedCount == 1;
}


async function insertOne (req, res, next) {
  try {
    if (! req .body .insert)
      throw 'Missing insert';
    var tran = await insert (await req .dbPromise, req .body .insert);
    res .json ({_id: tran._id, _seq: tran._seq});
  } catch (e) {
    console .log ('transactions insertOne: ', e, req .body);
    next (e);
  }
}

async function insertList (req, res, next) {
  try {
    if (! req .body .list)
      throw 'Missing list';
    var trans = [];
    for (let tran of req .body .list)
      trans .push (await insert (await req .dbPromise, tran));
    res .json (trans);
  } catch (e) {
    console .log ('transactions insertList: ', e, req .body);
    next (e);
  }
}

async function updateOne (req, res, next) {
  try {
    if (! req .body .id || ! req .body .update)
      throw 'Missing id or update';
    await update (await req .dbPromise, req .body .id, req .body .update);
    res .json (true);
  } catch (e) {
    console .log ('transactions updateOne: ', e, req .body);
    next (e);
  }
}

async function updateList (req, res, next) {
  try {
    if (! req .body .list)
      throw 'Missing list';
    for (let item of req .body .list) {
      if (! item .id || ! item .update)
        throw 'Missing id or update';
      await update (await req .dbPromise, item .id, item .update);
    }
    res .json (true);
  } catch (e) {
    console .log ('transactions updateList: ', e, req .body);
    next (e);
  }
}

async function removeOne (req, res, next) {
  try {
    if (! req .body .id)
      throw 'Missing id';
    res .json (await remove (await req .dbPromise, req .body .id));
  } catch (e) {
    console .log ('transactions removeOne: ', e, req .body);
  }
}

async function removeList (req, res, next) {
  try {
    if (! req .body .list)
      throw 'Missing list';
    var results = []
    for (let id of req .body .list) {
      results .push (await remove (await req .dbPromise, id));
    }
    res .json (results);
  } catch (e) {
    console .log ('transactions removeList: ', e, req .body);
  }
}

async function findAccountBalance (req, res, next) {
  try {
    res .json (await findAccountAndRollForward (await req .dbPromise, req .body .query));
  } catch (e) {
    console .log ('transactions findAccountBalance: ', e, req .body);
  }
}



var blacklistsCache = new Map();

function nextMonth (yyyymm) {
  let y = Math .floor (yyyymm / 100);
  let m = yyyymm % 100;
  m += 1;
  if (m == 13) {
    m = 1;
    y += 1;
  }
  return y * 100 + m;
}

function getYearMonth (date) {
  return Math .floor (date / 100);
}

async function replaceActual (actuals, month, category, amount) {
  return actuals .replaceOne ({month: month, category: category},{month: month, category: category, amount: amount},{upsert: true})
}

async function updateActuals (actuals, transactions, start, end) {
  let rm    = await actuals .deleteMany (start? {$and: [{month: {$gte: start}}, {month: {$lte: end}}]}: {});
  let query = start? {$and: [{date: {$gte: start * 100}}, {date: {$lte: end * 100 + 99}}]}: {};
  let trans = await transactions .find (query) .sort ({date: 1, category: 1});
  let acum  = new Map();
  while (await trans .hasNext()) {
    let tran = await trans .next();
    if (tran .date && tran .category && (tran .debit || tran .credit)) {
      let key = String (getYearMonth (tran .date)) + '$' + String (tran .category);
      acum .set (key, (acum .get (key) || 0) + tran .debit - tran .credit);
    }
  }
  await rm;
  let up = [];
  for (let e of acum .entries()) {
    e[0] = e[0] .split ('$');
    let m = Number (e[0][0]);
    let c = e[0][1];
    let a = e[1];
    up .push (actuals .insert ({month: m, category: c, amount: a}));
  }
  up .forEach (async u => {await u});
}

async function getActuals (req, res, next) {
  try {
    let db           = await req .dbPromise;
    let actualsMeta  = db .collection ('actualsMeta');
    let actuals      = db .collection ('actuals');
    let transactions = db .collection ('transactions');
    if (await actualsMeta .findOne ({type: 'isValid'})) {
      let blacklist = (await actualsMeta .find ({type: 'blacklist'}) .sort ({month: 1}) .toArray()) .reduce ((list,e) => {
        if (list .length && nextMonth (list [list .length - 1] .end) == e .month)
          list [list .length - 1] .end = e .month;
        else
          list .push ({start: e .month, end: e .month});
        return list;
      }, []);
      await actualsMeta .deleteMany ({type: 'blacklist'});
      for (let ble of blacklist)
        await updateActuals (actuals, transactions, ble .start, ble .end);
    } else {
      await updateActuals (actuals, transactions);
      await actualsMeta .insert ({type: 'isValid'});
    }
    res .json (await actuals .find (req .body .query || {}) .toArray());
    (blacklistsCache .get (db .databaseName) || blacklistsCache .set (db .databaseName, new Set()) .get (db .databaseName)) .clear();
  } catch (e) {
    console .log (e);
  }
}

function addDateToActualsBlacklist (db, date) {
  if (date) {
    let m         = getYearMonth (date);
    let blacklist = blacklistsCache .get (db .databaseName) || blacklistsCache .set (db .databaseName, new Set()) .get (db .databaseName);
    if (! blacklist .has (m)) {
      db .collection ('actualsMeta') .updateOne ({type: 'blacklist', month: m}, {type: 'blacklist', month: m}, {upsert: true});
      blacklist .add (m);
    }
  }
}

router .post ('/insert/one', function (req, res, next) {
  (async () => {try {await insertOne (req, res, next)} catch (e) {console .log (e)}}) ();
})

router .post ('/insert/list', function (req, res, next) {
  (async () => {try {await insertList (req, res, next)} catch (e) {console .log (e)}}) ();
})

router .post ('/update/one', function (req, res, next) {
  (async () => {try {await updateOne (req, res, next)} catch (e) {console .log (e)}}) ();
})

router .post ('/update/list', function (req, res, next) {
  (async () => {try {await updateList (req, res, next)} catch (e) {console .log (e)}}) ();
})

router .post ('/remove/one', function (req, res, next) {
  (async () => {try {await removeOne (req, res, next)} catch (e) {console .log (e)}}) ();
})

router .post ('/remove/list', function (req, res, next) {
  (async () => {try {await removeList (req, res, next)} catch (e) {console .log (e)}}) ();
})

router .post ('/findAccountBalance', function (req, res, next) {
  (async () => {try {await findAccountBalance (req, res, next)} catch (e) {console .log (e)}}) ();
})

router .post ('/actuals', (req, res, next) => {
  (async () => {try {await getActuals (req, res, next)} catch (e) {console .log (e)}}) ();
})

module .exports = router;

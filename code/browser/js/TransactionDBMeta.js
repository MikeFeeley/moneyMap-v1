var TransactionDBMeta_getCollection;
var TransactionDBMeta_getObjectID;
var TransactionDBMeta_forEach;

function TransactionDBMeta_setGetCollectionFunction (f) {
  TransactionDBMeta_getCollection = f;
}

function TransactionDBMeta_setGetObjectIDFunction (f) {
  TransactionDBMeta_getObjectID = f;
}

function TransactionDBMeta_setForEachFunction (f) {
  TransactionDBMeta_forEach = f;
}

async function TransactionDBMeta_newUID (db) {
  return (
    await TransactionDBMeta_getCollection (db, 'counters')
    .findOneAndUpdate ({_id: 'transactions'}, {$inc: {uid: 1}}, {upsert: true, returnOriginal: false})
  ) .value .uid;
}

async function TransactionDBMeta_apply (db, pt, accId) {
  var accounts     = TransactionDBMeta_getCollection (db, 'accounts');
  var transactions = TransactionDBMeta_getCollection (db, 'transactions');
  var amount       = 0;
  if (pt .update) {
    if (pt .update .account && pt._master) {
      if (pt .update .account != accId) {
        var tpt = {
          uid:    pt .uid,
          _id:    pt._id,
          update: {account: pt .update .account}
        }
        await accounts .updateOne     ({_id: tpt .update .account, pendingTransactions: {$not: {$elemMatch: {uid: tpt .uid}}}}, {$push: {pendingTransactions: tpt}});
        await TransactionDBMeta_apply (db, tpt, tpt .update. account);
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
      await transactions .insert (pt .insert);
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
    });
  }
}

async function TransactionDBMeta_findAccountAndRollForward (db, query) {
  var accounts = TransactionDBMeta_getCollection (db, 'accounts');
  for (let acc of await accounts .find (query) .toArray())
    for (let pt of (acc && acc .pendingTransactions) || [])
      await TransactionDBMeta_apply (db, pt, acc._id);
  return await accounts .find (query) .toArray();
}

async function TransactionDBMeta_handleSeq (db, id, insert) {
  if (insert._seq === null)
    insert._seq = (
      await TransactionDBMeta_getCollection (db, 'counters')
      .findOneAndUpdate ({_id: id}, {$inc: {seq: 1}}, {upsert: true, returnOriginal: false})
    ) .value .seq;
}

async function TransactionDBMeta_insert (db, tran) {
  var accounts     = TransactionDBMeta_getCollection (db, 'accounts');
  var transactions = TransactionDBMeta_getCollection (db, 'transactions');
  tran._id = tran._id || TransactionDBMeta_getObjectID();
  await TransactionDBMeta_handleSeq (db, 'transactions', tran);
  await TransactionDBMeta_addDateToActualsBlacklist (db, tran .date);
  if (tran .account != null && (tran .debit != null || tran .credit != null)) {
    var pt = {
      uid:    await TransactionDBMeta_newUID (db),
      insert: tran
    }
    await accounts .updateOne     ({_id: tran .account}, {$push: {pendingTransactions: pt}});
    await TransactionDBMeta_apply (db, pt, tran .account);
  } else
    await transactions .insert(tran);
  return tran;
}

async function TransactionDBMeta_update (db, id, update) {

  let accounts     = TransactionDBMeta_getCollection (db, 'accounts');
  let transactions = TransactionDBMeta_getCollection (db, 'transactions');

  let tran;
  if (update .debit != null || update .credit != null || update .account != null || update .category !== undefined || update .date != null) {
    tran = await transactions .findOne ({_id: id});
    if (!tran)
      throw 'Update transaction not found ' + id
  }

  if (update .debit != null || update .credit != null || update .account != null) {

    if (update .debit != null || update .credit != null)
      await TransactionDBMeta_addDateToActualsBlacklist (db, tran .date);

    // update account balance
    if (tran .account) {
      let pt = {
        uid:    await TransactionDBMeta_newUID (db),
        _id:    id,
        update: update,
      }
      pt._master = update .account != null;
      await accounts .updateOne     ({_id: tran .account}, {$push: {pendingTransactions: pt}});
      await TransactionDBMeta_apply (db, pt, tran .account);
      return true;
    } else if (update .account) {
      let pt = {
        uid:     await TransactionDBMeta_newUID (db),
        _master: true,
        _id:     id,
        update:  update
      }
      await accounts .updateOne     ({_id: update .account}, {$push: {pendingTransactions: pt}});
      await TransactionDBMeta_apply (db, pt);
    }


  } else if (update .category !== undefined)
    await TransactionDBMeta_addDateToActualsBlacklist (db, tran .date);

  else if (update .date != null) {
    await TransactionDBMeta_addDateToActualsBlacklist (db, update .date);
    await TransactionDBMeta_addDateToActualsBlacklist (db, tran   .date);
  }

  await transactions .updateOne ({_id: id}, {$set: update});
  return true;
}

async function TransactionDBMeta_remove (db, id) {
  var accounts     = TransactionDBMeta_getCollection (db, 'accounts');
  var transactions = TransactionDBMeta_getCollection (db, 'transactions');
  var tran = await transactions .findOne ({_id: id});
  if (!tran)
    throw 'Remove Transaction not found';
  await TransactionDBMeta_addDateToActualsBlacklist (db, tran .date);
  if (tran .account) {
    var pt = {
      uid:    await TransactionDBMeta_newUID (db),
      _id:    id,
      remove: true
    }
    await accounts .updateOne     ({_id: tran .account}, {$push: {pendingTransactions: pt}});
    await TransactionDBMeta_apply (db, pt, tran .account);
    return true;
  }
  return (await transactions .deleteOne ({_id: id})) .deletedCount == 1;
}


var blacklistsCache = new Map();

function TransactionDBMeta_nextMonth (yyyymm) {
  let y = Math .floor (yyyymm / 100);
  let m = yyyymm % 100;
  m += 1;
  if (m == 13) {
    m = 1;
    y += 1;
  }
  return y * 100 + m;
}

function TransactionDBMeta_getYearMonth (date) {
  return Math .floor (date / 100);
}

async function TransactionDBMeta_updateActuals (actuals, transactions, start, end) {
  let rm    = actuals .deleteMany (start? {$and: [{month: {$gte: start}}, {month: {$lte: end}}]}: {});
  let query = start? {$and: [{date: {$gte: start * 100}}, {date: {$lte: end * 100 + 99}}]}: {};
  let acum  = new Map();
  await TransactionDBMeta_forEach (transactions .find (query) .sort ({date: 1, category: 1}), tran => {
    if (tran .date && (tran .debit || tran .credit)) {
      let key = String (TransactionDBMeta_getYearMonth (tran .date)) + '$' + (String (tran .category) || '@NULL@');
      let val = acum .get (key) || {amount: 0, count: 0};
      val .amount += tran .debit - tran .credit;
      val .count  += 1;
      acum .set (key, val);
    }
  });
  await rm;
  let up = [];
  for (let e of acum .entries()) {
    e[0] = e[0] .split ('$');
    if (e[0] == '@NULL@')
      e[0] = null;
    up .push (actuals .insert ({_id: TransactionDBMeta_getObjectID(), month: Number (e[0][0]), category: e[0][1], amount: e[1] .amount, count: e[1] .count}));
  }
  await Promise .all (up);
}

async function TransactionDBMeta_getActuals (db, query) {
  let actualsMeta  = TransactionDBMeta_getCollection (db, 'actualsMeta');
  let actuals      = TransactionDBMeta_getCollection (db, 'actuals');
  let transactions = TransactionDBMeta_getCollection (db, 'transactions');
  if (await actualsMeta .findOne ({type: 'isValid'})) {
    let blacklist = (await actualsMeta .find ({type: 'blacklist'}) .sort ({month: 1}) .toArray()) .reduce ((list,e) => {
      if (list .length && TransactionDBMeta_nextMonth (list [list .length - 1] .end) == e .month)
        list [list .length - 1] .end = e .month;
      else
        list .push ({start: e .month, end: e .month});
      return list;
    }, []);
    await actualsMeta .deleteMany ({type: 'blacklist'});
    for (let ble of blacklist)
      await TransactionDBMeta_updateActuals (actuals, transactions, ble .start, ble .end);
  } else {
    await TransactionDBMeta_updateActuals (actuals, transactions);
    await actualsMeta .insert ({_id: TransactionDBMeta_getObjectID(), type: 'isValid'});
  }
  let res = await actuals .find (query || {}) .toArray();
  (blacklistsCache .get (db .databaseName) || blacklistsCache .set (db .databaseName, new Set()) .get (db .databaseName)) .clear();
  return res;
}

async function TransactionDBMeta_addDateToActualsBlacklist (db, date) {
  if (date) {
    let m         = TransactionDBMeta_getYearMonth (date);
    let blacklist = blacklistsCache .get (db .databaseName) || blacklistsCache .set (db .databaseName, new Set()) .get (db .databaseName);
    if (! blacklist .has (m)) {
      await TransactionDBMeta_getCollection (db, 'actualsMeta') .updateOne ({type: 'blacklist', month: m}, {type: 'blacklist', month: m}, {upsert: true});
      blacklist .add (m);
    }
  }
}

// For node.js include
if (typeof exports !== 'undefined') {
  exports .findAccountAndRollForward = TransactionDBMeta_findAccountAndRollForward;
  exports .insert                    = TransactionDBMeta_insert;
  exports .update                    = TransactionDBMeta_update;
  exports .remove                    = TransactionDBMeta_remove;
  exports .getActuals                = TransactionDBMeta_getActuals;
  exports .setGetCollectionFunction  = TransactionDBMeta_setGetCollectionFunction;
  exports .setGetObjectIDFunction    = TransactionDBMeta_setGetObjectIDFunction;
  exports .setForEachFunction        = TransactionDBMeta_setForEachFunction;
}

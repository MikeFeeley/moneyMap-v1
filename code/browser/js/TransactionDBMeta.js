let TransactionDBMeta_createObjectID;
let TransactionDBMeta_transaction;

function TransactionDBMeta_init (createObjectID) {
  TransactionDBMeta_createObjectID = createObjectID;
}

async function TransactionDBMeta_newUID (dbTran) {
  return (
    await dbTran .findOneAndUpdate ('counters', {_id: 'transactions'}, {$inc: {uid: 1}}, {upsert: true, returnOriginal: false})
  ) .value .uid;
}

async function TransactionDBMeta_apply (dbTran, pt, accId) {
  var amount = 0;
  if (pt .update) {
    if (pt .update .account && pt._master) {
      if (pt .update .account != accId) {
        var tpt = {
          uid:    pt .uid,
          _id:    pt._id,
          update: {account: pt .update .account}
        }
        await dbTran .updateOne       ('accounts', {_id: tpt .update .account, pendingTransactions: {$not: {$elemMatch: {uid: tpt .uid}}}}, {$push: {pendingTransactions: tpt}});
        await TransactionDBMeta_apply (dbTran, tpt, tpt .update. account);
      } else
        delete pt .update .account;
    }
    if (Object .keys (pt .update) .length) {
      var prev = (await dbTran .findOneAndUpdate ('transactions', {_id: pt._id}, {$set: pt .update})) .value;
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
      await dbTran .insert ('transactions', pt .insert);
      amount = (pt .insert .debit || 0) - (pt .insert .credit || 0);
    } catch (e) {
      console .log ('Transaction apply: duplicate insert ignored', e, pt);
    }
  } else if (pt .remove) {
    try {
      var prev = (await dbTran .findOneAndDelete ('transactions', {_id: pt._id})) .value;
      amount = -((prev .debit || 0) - (prev .credit || 0));
    } catch (e) {
      console .log ('Transaction apply: duplicate remove ignored', e, pt);
    }
  }
  if (accId) {
    let acc = await dbTran .findOne ('accounts', {_id: accId});
    if (acc) {
      var creditBalance = acc .creditBalance;
      await dbTran .updateOne ('accounts', {_id: accId, 'pendingTransactions.uid': pt .uid}, {
        $inc:  {balance: amount * (creditBalance? -1: 1)},
        $pull: {pendingTransactions: {uid: pt .uid}}
      });
    }
  }
}

async function TransactionDBMeta_findAccountAndRollForward (dbTran, query) {
  for (let acc of await dbTran .findArray ('accounts', query))
    for (let pt of (acc && acc .pendingTransactions) || [])
      await TransactionDBMeta_apply (dbTran, pt, acc._id);
  return await dbTran .findArray ('accounts', query);
}

async function TransactionDBMeta_handleSeq (dbTran, id, insert) {
  if (insert._seq === null)
    insert._seq = (
      await dbTran .findOneAndUpdate ('counters', {_id: id}, {$inc: {seq: 1}}, {upsert: true, returnOriginal: false})
    ) .value .seq;
}

async function TransactionDBMeta_insert (dbTran, tran) {
  tran._id = tran._id || TransactionDBMeta_createObjectID();
  await TransactionDBMeta_handleSeq (dbTran, 'transactions', tran);
  await TransactionDBMeta_addDateToActualsBlacklist (dbTran, tran .date);
  if (tran .account != null && (tran .debit != null || tran .credit != null)) {
    var pt = {
      uid:    await TransactionDBMeta_newUID (dbTran),
      insert: tran
    }
    await dbTran .updateOne     ('accounts', {_id: tran .account}, {$push: {pendingTransactions: pt}});
    await TransactionDBMeta_apply (dbTran, pt, tran .account);
  } else
    await dbTran .insert ('transactions', tran);
  return tran;
}

async function TransactionDBMeta_update (dbTran, id, update) {
  let tran;
  if (update .debit != null || update .credit != null || update .account != null || update .category !== undefined || update .date != null) {
    tran = await dbTran .findOne ('transactions', {_id: id});
    if (!tran)
      throw 'Update transaction not found ' + id
  }

  if (update .debit != null || update .credit != null || update .account != null) {

    if (update .debit != null || update .credit != null)
      await TransactionDBMeta_addDateToActualsBlacklist (dbTran, tran .date);

    // update account balance
    if (tran .account) {
      let pt = {
        uid:    await TransactionDBMeta_newUID (dbTran),
        _id:    id,
        update: update,
      }
      pt._master = update .account != null;
      await dbTran .updateOne     ('accounts', {_id: tran .account}, {$push: {pendingTransactions: pt}});
      await TransactionDBMeta_apply (dbTran, pt, tran .account);
      return true;
    } else if (update .account) {
      let pt = {
        uid:     await TransactionDBMeta_newUID (dbTran),
        _master: true,
        _id:     id,
        update:  update
      }
      console.log(pt);
      await dbTran .updateOne     ('accounts', {_id: update .account}, {$push: {pendingTransactions: pt}});
      await TransactionDBMeta_apply (dbTran, pt);
    }


  } else if (update .category !== undefined)
    await TransactionDBMeta_addDateToActualsBlacklist (dbTran, tran .date);

  else if (update .date != null) {
    await TransactionDBMeta_addDateToActualsBlacklist (dbTran, update .date);
    await TransactionDBMeta_addDateToActualsBlacklist (dbTran, tran   .date);
  }

  await dbTran .updateOne ('transactions', {_id: id}, {$set: update});
  return true;
}

async function TransactionDBMeta_remove (dbTran, id) {
  var tran = await dbTran .findOne ('transactions', {_id: id});
  if (!tran)
    throw 'Remove Transaction not found';
  await TransactionDBMeta_addDateToActualsBlacklist (dbTran, tran .date);
  if (tran .account) {
    var pt = {
      uid:    await TransactionDBMeta_newUID (dbTran),
      _id:    id,
      remove: true
    }
    await dbTran .updateOne     ('accounts', {_id: tran .account}, {$push: {pendingTransactions: pt}});
    await TransactionDBMeta_apply (dbTran, pt, tran .account);
    return true;
  }
  return (await dbTran .deleteOne ('transactions', {_id: id}));
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

async function TransactionDBMeta_updateActuals (dbTran, start, end) {
  let rm    = dbTran .deleteMany ('actuals', start? {$and: [{month: {$gte: start}}, {month: {$lte: end}}]}: {});
  let query = start? {$and: [{date: {$gte: start * 100}}, {date: {$lte: end * 100 + 99}}]}: {};
  let acum  = new Map();
  const cursor = dbTran .find ('transactions', query);
  while (await cursor .hasNext()) {
    const tran = await cursor .next();
    if (tran .date && tran .category && (tran .debit || tran .credit)) {
      let key = String (TransactionDBMeta_getYearMonth (tran .date)) + '$' + (String (tran .category) || '@NULL@');
      let val = acum .get (key) || {amount: 0, count: 0};
      val .amount += tran .debit - tran .credit;
      val .count  += 1;
      acum .set (key, val);
    }
  }
  await rm;
  let up = [];
  for (let e of acum .entries()) {
    e[0] = e[0] .split ('$');
    if (e[0] == '@NULL@')
      e[0] = null;
    up .push (dbTran .insert ('actuals', {_id: TransactionDBMeta_createObjectID(), month: Number (e[0][0]), category: e[0][1], amount: e[1] .amount, count: e[1] .count}));
  }
  await Promise .all (up);
}

async function TransactionDBMeta_getActuals (dbTran, query) {
  if (await dbTran .findOne ('actualsMeta', {type: 'isValid'})) {
    let blacklist = (await dbTran .findArray ('actualsMeta', {type: 'blacklist'}))
      .sort ((a,b) => a .month < b .month? -1: a .month == b .month? 0: 1)
      .reduce ((list,e) => {
        if (list .length && TransactionDBMeta_nextMonth (list [list .length - 1] .end) == e .month)
          list [list .length - 1] .end = e .month;
        else
          list .push ({start: e .month, end: e .month});
        return list;
      }, []);
    await dbTran .deleteMany ('actualsMeta', {type: 'blacklist'});
    for (let ble of blacklist)
      await TransactionDBMeta_updateActuals (dbTran, ble .start, ble .end);
  } else {
    await TransactionDBMeta_updateActuals (dbTran);
    await dbTran .insert ('actualsMeta', {_id: TransactionDBMeta_createObjectID(), type: 'isValid'});
  }
  let res = await dbTran .findArray ('actuals', query || {});
  let databaseName = dbTran .getDatabaseName();
  (blacklistsCache .get (databaseName) || blacklistsCache .set (databaseName, new Set()) .get (databaseName)) .clear();
  return res;
}

async function TransactionDBMeta_addDateToActualsBlacklist (dbTran, date) {
  if (date) {
    let m         = TransactionDBMeta_getYearMonth (date);
    const databaseName = dbTran .getDatabaseName();
    let blacklist = blacklistsCache .get (databaseName) || blacklistsCache .set (databaseName, new Set()) .get (databaseName);
    if (! blacklist .has (m)) {
      await dbTran .updateOne ('actualsMeta', {type: 'blacklist', month: m}, {type: 'blacklist', month: m}, {upsert: true});
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
  exports .init                      = TransactionDBMeta_init;
}

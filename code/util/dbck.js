'use strict';

var util     = require ('../lib/util.js');
var ObjectID = require('mongodb').ObjectID


const URL = 'mongodb://localhost:27017/';
const MONTHS_TO_KEEP_DELETED_CONFIGS = 6;
const DELETED_CONFIG_THRESHOLD       = util .Types .date .addMonthStart (util .Types .date .today(), - MONTHS_TO_KEEP_DELETED_CONFIGS);

var repair = process .argv [2] == 'repair';
var db, cats;

function getPathname (cat) {
  let parent = cat .parent && cats .get (cat .parent);
  return (parent? getPathname (parent) + ' > ': '') + (cat .name || '* no name *');
}

async function noScheduleCategories() {
  let titlePrinted;
  let buds = (await db .collection ('budgets') .find() .toArray())
    .reduce ((map, bud) => {return map .set (bud._id, bud)}, new Map())
  let schs = (await db .collection ('schedules') .find() .toArray())
    .reduce ((set, sch) => {return set .add (sch .category + sch .budget)}, new Set());
  for (let cat of cats .values())
    for (let bud of cat .budgets)
      if (! schs .has (cat._id + bud)) {
        if (!titlePrinted) {
          titlePrinted = true;
          console .log ('\nCategories with No Schedule')
        }
        let b = buds .get (bud) || {name: 'No Budget'};
        console.log ('  ' + b .name + ' - ' + getPathname (cat));
        if (repair) {
          await db .collection ('schedules') .insertOne ({
            _id:      new ObjectID() .toString(),
            category: cat._id,
            budget:   bud
          })
        }
      }
}

async function homonymCategories() {
  for (let budget of await db .collection ('budgets') .find() .toArray())
    for (let root of ['income', 'expense', 'savings', 'suspense']) {
      let cat = cats .get (budget [root + 'Category']);
      if (! cat)
        console .log ('Dangling root ' + root + 'Category for budget ' + budget .name);
      else if (! cat .budgets .includes (budget._id)) {
        console .log ('Root ' + root + 'Category not in budget for budget ' + budget .name);
        if (repair) {
          cat .budgets .push (budget._id);
          await db .collection ('categories') .updateOne (
            {_id:  cat._id},
            {$set: {budgets: cat .budgets}}
          )
        }
      }
    }
  let noBudget = Array .from (cats .values()) .filter (c => {return ! c .budgets || c .budgets .length == 0});
  let titlePrinted;
  for (let cat of noBudget) {
    let parent = cat .parent && cats .get (cat .parent);
    if (parent) {
      let siblings = (parent .children || []) .filter (s => {return s != cat && s .name == cat .name});
      if (siblings .length) {
        if (! titlePrinted) {
          titlePrinted = true;
          console .log ('\nHomonym Categories that Could be Consolidated');
        }
        console .log ('  ' + getPathname (cat) + ' (' + cat._id + ')');
        if (repair) {
          let budgetSiblings = siblings       .filter (s => {return s .budgets && s .budgets .length});
          let newCat         = budgetSiblings .length? budgetSiblings [0]: siblings [0];
          console .log ('    replacing with ' + newCat._id);
          await db .collection ('transactions') .updateMany (
            {category:        cat._id},
            {$set: {category: newCat._id}}
          )
          await db .collection ('accounts') .updateMany (
            {category:        cat._id},
            {$set: {category: newCat._id}}
          )
          await db .collection ('accounts') .updateMany (
            {disCategory:        cat._id},
            {$set: {disCategory: newCat._id}}
          )
          await db .collection ('categories') .updateMany (
            {parent:        cat._id},
            {$set: {parent: newCat._id}}
          )
          await db .collection ('importRules') .updateMany (
            {category:        cat._id},
            {$set: {category: newCat._id}}
          )
          await db .collection ('schedules')  .deleteMany ({category: cat._id});
          await db .collection ('categories') .deleteOne  ({_id:      cat._id});
          for (let c of cat .children || [])
            c .parent = newCat._id;
          if (cat .parent) {
            let pc = cats .get (cat .parent) .children;
            pc .splice (pc .indexOf (cat), 1);
          }
          newCat .children = (newCat .children || []) .concat (cat .children || []);
          cats .delete (cat._id);
        }
      }
    }
  }
}

async function unreachableSchedules() {
  let titlePrinted;
  for (let sch of await db .collection ('schedules') .find() .toArray())
    if (! sch .category || cats .get (sch .category) == null) {
      if (! titlePrinted) {
        titlePrinted = true;
        console .log ('\nUnreachable Schedules')
      }
      console .log ('  start: ' +  sch .start + ' end: ' + sch .end + ' amount: ' + sch .amount + ' notes: ' + sch .notes);
      if (repair)
        await db .collection ('schedules') .deleteOne ({_id: sch._id})
    }
}

async function unreachableCategories() {
  let unreachable = Array .from (cats .values())
    .filter (cat        => {return !cat .budgets || cat .budgets .length == 0})
    .map    (cat        => {return cat._id});
  let rt = (await db .collection ('transactions') .find ({category: {$in: unreachable}}) .toArray()) .reduce ((s,t) => {return s .add (t .category)}, new Set());
  let an = new Set();
  let addAncestors = id => {
    let c = cats .get (id);
    if (c .parent) {
      an .add      (c .parent);
      addAncestors (c .parent);
    }
  }
  for (let id of rt)
    addAncestors (id);
  let ac = (await db .collection ('accounts') .find() .toArray())
    .reduce ((s,a) => {if (a.category) s .add (a .category); if (a .disCategory) s .add (a .disCategory); return s}, new Set())
  let titlePrinted;
  for (let catId of unreachable) {
    if (! rt .has (catId) && ! an .has (catId)) {
      if (! titlePrinted) {
        titlePrinted = true;
        console.log ('\nUnreachable Categories');
      }
      let cat = cats .get (catId);
      console.log ('  ' + getPathname (cat));
      if (repair) {
        await db .collection ('schedules')  .deleteMany ({category: catId});
        await db .collection ('categories') .deleteOne  ({_id:      catId});
        cats .delete (catId);
      }
    }
  }
}

async function checkTransactions() {
  let budgets = await  db .collection ('budgets')    .find() .toArray();
  let cats    = (await db .collection ('categories') .find() .toArray()) .reduce ((map, cat) => {return map .set (cat._id, cat)}, new Map());
  let acts    = (await db .collection ('accounts')   .find() .toArray()) .reduce ((set, act) => {return set .add (act._id)}, new Set());
  let printed, catPrinted;
  let print = (s,t) => {
    if (! printed) {
      console.log ('\nTransaction integrity issues');
      printed = true;
    }
    if (t)
      t = 'd=' + t.date + ' p=' + t.payee + ' d=' + t.debit + ' c=' + t.credit + ' a=' + t.account + ' c=' + t.category + ' d=' + t.description;
    console .log ('  ' + s, t || '');
  }
  let path = c => {
    if (c)
      return (path (cats .get (c .parent)) || []) .concat (c .name)
  }
  let printCat = (bname, c) => {
    if (!catPrinted) {
      console.log ('\nCategory paths not in budget that have transactions in budget period');
      catPrinted = true;
    }
    console .log ('  Budget ' + bname + ': ' + path (cats .get (c)) .join (' > '))
  }
  let validPath = (cat, bid) => {
    if (! cat)
      return true;
    else if (cat .budgets .includes (bid))
      return validPath (cats .get (cat .parent), bid)
    else
      return false
  }
  let addBudgetToPath = async (bid, cid) => {
    let cat = cats .get (cid);
    if (cat) {
      if (! (await db .collection ('categories') .findOne ({_id: cid})) .budgets .includes (bid)) {
        await db .collection ('schedules')  .insertOne ({_id: new ObjectID() .toString(), category: cat._id, budget: bid});
        await db .collection ('categories') .updateOne ({_id: cid}, {$addToSet: {budgets: bid}});
      }
      await addBudgetToPath (bid, cat .parent);
    }
  }
  let trans = await db .collection ('transactions') .find();
  while (await trans .hasNext()) {
    let tran = await trans .next();
    let cat   = cats .get (tran .category);
    let actOk = acts .has (tran .account);
    let amt   = (tran .debit || 0) + (tran .credit || 0);
    let delOk =
      (! actOk && ! tran .date) ||
      (! cat   && ! actOk)      ||
      (! tran .date && amt == 0 && (! cat || !actOk));
    if (delOk) {
      print ('Deletable transaction', tran);
      if (repair)
        await db .collection ('transactions') .removeOne ({_id: tran._id});
      continue;
    }
    if (! cat)
      print ('Unknown category', tran);
    else {
      for (let budget of budgets)
        if (tran .date && (tran .debit != 0 || tran .credit != 0) && tran .date >= budget .start && tran .date <= budget .end)
          if (!validPath (cat, budget._id))
            budget .unaccounted = (budget .unaccounted || new Set()) .add (cat._id)
    }
    if (! acts .has (tran .account))
      print ('Unknown account', tran);
  }
  for (let budget of budgets) {
    for (let cid of budget .unaccounted || []) {
      printCat (budget .name, cid);
      if (repair)
        await addBudgetToPath (budget._id, cid);
    }
  }
}

async function checkForObjectIds() {
  for (let collectionName of Array .from (await db.collections()) .map (c => {return c.s.name})) {
    let docs = await db .collection (collectionName) .find ({_id: {$type: 'objectId'}}) .toArray();
    if (docs .length)
      console .log ('ObjectIDs totally ' + docs .length + ' found in ' + collectionName);
    for (let doc of docs) {
      if (repair) {
        await db .collection (collectionName) .removeOne ({_id: doc._id});
        doc._id = doc._id .toString();
        await db .collection (collectionName) .insert (doc);
      }
    }
  }
}

async function main() {
  let adminDB;
  try {
    adminDB = await require ('mongodb') .MongoClient .connect (URL + 'admin');
    for (let user of await adminDB .collection ('users') .find() .toArray()) {
      let userDB;
      try {
        userDB = await require ('mongodb') .MongoClient .connect (URL + 'user_' + user._id + '_' + user .accessCap);
        for (let config of await userDB .collection ('configurations') .find() .toArray()) {
          try {
            db = await require ('mongodb') .MongoClient .connect (URL + 'config_' + config._id + '_' + user .accessCap);
            let deleted = config .deleted? 'Deleted ' + config .deleted + ' ': ''
            console.log ('\n*** User ' + user .name + ' (' + user._id + ') Config ' + config .name +' (' + config._id +') ' + deleted + '***');
            if (config .deleted && config .deleted < DELETED_CONFIG_THRESHOLD) {
              if (repair) {
                console .log ('\nDropping configuration database');
                await userDB .collection ('configurations') .removeOne ({_id: config._id});
                await db .dropDatabase();
              } else
                console .log ('\nConfiguration database ready to be dropped');
            } else {
              cats = (await db .collection ('categories') .find() .toArray())
                .reduce ((map, cat) => {return map .set (cat._id, cat)}, new Map());
              for (let cat of Array .from (cats .values())) {
                if (cat .parent) {
                  let parent = cats .get (cat .parent);
                  if (parent)
                    parent .children = (parent .children || []) .concat (cat);
                  else
                    console .log ('Missing category parent: ' + cat .parent
                      + ' in category ' + getPathname(cat) + ' (' + cat._id + ')');
                }
              }
              if (repair)
                  console .log ('*** Repairing ***');
              await unreachableSchedules();
              await unreachableCategories();
              await homonymCategories();
              await noScheduleCategories();
              await checkTransactions();
              await checkForObjectIds();
              if (repair)
                await db .collection ('actualsMeta') .deleteOne ({type: 'isValid'});
            }
          } finally {
            db .close();
          }
        }
      } finally {
        userDB .close();
      }
    }
  } catch (e) {
    console .log(e);
  } finally {
    adminDB .close();
  }
}

main();

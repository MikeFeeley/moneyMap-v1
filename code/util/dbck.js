'use strict';

var util = require ('../lib/util.js');

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
        console.log ('  ' + buds .get (bud) .name + ' - ' + getPathname (cat));
        if (repair) {
          await db .collection ('schedules') .insertOne ({
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
  let cats  = (await db .collection ('categories') .find() .toArray()) .reduce ((set, cat) => {return set .add (cat._id)}, new Set());
  let acts  = (await db .collection ('accounts')   .find() .toArray()) .reduce ((set, act) => {return set .add (act._id)}, new Set());
  let printed;
  let print = s => {
    if (! printed) {
      console.log ('\nTransaction integrity issues');
      printed = true;
    }
    console .log ('  ' + s);
  }
  let trans = await db .collection ('transactions') .find();
  while (await trans .hasNext()) {
    let tran = await trans .next();
    if (! cats .has (tran .category))
      print ('Unknown category ' + tran .category + ' (transaction ' + tran .date + ' ' + tran._id + ')');
    if (! acts .has (tran .account))
      print ('Unknown account ' + tran .account   + ' (transaction ' + tran .date + ' ' + tran._id + ')');
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

'use strict';

const URL     = 'mongodb://localhost:27017/';
const DB_NAME = 'config_598f8d9dea4ca56c04ecafbd_72918055392801760';

var repair = process .argv [2] == 'repair';
var db     = require ('mongodb') .MongoClient .connect (URL + DB_NAME);
var cats;

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
          await db .collection ('history') .updateMany (
            {category:        cat._id},
            {$set: {category: newCat._id}}
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
  let historyCats = (await db .collection ('history') .find() .toArray())
    .reduce ((set, his) => {return set .add (his .category)}, new Set());
  let unreachable = Array .from (cats .values())
    .filter (cat => {return ! historyCats .has (cat._id) && (!cat .budgets || cat .budgets .length == 0)})
    .reduce ((set, cat) => {return set .add (cat._id)}, new Set())
  for (let tran of await db .collection ('transactions') .find() .toArray())
    unreachable .delete (tran .category)
  let titlePrinted;
  for (let catId of unreachable .keys()) {
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
async function main() {
  try {
    db   = await db;
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
  } catch (e) {
    console .log(e);
  } finally {
    db .close();
  }
}

main();

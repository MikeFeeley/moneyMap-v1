'use strict';

var ObjectID = require('mongodb').ObjectID


/**
 * Convert accounts from pre Nov 2017 version
 */

var AccountType = {
  GROUP:   0,
  ACCOUNT: 1
}

var OldType = {
  DEPOSIT:     0,
  CREDIT_CARD: 1,
  CASH:        2,
  PENSION:     3,
  RRSP:        4,
  TFSA:        5,
  RESP:        6,
  INVESTMENT:  7,
  MORTGAGE:    8,
  HOME:        9
}

const URL     = 'mongodb://localhost:27017/';
const DB_NAME = 'config_598f8d9dea4ca56c04ecafbd_72918055392801760';

var db = require ('mongodb') .MongoClient .connect (URL + DB_NAME);

async function main() {
  try {
    db = await db;
    let sort = 1;
    let group = [];
    let accounts = await db .collection ('accounts') .find() .toArray();
    group [OldType .DEPOSIT]     = (await db .collection ('accounts') .insert ({_id: new ObjectID() .toString(), type: AccountType .GROUP, cashFlow: true,  sort: sort++, name: 'Bank Accounts'})) .ops [0]._id;
    group [OldType .CREDIT_CARD] = (await db .collection ('accounts') .insert ({_id: new ObjectID() .toString(), type: AccountType .GROUP, cashFlow: true,  sort: sort++, name: 'Credit Cards'}))  .ops [0]._id;
    group [OldType .CASH]        = (await db .collection ('accounts') .insert ({_id: new ObjectID() .toString(), type: AccountType .GROUP, cashFlow: true,  sort: sort++, name: 'Cash'}))          .ops [0]._id;
    group [OldType .PENSION]     = (await db .collection ('accounts') .insert ({_id: new ObjectID() .toString(), type: AccountType .GROUP, cashFlow: false, sort: sort++, name: 'Pension'}))       .ops [0]._id;
    group [OldType .RRSP]        = (await db .collection ('accounts') .insert ({_id: new ObjectID() .toString(), type: AccountType .GROUP, cashFlow: false, sort: sort++, name: 'RRSP'}))          .ops [0]._id;
    group [OldType .TFSA]        = (await db .collection ('accounts') .insert ({_id: new ObjectID() .toString(), type: AccountType .GROUP, cashFlow: false, sort: sort++, name: 'TFSA'}))          .ops [0]._id;
    group [OldType .RESP]        = (await db .collection ('accounts') .insert ({_id: new ObjectID() .toString(), type: AccountType .GROUP, cashFlow: false, sort: sort++, name: 'RESP'}))          .ops [0]._id;
    let home                     = (await db .collection ('accounts') .insert ({_id: new ObjectID() .toString(), type: AccountType .GROUP, cashFlow: false, sort: sort++, name: 'Home'}))          .ops [0]._id;
    let other                    = (await db .collection ('accounts') .insert ({_id: new ObjectID() .toString(), type: AccountType .GROUP, cashFlow: false, sort: sort++, name: 'Other'}))         .ops [0]._id;
    for (let account of accounts) {
      let thisGroup;
      if (account .type == OldType .MORTGAGE || account .type == OldType .HOME)
        thisGroup = home;
      else if (account .type == OldType .INVESTMENT)
        thisGroup = other;
      else
        thisGroup = group [account .type]
      await db .collection ('accounts') .updateOne ({_id: account._id}, {
        $set: {
          type:     AccountType .ACCOUNT,
          group:    thisGroup,
          cashFlow: [0,1,2] .includes (account .type),
          liquid:   [0,1,2] .includes (account .type)? undefined: (account .type != OldType .MORTGAGE && account .type != OldType .HOME),
          sort:     sort++
        },
        $unset: {
          trackBalance: true
        }
      });
    }
    let order = (a,b) => {return a .start < b .start? -1: a .start == b .start? 0: 1};
    sort = 1;
    for (let his of (await db .collection ('balanceHistory') .find() .toArray()) .sort (order))
      await db .collection ('balanceHistory') .updateOne ({_id: his._id}, {
        $set: {
          date: his .end
        },
        $unset: {
          sort:  true,
          start: true,
          end:   true
        }
      })
  } catch (e) {
    console .log(e);
  } finally {
    db .close();
  }
}

main();
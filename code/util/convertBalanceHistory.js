'use strict';

/**
 * Convert balanceHistory from using budget ID to listing start and end dates
 */

const URL     = 'mongodb://localhost:27017/';
const DB_NAME = 'config_598f8d9dea4ca56c04ecafbd_72918055392801760';

var db = require ('mongodb') .MongoClient .connect (URL + DB_NAME);

async function main() {
  try {
    db = await db;
    let budgets = (await db .collection ('budgets') .find() .toArray()) .reduce ((m,b) => {
      return m .set (b._id, b);
    }, new Map())
    for (let h of await db .collection ('balanceHistory') .find() .toArray())
      if (h .budget && budgets .get (h .budget)) {
        let budget = budgets .get (h .budget);
        await db .collection ('balanceHistory') .updateOne ({_id: h._id}, {
          start:   budget .start,
          end:     budget .end,
          account: h .account,
          amount:  h .amount,
          sort:    h .sort
        })
      } else
        await db .collection ('balanceHistory') .deleteOne ({_id: h._id});
  } catch (e) {
    console .log(e);
  } finally {
    db .close();
  }
}

main();
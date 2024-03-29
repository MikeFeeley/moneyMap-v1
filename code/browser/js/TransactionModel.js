let TransactionModel_queries = [];
let TransactionModel_database;

class TransactionModel extends Model {

  constructor (database) {
    super ('transactions', database);
  }

  delete() {
    super .delete();
    TransactionModel_queries = [];
    TransactionModel_database = undefined;
  }

  _getQueries() {
    if (TransactionModel_database != this .getDatabase()) {
      TransactionModel_queries  = [];
      TransactionModel_database = this .getDatabase();
    }
    return TransactionModel_queries;
  }

  /**
   * return true iff list al is a subset of list bl
   */
  _isSubset (al, bl) {
    let bi = 0;
    for (let a of al) {
      while (bi < bl .length && bl [bi] < a)
        bi++;
      if (bi == bl .length || bl [bi] != a)
        return false;
      else if (bl [bi] == a)
        bi++;
    }
    return true;
  }

  /**
   * return true iff al and bl contain exactly the same elements
   */
  _isEqual (al, bl) {
    if (al .length == bl .length) {
      for (let i = 0; i < al. length; i++)
        if (al [i] != bl [i])
          return false;
      return true;
    }
    return false;
  }

  /**
   * return a list of all of the elements of al that are not in bl
   */
  _subtract (al, bl) {
    let cl = [], bi = 0;
    for (let a of al) {
      while (bi <= bl .length && bl [bi] < a)
        bi++;
      if (a != bl [bi])
        cl .push (a);
    }
    return cl;
  }

  /**
   * return union of lists al and bl
   */
  _union (al, bl) {
    let cl = [], bi = 0;
    for (let a of al) {
      cl .push (a);
      while (bi < bl .length && bl [bi] < a) {
        cl .push (bl [bi]);
        bi++;
      }
      if (a == bl [bi])
        bi++;
    }
    return cl;
  }

  /**
   * Iff query contains a date or date range ($lte/gte) or a category, then
   *   - return true iff a previous query has already fetched target transactions
   * On cache miss, if loadOnMiss is true AND query ONLY contains a date, date range or category (or combination), then
   *   - update list of previous queries
   */
  async _checkCache (query, append, loadOnMiss) {
    let queries = this._getQueries();
    let dates, categories, cacheHit;
    if (query .date) {
      if (typeof query .date == 'number')
        dates = {start: query .date, end: query .date}
      else if (query .date .$gte && Object .keys (query .date) .length == 1)
        dates = {start: query.date.$gte, end: 99999999}
      else if (query .date .$gte && query .date .$lte && Object .keys (query .date) .length == 2)
        dates = {start: query .date .$gte, end: query .date .$lte}
      else if (query .date .$gte && query .date .$lt && Object .keys (query .date) .length == 2)
        dates = {start: query .date .$gt, end: Types .date .addDay (query .date .$lte, -1)}
      else if (query .date .$gt && query .date .$lte && Object .keys (query .date) .length == 2)
        dates = {start: Types .date .addDay (query .date .$gt, 1), end: query .date .$lte}
      else if (query .date .$gt && query .date .$lt && Object .keys (query .date) .length == 2)
        dates = {start: Types .date .addDay (query .date .$gt, 1), end: Types .date .addDay (query .date .$lte, -1)}
      else if (query .date .$and && query .date .$and .length == 2) {
        let st = date .$and .find (a => {return a .$gte});
        let en = date .$and .find (a => {return a .$lte});
        if (st && en) {
          dates = {start: st .$gte, end: en .$lte}
        }
      }
    }
    if (query .category) {
      if (typeof query .category == 'string')
        categories = [query .category];
      else if (query .category .$in)
        categories = query .category .$in .sort();
    } else
      categories = null;
    if (dates && categories !== undefined) {
      cacheHit = queries .find (q => {
        return (dates .start >= q .start && dates .end <= q .end)  &&
          (! q .categories || (categories && this._isSubset (categories, q .categories)))
      }) != null;
      if (! cacheHit && loadOnMiss) {
        let matched, infill;
        for (let q of queries) {
          // do real query only on part of range not already covered by previous query (if match)
          if (dates .start == q .start && dates .end == q .end) {
            // same date range, additional categories
            infill   = {date: {$gte: dates .start, $lte: dates .end}};
            const cl = categories && this._subtract (categories, q .categories);
            if (cl)
              infill .category = {$in: cl};
            matched = true;
            break;
          } else if ((! categories && ! q .categories) || (categories && q .categories && this._isEqual (categories, q .categories))) {
            // same categories, extending date range
            if (dates .start < q .start && Types .date .subDays (q .start, dates .end) <= 1) {
              infill   = {date: {$gte: dates .start, $lt: q.start}};
              if (q .categories)
                infill .category = {$in: q .categories};
              q .start = dates .start;
              queries .sort ((a,b) => {return a .start < b .start? -1: a .start == b .start? 0: 1})
              matched  = true;
            } if (Types .date .subDays (dates .start, q .end) <= 1 && dates .end > q .end) {
              infill  = {date: {$gt: q .end, $lte: dates .end}};
              if (q .categories)
                infill .category = {$in: q .categories};
              q .end  = dates .end;
              matched = true;
            }
            if (matched) {
              // see if extending causes a new match
              let r = queries .find (r => {
                return r != q && (r .start == q .start && r .end == q .end)
              });
              if (r) {
                // same date range, combine categories
                q .categories = r .categories && this._union (q .categories , r .categories);
                queries .splice (queries .indexOf (r), 1);
              }
              break;
            }
          }
        }
        if (matched) {
          await super .find (infill, append, false);
          cacheHit = true;
        } else {
          infill = {date: {$gte: dates .start, $lte: dates .end}};
          if (categories && categories .length)
            infill.category = categories.length == 1 ? categories [0] : {$in: categories};
          await super .find (infill, append, false);
          let i;
          for (i = 0; i < queries .length; i++)
            if (dates .start >= queries [i] .start)
              break;
          queries .splice (i, 0, {
            start:      dates .start,
            end:        dates .end,
            categories: categories
          });
          cacheHit = true;
        }
      }
    }
    return cacheHit;
  }

  /**
   * Perform a find through local cache
   */
  async find (query, append) {
    if (query && query .$options && query .$options .primeCacheDateRange)
      if (! await this._checkCache ({date: query .date}, append, true))
        await super .find ({date: query .date}, append);
    const okToUseCacheForGroupLookup = await this._checkCache({date: query .date});
    return super .find (query, append, await this._checkCache (query, append, true), ! okToUseCacheForGroupLookup);
  }

  /**
   * Perform a has through local cache
   */
  async has (query) {
    return super .has (query, await this._checkCache (query, undefined, false));
  }
}

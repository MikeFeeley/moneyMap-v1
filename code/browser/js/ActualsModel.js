class ActualsModel extends Observable {
  constructor (budget, accounts) {
    super();
    this._budget = budget;
    this._accounts = accounts;
    this._transactionModel = new TransactionModel();
    this._transactionModel .addObserver (this, this._onModelChange);
    this._transactionModel .observe ();
    this._actualsModel = new Model ('actuals');
    this._accounts .setActualsModel (this);
    this._nullCat = {};
  }
  
  delete() {
    this._transactionModel .delete();
    this._actualsModel     .delete();
  }

  _onModelChange (eventType, tran, update, source) {
    let updateActuals = (cat, month, deltaAmount, deltaCount) => {
      if (! cat .actuals)
        cat .actuals = new Map();
      let entry = cat .actuals .get (month) || (cat .actuals .set (month, {amount: 0, count: 0}) .get (month));
      entry .amount += deltaAmount;
      entry .count  += deltaCount;
      if (month < this._oldsetMonth)
        this._oldestMonth = month;
    };
    if (tran .date) {
      let c = this._budget .getCategories() .get (tran .category) || this._nullCat;
      let a = (tran .debit || 0) - (tran .credit || 0);
      let s = eventType == ModelEvent .REMOVE? -1: 1;
      let m = Types .date._yearMonth (tran .date);
      updateActuals (c, m, a * s, s);
    }
    if (eventType == ModelEvent .UPDATE) {
      // remove original amount
      let original = {};
      for (let p of ['date', 'category', 'debit', 'credit'])
        original [p] = '_original_' + p in update? update ['_original_' + p]: tran [p];
      if (original .date) {
        let c = this._budget .getCategories() .get (original .category) || this._nullCat;
        let a = (original .debit || 0) - (original .credit || 0);
        let m = Types .date._yearMonth (original .date);
        updateActuals (c, m, -a, -1);
      }
    }
    this._notifyObservers (eventType, tran, update, source);
  }

  _add (data) {
    for (let d of data) {
      let cat = this._budget .getCategories() .get (d .category) || this._nullCat;
      cat .actuals = (cat .actuals || new Map()) .set (d .month, {amount: d .amount, count: d .count});
    }
  }

  getAccountsModel () {
    return this._accounts;
  }

  async findCurrent () {
    let st            = Types .date._yearMonth (Types .date .addYear (this._budget .getStartDate(), -1));
    let en            = Types .date._yearMonth (this._budget .getEndDate());
    this._haveHistory = false;
    this._curStart    = st;
    this._oldestMonth = st;
    this._add (await this._actualsModel .find ({$and: [{month: {$gte: st}}, {month: {$lte: en}}]}));
  }

  async findHistory() {
    if (! this._haveHistory) {
      let ac = await this._actualsModel .find ({month: {$lt: this._curStart}});
      this._add (ac);
      this._oldestMonth = ac .reduce ((o,a) => {return a .month < o? a .month: o}, this._oldestMonth)
      this._haveHistory = true;
    }
  }

  getHistoricYears() {
    let start  = Types .dateFY .getFYStart (Types .date._fromYearMonth (this._oldestMonth), this._budget .getStartDate(), this._budget .getEndDate());
    let years  = [];
    for (let st = start; st < this._budget .getStartDate(); st = Types .date .addYear (st, 1)) {
      let en = Types .date .monthEnd (Types .date .addMonthStart (st, 11));
      years .push ({
        label: BudgetModel .getLabelForDates (st, en),
        start: st,
        end:   en
      })
    }
    return years;
  }

  getAmountRecursively (cat, st = this._budget .getStartDate(), en = this._budget .getEndDate(), skip, includeMonths=true, includeYears=true) {
    let type = this._budget .getCategories() .getType (cat);
    cat = cat || this._nullCat;
    let include = (includeMonths && type == ScheduleType .MONTH) || (includeYears  && type == ScheduleType .YEAR) || type == ScheduleType .NONE;
    var amt = include? this .getAmount (cat, st, en, skip): 0;
    for (let child of (cat .children || []) .concat (cat .zombies || []))
      amt += this .getAmountRecursively (child, st, en, skip, includeMonths, includeYears); // XXX Homonyms?
    return amt;
  }

  /**
   * Get actual amount category for period
   *    cat   category
   *    st    starting date
   *    en    ending date
   *    skip  [[cat_id, date, amount]]  list of amounts subtracted from matching category/date
   */
  getAmount (cat, st = this._budget .getStartDate(), en = this._budget .getEndDate(), skip) {
    let skipAmount = (skip || [])
      .filter (skipEntry        => {return skipEntry [0] == cat._id && skipEntry [1] >= st && skipEntry [1] <= en})
      .reduce ((sum, skipEntry) => {return sum + skipEntry [2]}, 0);
    st = st && Types .date._yearMonth (st);
    en = en && Types .date._yearMonth (en < Types .date .monthStart (en)? Types .date .addMonthStart (en, -1): en);
    let amount;
    if (st && st == en)
      amount = ((cat .actuals && (cat .actuals .get (st) || {}) .amount) || 0);
    else
      amount = ((cat .actuals && Array .from (cat .actuals .entries())) || [])
        .filter (a     => {return (!st || a[0] >= st) && (!en || a[0] <= en)})
        .reduce ((s,a) => {return s + a[1] .amount}, 0);
    return amount - skipAmount;
  }

  async getTransactions (cat, st = this._budget .getStartDate(), en = this._budget .getEndDate()) {
    let homonyms = ((cat .parent && cat .parent .children) || []) .concat ((cat .parent && cat .parent .zombies) || [])
      .filter (c => {return c .name == cat .name})
      .map    (h => {return h._id});
    let query = {category: {$in: homonyms}};
    if (st || en) {
      query .date = {}
      if (st)
        query .date .$gte = st;
      if (en)
        query .date .$lte = en;
    }
    return this._transactionModel .find (query);
  }

  hasTransactions (cats, start, end) {
    return [] .concat (cats) .find (cat => {return this._getActiveMonths (cat) .find (m => {
      return (! start || m >= start) && (!end || m <= end)
    })}) != null;
  }

  _getActiveMonths (cat) {
    return cat .actuals
      ? Array .from (cat .actuals .entries())
        .filter (e     => {return e[1] .count > 0})
        .sort   ((a,b) => {return a[0] < b[0]? -1: a[0] == b[0]? 0: 1})
        .map    (e     => {return Types .date._fromYearMonth (e[0])})
      : [];
  }

  getActivePeriod (cats) {
    let activeMonths = ([] .concat (cats)) .reduce ((list, cat) => {
      return list .concat (this._getActiveMonths (cat))
    }, []) .sort();
    if (activeMonths .length == 0)
      return {none: true}
    else
      return {
        start: activeMonths [0],
        end:   Types .date .monthEnd (activeMonths .slice (-1) [0])
      }
  }

  /**
   * Returns starting cash flow balance for specified date
   *     (a) start with current balance
   *     (b) undo transactions since date (or beginning of budget if dates is in future) to get starting balance
   *     (c) if date is in future, add budget results date less one month
   */
  getCashFlowBalance (date) {
    let bal      = this._accounts .getCashFlowBalance();
    let today    = Types .date .today();
    let start    = Math .min (date, this._budget .getStartDate());
    for (let cat of this._budget .getCategories() .getRoots() .concat (null))
      bal += this .getAmountRecursively (cat, start, today);
    if (date > today) {
      let end = Types .date .addMonthStart (date, -1);
      for (let cat of this._budget .getCategories() .getRoots())
        for (let st = start; st < date; st = Types .date .addYear (st, 1)) {
          let en = Types .date .monthEnd (Types .date .addMonthStart (st, 11));
          bal -= this._budget .getAmount (cat, st, en) .amount;
        }
    }
    return bal;
  }
}

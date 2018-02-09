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
  }
  
  delete() {
    this._transactionModel .delete();
  }

  _onModelChange (eventType, tran, update, source) {
    let updateActuals = (c,m,a) => {
      c .actuals = (c .actuals || new Map()) .set (m, ((c .actuals && c .actuals .get (m)) || 0) + a);
      if (m < this._oldsetMonth)
        this._oldestMonth = m;
    };
    if (tran .category && tran .date) {
      let c = this._budget .getCategories() .get (tran .category);
      if (c) {
        let a = (tran .debit || 0) - (tran .credit || 0);
        let s = eventType == ModelEvent .REMOVE? -1: 1;
        let m = Types .date._yearMonth (tran .date);
        updateActuals (c, m, a * s);
      }
    }
    if (eventType == ModelEvent .UPDATE) {
      // remove original amount
      let original = {};
      for (let p of ['date', 'category', 'debit', 'credit'])
        original [p] = '_original_' + p in update? update ['_original_' + p]: tran [p];
      if (original .date && original .category) {
        let c = this._budget .getCategories() .get (original .category);
        if (c) {
          let a = (original .debit || 0) - (original .credit || 0);
          let m = Types .date._yearMonth (original .date);
          updateActuals (c, m, -a);
        }
      }
    }
    this._notifyObservers (eventType, tran, update, source);
  }

  _add (data) {
    for (let d of data) {
      let cat = this._budget .getCategories() .get (d .category);
      if (cat)
        cat .actuals = (cat .actuals || new Map()) .set (d .month, d .amount);
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
      .reduce ((sum, skipEntry) => {return sum + skipEntry [2]}, 0)
    st = Types .date._yearMonth (st);
    en = Types .date._yearMonth (en < Types .date .monthStart (en)? Types .date .addMonthStart (en, -1): en);
    let amount;
    if (st == en)
      amount = ((cat .actuals && cat .actuals .get (st)) || 0);
    else
      amount = ((cat .actuals && Array .from (cat .actuals .entries())) || [])
        .filter (a     => {return a[0] >= st && a[0] <= en})
        .reduce ((s,a) => {return s + a[1]}, 0);
    return amount - skipAmount;
  }

  async getTransactions (cat, st = this._budget .getStartDate(), en = this._budget .getEndDate()) {
    let homonyms = ((cat .parent && cat .parent .children) || []) .concat ((cat .parent && cat .parent .zombies) || [])
      .filter (c => {return c .name == cat .name})
      .map    (h => {return h._id});

    return this._transactionModel .find ({date: {$gte: st, $lte: en}, category: {$in: homonyms}});
  }

  async hasTransactions (query) {
    return this._transactionModel .has (query);
  }

  /**
   * Returns starting cash flow balance for specified date
   *     (a) start with current balance
   *     (b) undo transactions since date (or beginning of budget if dates is in future) to get starting balance
   *     (c) ignore prior-year suspense and double current year (in anticipating of repayment)
   *     (d) if date is in future, add budget results date less one month
   */
  getCashFlowBalance (date) {
    let bal      = this._accounts .getCashFlowBalance();
    let today    = Types .date .today();
    let start    = Math .min (date, this._budget .getStartDate());
    for (let cat of this._budget .getCategories() .getRoots())
      if (cat == this._budget .getSuspenseCategory())
        bal += this .getAmountRecursively (cat, this._budget .getStartDate(), today) * 2
      else
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

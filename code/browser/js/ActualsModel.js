class ActualsModel extends Observable {
  constructor (budget) {
    super();
    this._budget = budget;
    this._transactionModel = new TransactionModel();
    this._transactionModel .addObserver (this, this._onModelChange);
    this._transactionModel .observe ();
    this._categoriesModel = budget .getCat
    this._actualsModel = new Model ('actuals');
  }
  
  delete() {
    this._transactionModel .delete();
  }

  _onModelChange (eventType, doc, arg, source) {
    this._actuals._onModelChange (eventType, doc, arg, source);
    this._notifyObservers (eventType, doc, arg, source);
  }
  
  async findCurrent () {
    let st = Types .date._yearMonth (Types .date .addYear (this._budget .getStartDate(), -1));
    let en = Types .date._yearMonth (this._budget .getEndDate());
    let ac = await this._actualsModel .find ({$and: [{month: {$gte: st}}, {month: {$lte: en}}]})
    this._actuals     = new Actuals (this._budget, ac);
    this._haveHistory = false;
    this._curStart    = st;
    return this._actuals;
  }

  async findHistory() {
    if (! this._haveHistory) {
      let ac = await this._actualsModel .find ({month: {$lt: this._curStart}});
      this._actuals .add (ac);
      this._haveHistory = true;
    }
  }

  getAmount (cat, st, en, skip) {
    return this._actuals .getAmount (cat, st, en, skip);
  }

  getAmountRecursively (cat, st, en, skip, includeMonths, includeYears, addCats) {
    return this._actuals .getAmountRecursively (cat, st, en, skip, includeMonths, includeYears, addCats);
  }

  getModel() {
    return this._transactionModel;
  }

  async getTransactions (cat, st, en) {
    return this._actuals .getTransactions (cat, st, en);
  }
}

class Actuals {
  constructor (budget, data) {
   this._budget     = budget;
   this._categories = budget .getCategories();
   this .add (data);
  }

  _onModelChange (eventType, tran, update) {
    let updateActuals = (c,m,a) => {c .actuals = (c .actuals || new Map()) .set (m, ((c .actuals && c .actuals .get (m)) || 0) + a)};
    if (tran .category && tran .date) {
      let c = this._categories .get  (tran .category);
      if (c) {
        let a = (tran .debit || 0) - (tran .credit || 0);
        let s = eventType == ModelEvent .REMOVE? -1: 1;
        let m = Types .date._yearMonth (tran .date);
        updateActuals (c, m, a * s);
      }
    }
    if (eventType == ModelEvent .UPDATE) {
      let noOrigDate = '_original_date'     in update && ! update._original_category;
      let noOrigCat  = '_original_category' in update && ! update._original_category;
      if (! noOrigDate && ! noOrigCat) {
        let c = this._categories .get (update._original_cateogory || tran .category);
        if (c) {
          let d = update._original_date || tran .date;
          if (d) {
            let a = (update._original_debit || tran .debit || 0) - (update._original_credit || tran .credit || 0);
            let m = Types .date._yearMonth (d);
            updateActuals (c, m, -a);
          }
        }
      }
    }
  }

  add (data) {
    for (let d of data) {
      let cat = this._categories .get (d .category);
      if (cat)
        cat .actuals = (cat .actuals || new Map()) .set (d .month, d .amount);
    }
  }

  getAmountRecursively (cat, st = this._budget .getStartDate(), en = this._budget .getEndDate(), skip, includeMonths=true, includeYears=true) {
    let type = this._budget .getCategories() .getType (cat);
    let include = (includeMonths && type == ScheduleType .MONTH) || (includeYears  && type == ScheduleType .YEAR) || type == ScheduleType .NONE;
    var amt = include? this .getAmount (cat, st, en, skip): 0;
    for (let child of (cat .children || []) .concat (cat .zombies || []))
      amt += this .getAmountRecursively (child, st, en, skip, includeMonths, includeYears); // XXX Homonyms?
    return amt;
  }

  getAmount (cat, st = this._budget .getStartDate(), en = this._budget .getEndDate(), skip) {
    let sk = (skip || [])
      .filter (s => {return s[0] == cat._id})
      .map    (s => {return Types .date._yearMonth (s[1])});
    st = Types .date._yearMonth (st);
    en = Types .date._yearMonth (en);
    if (st == en)
      return (! sk .includes (st) && cat .actuals && cat .actuals .get (st)) || 0;
    else
      return ((cat .actuals && Array .from (cat .actuals .entries())) || [])
        .filter (a     => {return a[0] >= st && a[0] <= en && ! sk .includes (a[0])})
        .reduce ((s,a) => {return s + a[1]}, 0)
  }

  async getTransactions (cat, st = this._budget .getStartDate(), en = this._budget .getEndDate()) {
    return []; // stub TODO
  }
}

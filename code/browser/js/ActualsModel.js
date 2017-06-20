class ActualsModel extends Observable {
  constructor (budget) {
    super();
    this._budget = budget;
    this._model  = new Model ('transactions');
    this._model .addObserver (this, this._onModelChange);
  }
  
  delete() {
    this._model .delete();
  }

  _onModelChange (eventType, doc, arg, source) {
    this._actuals._onModelChange (eventType, doc, arg, source);
    this._notifyObservers (eventType, doc, arg, source);
  }

  *find () {
    this._actuals = new Actuals (this._budget, yield* this._model .find ({
      $and: [{date: {$gte: Types .date .addYear (this._budget .getStartDate(), -1)}}, {date: {$lte: this._budget .getEndDate()}}]
    }));
    this._haveHistory = false;
    return this._actuals;
  }

  *findHistory() {
    if (! this._haveHistory) {
      this._actuals .addTransactions (yield* this._model .find ({
        date: {$lt: Types .date .addYear (this._budget .getStartDate(), -1)}
      }, true));
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
    return this._model;
  }

  getTransactions (cat, st, en) {
    return this._actuals .getTransactions (cat, st, en);
  }
}

class Actuals {
  constructor (budget, trans) {
    this._budget = budget;
    this._trans  = trans .reduce ((m,t) => {m .set (t._id, t); return m}, new Map());
    this._index  = new Map();
    this._ranges = [];
    var createEmptyActuals = cats => {
      for (let c of cats || []) {
        let act = {
          category: c,
          parent:   c .parent && this._index .get (c .parent._id),
          children: [],
          amounts:  []
        }
        this._index .set (c._id, act);
        if (act .parent)
          act .parent .children .push (act);
        createEmptyActuals ((c .children || []) .concat (c .zombies || []));
      }
    }
    createEmptyActuals (this._budget .getCategories() .getRoots());
  }

  addTransactions (trans) {
    for (let t of trans)
      this._trans .set (t._id, t);
  }

  _getEntry (id) {
    var act = this._index .get (id);
    if (! act) {
      var c = this._budget .getCategories() .get (id);
      if (c) {
        var parent = c .parent && this._getEntry (c .parent._id);
        act = {
          category: c,
          parent:   parent,
          children: [],
          amounts:  []
        }
        if (parent)
          parent .children .push (act);
        this._index .set (c._id, act)
      }
    }
    return act;
  }

  _onModelChange (eventType, tran, update) {
    switch (eventType) {
      case ModelEvent .UPDATE:
        tran = this._trans .get (tran._id);
        for (let f in update)
          tran [f] = update [f];
        break;
      case ModelEvent .INSERT:
        this._trans .set (tran._id, tran);
        break;
      case ModelEvent .REMOVE:
        tran = this._trans .get (tran._id);
        this._trans .delete (tran._id)
        break;
    }
    var act = this._getEntry (tran .category);
    if (act) {
      var origDate = (update && update .date)? update._original_date: tran .date;
      var origAct  = (update && update .category)? update ._original_category && this._getEntry (update ._original_category): act;
      for (let r of this._ranges)
        if ((tran .date >= r .start && tran .date <= r .end) || (origDate && origDate >= r.start && origDate <= r.end)) {
          var ri = this._ranges .indexOf (r);
          switch (eventType) {
            case ModelEvent .UPDATE:
              var origAmt =
                (update .debit  != null? update._original_debit  || 0: tran .debit) -
                (update .credit != null? update._original_credit || 0: tran .credit)
              var amt = (tran .debit || 0) - (tran .credit || 0);
              if (origAct && origDate && origDate >= r.start && origDate <= r.end)
                origAct .amounts [ri] = (origAct .amounts [ri] || 0) - origAmt;
              if (tran .date >= r.start && tran .date <= r.end)
                act .amounts [ri] = (act .amounts [ri] || 0) + amt;
              break;
            case ModelEvent .INSERT:
              act .amounts [ri] = (act .amounts [ri] || 0) + (tran .debit || 0) - (tran .credit || 0);
              break;
            case ModelEvent .REMOVE:
              act .amounts [ri] = (act .amounts [ri] || 0) - (tran .debit || 0) - (tran .credit || 0);
              break;
          }
        }
    }
  }

  _getInterval (st, en) {
    var ri = this._ranges .findIndex (r => {return r.start == st && r.end == en})
    if (ri == -1) {
      this._ranges .push ({start: st, end: en});
      ri = this._ranges .length - 1;
      for (let kv of this._trans) {
        var tran = kv [1];
        if (tran .date >= st && tran .date <= en) {
          var act = this._getEntry (tran .category);
          if (act)
            act .amounts [ri] = (act .amounts [ri] || 0) + tran .debit - tran .credit;
        }
      }
    }
    return ri;
  }

  getAmountRecursively (cat, st = this._budget .getStartDate(), en = this._budget .getEndDate(), skip, includeMonths=true, includeYears=true) {
    let type = this._budget .getCategories() .getType (cat);
    let include = (includeMonths && type == ScheduleType .MONTH) || (includeYears  && type == ScheduleType .YEAR) || type == ScheduleType .NONE;
    var amt = include? this .getAmount (cat, st, en, skip): 0;
    for (let child of (cat .children || []) .concat (cat .zombies || []))
      amt += this .getAmountRecursively (child, st, en, skip, includeMonths, includeYears);
    return amt;
  }

  getAmount (cat, st = this._budget .getStartDate(), en = this._budget .getEndDate(), skip) {
    var act      = this._getEntry    (cat._id);
    var interval = this._getInterval (st, en);
    var amt      = act .amounts [interval] || 0;
    for (let s of skip || [])
      if (s[0] == act .category._id && s[1] >= this._ranges [interval] .start && s[1] <= this._ranges [interval] .end)
        amt -= s[2];
    return amt;
  }

  getTransactions (cat, st = this._budget .getStartDate(), en = this._budget .getEndDate()) {
    return Array .from (this._trans .values()) .filter (t => {return t .category == cat._id && t .date >= st && t .date <= en});
  }
}

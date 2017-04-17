class HistoryModel extends Model {
  constructor (variance) {
    super ('history');
    this._variance    = variance;
    this._actuals     = this._variance .getActuals();
    this._budget      = this._variance .getBudget();
    this._categories  = this._budget   .getCategories();
    this._budgetModel = new Model ('budgets');
    this._catModel    = new Model ('categories');
    this._tranModel   = new Model ('transactions');
    this._cats        = new Map();
  }

  delete() {
    super .delete();
    this._budgetModel .delete();
    this._catModel    .delete();
    this._tranModel   .delete();
  }

  *_getCats (budgetId) {
    var cats = this._cats .get (budgetId);
    if (!cats) {
      var budget = (yield*  this._budgetModel .find ({_id: budgetId})) [0];
      if (budget .hasTransactions)
        var catList = yield* this._catModel .find ({budgets: budgetId});
      else {
        var catList = [];
        var ids     = (yield* this .find ({budget: budgetId})) .map (h => {return h .category});
        while (ids .length) {
          var lst = yield* this._catModel .find ({_id: {$in: ids}});
          ids     = lst .filter (c => {return c .parent}) .map (c => {return c .parent});
          catList = catList .concat (lst);
        }
      }
      var cats = catList .reduce ((m,c) => {m .set (c._id, c); return m}, new Map());
      for (let cat of catList)
        if (cat .parent)
          cat .parent = cats .get (cat .parent);
      for (let cat of catList)
        if (cat .parent)
          cat .parent .children = (cat .parent .children || []) .concat (cat);
      this._cats .set (budgetId, cats);
    }
    return cats;
  }

  _isCredit (cat) {
    return cat && (cat .parent? this ._isCredit (cat .parent): cat .credit);
  }

  _getDescendants (cat) {
    var children = cat .children || [];
    return children .concat (children .reduce ((list, c) => {return list .concat (this._getDescendants (c))}, []));
  }

  *generate (budgetId) {
    if (budgetId != this._budget .getId()) {
      var budget = yield* this._budgetModel .find ({_id: budgetId});
      if (budget .length == 1) {
        budget        = budget [0];
        yield* this._getCats (budgetId);
        var catAmount = new Map();
        var trans     = yield* this._tranModel .find ({$and: [{date: {$gte: budget .start}}, {date: {$lte: budget .end}}]}) || [];
        if (trans .length) {
          for (let tran of trans) {
            let cat = catAmount .get (tran .category) || catAmount .set (tran .category, {amount: 0}) .get (tran .category);
            cat .amount += tran .debit - tran .credit;
          }
          var rem = this .removeList ((yield* this .find ({budget: budget._id})) .map (d => {return d._id}));
          var asc = []
          for (let [c, a] of catAmount)
            asc .push (this .insert ({
              budget:   budget._id,
              category: c,
              amount:   a .amount * (this._isCredit (this._cats .get (budgetId) .get (c))? -1: 1)
            }))
          for (let a of asc)
            yield* a;
          yield* rem;
        }
      }
    }
  }

  *getAmounts (budgetId, parentIds) {
    var cats     = yield* this._getCats (budgetId);
    var children = parentIds .reduce ((list,pid) => {return list .concat ((cats .get (pid) || {}) .children || [])}, []);
    var families = children  .reduce ((map,cat)  => {return map .set (cat._id, [cat] .concat(this._getDescendants (cat)))}, new Map());
    var everyone = Array .from (families .keys())
      .map    (cid    => {return families .get (cid) .map (f => {return f._id})})
      .reduce ((l,sl) => {return l .concat (sl)}, [])
      .concat (parentIds);
    var history = ((yield* this .find ({budget: budgetId, category: {$in: everyone}})) || [])
      .reduce ((m,h) => {return m .set (h .category, h .amount)}, new Map())
    var data = parentIds .map (pid => {
      return {
        id:      pid,
        name:    (cats .get (pid) || {}) .name,
        amounts: children .filter (c => {return c .parent._id == pid}) .map (c => {
          return {
            id:       c._id,
            name:     c .name,
            isCredit: this._isCredit (c),
            amount:   families .get (c._id) .reduce ((s,cat) => {return s + (history .get (cat._id) || 0)}, 0) || 0
          }
        })
      }
    }) .filter (d => {return d .name !== undefined});
    for (let pid of parentIds) {
      var other = history .get (pid);
      if (other)
        data [parentIds .indexOf (pid)] .amounts .push ({
          name:     'Other',
          isCredit: this._isCredit (cats .get (pid)),
          amount:   other
        })
    }
    return data;
  }
}





class BudgetModel extends Observable {
  constructor() {
    super();
    this._budModel = new Model ('budgets');
    this._observer = this._budModel .addObserver (this, this._onBudgetModelChange);
  }

  delete() {
    this._budModel .delete();
  }

  _onBudgetModelChange (eventType, doc, arg, source) {
    this._onModelChange (eventType, doc, arg, source, this._budModel)
  }

  _onSchedulesModelChange (eventType, doc, arg, source) {
    this._onModelChange (eventType, doc, arg, source, this._schModel)
  }

  _onModelChange (eventType, doc, arg, source, model) {
    this._notifyObservers (eventType, doc, arg, source, model);
  }

  *find (budQuery, catQuery, schQuery) {
    this._budget = (yield* this._budModel .find (budQuery)) [0];
    if (this._schModel)
      this._schModel .delete();
    this._schModel = new SchedulesModel (this);
    this._schModel .addObserver (this, this._onSchedulesModelChange);
    yield* this._schModel .find (catQuery, schQuery);
  }

  *getHistoricBudgets() {
    return (yield* this._budModel .find ())
      .filter (b     => {return b .end < this._budget .start})
      .sort   ((a,b) => {return a .start < b .start? -1: a .start == b .start? 0: 1})
  }

  getFutureBudgets() {
    // XXX Assuming budget name is #### or ####/#
    var addYearToName = y => {
      var n = this._budget .name .split ('/');
      if (n .length == 2)
        return (Number (n[0]) + y) + '/' + String ((Number (n[1]) + y)) .slice (-1)
      else
        return String (Number (n[0]) + y)
    }
    return [1,2,3,4,5,6,7,8] .map (y => {
      return {
        name:  addYearToName           (y),
        start: Types .dateDMY .addYear (this._budget .start, y),
        end:   Types .dateDMY .addYear (this._budget .end,   y)
      }
    })
  }

  getCategories() {
    return this._schModel .getCategories();
  }

  getId() {
    return this._budget ._id;
  }

  getName() {
    return this._budget .name;
  }

  getStartDate() {
    return this._budget .start;
  }

  getEndDate() {
    return this._budget .end;
  }

  getStartCashBalance() {
    return this._budget .startCashBalance;
  }

  getSchedulesModel() {
    return this._schModel
  }

  getIncomeCategory() {
    return this._schModel .getCategories() .get (this._budget .incomeCategory);
  }

  getExpenseCategory() {
    return this._schModel .getCategories() .get (this._budget .expenseCategory);
  }

  getSavingsCategory() {
    return this._schModel .getCategories() .get (this._budget .savingsCategory);
  }

  getSuspenseCategory() {
    return this._schModel. getCategories() .get (this._budget .suspenseCategory);
  }

  getAmount (cat, st, en) {
    return this._schModel .getAmount (cat, st, en);
  }

  getIndividualAmount (cat, st, en) {
    return this._schModel .getIndividualAmount (cat, st, en);
  }

  isCredit (cat) {
    return this._schModel .isCredit (cat);
  }

  isGoal (cat) {
    return this._schModel .isGoal (cat);
  }

  delete() {
    this._budModel .delete();
    this._schModel .delete();
  }
}

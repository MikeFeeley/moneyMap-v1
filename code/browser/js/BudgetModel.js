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

  async find (id) {
    let today = Types .date .today();
    //    this._budgets = await this._budModel .find ({start: {$lte: today}, end: {$gte: today}});
    this._budgets = await this._budModel .find ();  // XXX Old budgets?
    this._budget  = this._budgets .find (b => {return b._id == id});
    if (this._schModel)
      this._schModel .delete();
    this._schModel = new SchedulesModel (this);
    this._schModel .addObserver (this, this._onSchedulesModelChange);
    await this._schModel .find ();
  }

  async getHistoricBudgets() {
    return (await this._budModel .find ())
      .filter (b     => {return b .end < this._budget .start})
      .sort   ((a,b) => {return a .start < b .start? -1: a .start == b .start? 0: 1})
  }

  getActiveBudgets() {
    return this._budgets;
  }

  getFutureBudgets() {
    var addYearToName = y => {
      var n = this .getLabel() .split ('/');
      if (n .length == 2)
        return (Number (n[0]) + y) + '/' + String ((Number (n[1]) + y)) .slice (-1)
      else
        return String (Number (n[0]) + y)
    }
    return [1,2,3,4,5,6,7,8,9,10,11,12,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40] .map (y => {
      return {
        name:  addYearToName           (y),
        start: Types .dateDMY .addYear (this._budget .start, y),
        end:   Types .dateDMY .addYear (this._budget .end,   y)
      }
    })
  }

  static getLabelForDates (start, end) {
    let sy = Types .date._year (start);
    let ey = Types .date._year (end);
    if (sy == ey)
      return sy .toString();
    else
      return sy + '/'+ ((sy % 10) + 1)

  }

  getLabel (date = {start: this._budget .start, end: this._budget .end}) {
    return BudgetModel .getLabelForDates (date .start, date .end);
  }

  getCategories() {
    return this._schModel .getCategories();
  }

  getActiveBudgets() {

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

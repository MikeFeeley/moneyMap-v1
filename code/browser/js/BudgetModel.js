/**
 * Budget Model
 *     name
 *     start
 *     end
 *     incomeCategory
 *     expenseCategory
 *     savingsCategory
 *     suspenseCategory
 */

class BudgetModel extends Observable {
  constructor() {
    super();
    this._budModel = new Model ('budgets');
    this._observer = this._budModel .addObserver (this, this._onBudgetModelChange);
  }

  delete() {
    this._budModel .delete();
    if (this._schModel)
      this._schModel .delete();
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

  async find (id, actualsModel) {
    let today = Types .date .today();
    this._budgets = await this._budModel .find ();
    this._budget  = this._budgets .find (b => {return b._id == id});
    if (this._schModel)
      this._schModel .delete();
    this._schModel = new SchedulesModel (this, actualsModel);
    this._schModel .addObserver (this, this._onSchedulesModelChange);
    await this._schModel .find ();
  }

  static getLabelForDates (start, end) {
    let sy = Types .date._year (start);
    let ey = Types .date._year (end);
    if (sy == ey)
      return sy .toString();
    else
      return sy + '/'+ (((sy + 1) % 10))

  }

  getLabel (date = {start: this._budget .start, end: this._budget .end}) {
    return BudgetModel .getLabelForDates (date .start, date .end);
  }

  getDescriptor (yearIncrement = 0) {
    let start = Types .date .addYear (this .getStartDate(), yearIncrement);
    let end   = Types .date .addYear (this .getEndDate(), yearIncrement)
    return {
      label: BudgetModel .getLabelForDates (start, end),
      start: start,
      end:   end
    }
  }

  getCategories() {
    return this._schModel && this._schModel .getCategories();
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

  getWithdrawalsCategory() {
    return this._schModel .getCategories() .get (this._budget .withdrawalsCategory);
  }

  getSuspenseCategory() {
    return this._schModel. getCategories() .get (this._budget .suspenseCategory);
  }

  getAmount (cat, st, en, sa) {
    return this._schModel .getAmount (cat, st, en, sa);
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
}

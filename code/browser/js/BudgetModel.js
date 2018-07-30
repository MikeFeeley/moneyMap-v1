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
    this._rootNames   = ['Spending',        'Savings',         'Income',         'Withdrawals',         'Suspense'];
    this._budgetRoots = ['expenseCategory', 'savingsCategory', 'incomeCategory', 'withdrawalsCategory', 'suspenseCategory'];
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

    this._budgets = await this._budModel .find ();

    // ROBUSTNESS: Add a budget if there aren't any
    if (this._budgets .length == 0) {
      const today  = Types .date .today();
      const budget = await this._budModel .insert ({
        name:  String (Types .date._year (today)),
        start: Types .date .getYearStart (today),
        end:   Types .date .getYearEnd   (today)
      });
      this._budgets = [budget];
    }

    this._budget = this._budgets .find (b => {return b._id == id}) || this._budgets [0];

    // ROBUSTNESS: Add or update root categories if they don't exist for this budget
    const missingBudgetRoots = this._budgetRoots .filter (br => ! this._budget [br]);
    if (missingBudgetRoots .length) {
      const catModel         = new Model ('categories');
      const missingRootNames = missingBudgetRoots .map (br => this._rootNames [this._budgetRoots .indexOf (br)]);
      const roots            = await catModel .find ({name: {$in: missingRootNames}, $or: [{parent: null}, {parent: {$exists: false}}]});
      if (roots .length)
        await catModel .updatelist (roots .map (c => ({id: c._id, update: {budgets: c .budgets .concat (this._budget._id)}})));
      if (roots .length != missingRootNames .length) {
        const stillMissing = missingRootNames .filter (n => ! roots .find (c => c .name == name));
        roots .push (... await catModel .insertList (stillMissing .map (n => ({name: n, budgets: [this._budget._id]}))));
      }
      const budgetUpdate = roots .reduce ((o, c) => Object .assign (o, {[this._budgetRoots [this._rootNames .indexOf (c .name)]]: c._id}), {});
      Object .assign (this._budget, budgetUpdate);
      await this._budModel .update (this._budget._id, budgetUpdate);
      catModel .delete();
    }
    if (this._schModel)
      this._schModel .delete();
    this._schModel = new SchedulesModel (this, actualsModel);
    this._schModel .addObserver (this, this._onSchedulesModelChange);
    await this._schModel .find ();
  }

  // ROBUSTNESS: Check that budget roots really exist
  async checkRoots (catModel) {
    const badBudgetRoots = this._budgetRoots .filter (br => {
      const cat = this._budget [br] && catModel .get (this._budget [br]);
      return ! cat || ! cat .budgets .includes (this._budget._id);
    });
    if (badBudgetRoots .length == 0)
      return [];
    else {
      const badRoots = badBudgetRoots .map (br => this._rootNames [this._budgetRoots .indexOf (br)]);
      const cats     = await catModel .find ({name: {$in: badRoots}, $or: [{parent: null}, {parent: {$exists: false}}]});
      const update   = cats .filter (c => ! c .budgets || ! c .budgets .includes (this._budget._id));
      if (update .length)
        await catModel .updateList (update .map (u => ({id: u._id, update: {budgets: (u .budgets || []) .concat (this._budget._id)}})));
      let insert = this._rootNames .filter (n => ! cats .find (c => c .name == n));
      if (insert .length)
        insert = await catModel .insertList (insert .map (i => ({name: i, budgets: [this._budget._id]})));
      const budgetUpdate = (cats .concat (insert))
        .reduce ((o,c) => Object .assign (o, {[this._budgetRoots [this._rootNames .indexOf (c .name)]]: c._id}), {});
      Object .assign (this._budget, budgetUpdate);
      await this._budModel .update (this._budget._id, budgetUpdate);
      return update .concat (insert);
    }
  }

  static getLabelForDates (start, end) {
    let sy = Types .date._year (start);
    let ey = Types .date._year (end);
    if (sy == ey)
      return sy .toString();
    else
      return sy + '/' + (((sy + 1) % 100))
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

  getName (id) {
    let budget = id? this._budgets .find (b => {return b._id == id}): this._budget;
    return budget .name;
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

  getBudgetedRootCategories () {
    return [this.getIncomeCategory (), this.getExpenseCategory (), this.getSavingsCategory (), this.getWithdrawalsCategory ()]
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

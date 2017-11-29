class AccountBalance extends TuplePresenter {
  constructor (variance) {
    super (variance .getActuals() .getAccountsModel(), new AccountBalanceView(), {})
    this._variance        = variance;
    this._actuals         = variance .getActuals();
    this._budget          = variance .getBudget();
    this._categories      = this._budget .getCategories();
    this._netZeroTuples   = [];
    this._budgetObserver  = this._budget  .addObserver (this, this._onBudgetChange);
    this._actualsObserver = this._actuals .addObserver (this, this._onActualsChange);
    this._accountsObserver = this._model  .addObserver (this, this._onAccountsChange)
  }

  delete() {
    super       .delete();
    this._model .delete();
    this._budget  .removeObserver (this._budgetObserver);
    this._actuals .removeObserver (this._actualsObserver);
    this._model   .removeObserver (this._accountsObserver);
  }

  _onBudgetChange (eventType, doc, arg, source, model) {
    if (model instanceof SchedulesModel && this._isNetZeroCategory (doc._id))
      this._updateNetToZero();
  }

  _onActualsChange (eventType, doc, arg) {
    if (this._isNetZeroCategory (doc .category) || (arg && arg._original_category && this._isNetZeroCategory (arg._original_category)))
      this._updateNetToZero();
  }

  _onAccountsChange (eventType, doc, arg) {
    this._view .resetHtml();
  }

  _onViewChange (eventType, arg) {
    if (eventType == AccountBalanceViewEvent .CLICK) {
      var dates = {
        start: Types .date .monthStart (Types .date .today()),
        end:   Types .date .monthEnd   (Types .date .today())
      }
      if (arg .isCat) {
        if (arg .name == 'Other')
          arg .id = 'other_' + arg .id;
        TransactionHUD .showCategory (arg .id, dates, this._model, this._variance, arg .toHtml, arg .position);
      } else
        TransactionHUD .showAccount  (arg .id, dates, this._model, this._variance, arg .toHtml, arg .position);
    } else
      super._onViewChange (eventType, arg);
  }

  _addGroup (name, accounts) {
    if (accounts .length > 0) {
      let g = this._view .addGroup (name, accounts [0] .creditBalance? '_flagGood': '_flagBad');
      for (let acc of accounts)
        this._addTuple (acc, g);
    }
  }

  _addNetToZero() {
    this._updateNetToZero();
   }

  _isNetZeroCategory (id) {
    return this._categories .getPath (this._categories .get (id)) [0] == this._budget .getSuspenseCategory();
  }

  _updateNetToZero() {
    this._view .removeGroup ('_netZero');
    for (let id of this._netZeroTuples)
      this._view .removeTuple (id);
    this._netZeroTuples = [];
    var cat = this._budget .getSuspenseCategory();
    for (let child of (cat && cat .children) || []) {
      var bal = this._actuals .getAmountRecursively (child, this._budget .getStartDate() ,this._budget .getEndDate());
      if (bal != 0) {
        let g = this._view .addGroup (child .name, '_netZero _flagInfo');
        if (child .children)
          for (let c of child .children) {
            var b = this._actuals .getAmountRecursively (c, this._budget .getStartDate() ,this._budget .getEndDate());
            if (b != 0) {
              this._addTuple ({
                isCat:   true,
                _id:     c._id,
                name:    c .name,
                balance: -b
              }, g)
              this._netZeroTuples .push (c._id);
            }
            bal -= b
          }
        if (bal != 0) {
          this._addTuple ({
            isCat:   true,
            _id:     child._id,
            name:    'Other',
            balance: -bal
          }, g)
          this._netZeroTuples .push (child._id);
        }
      }
    }
  }

  _buildHtml() {
    let accounts = this._model .getAccounts() .sort ((a,b) => {return a .sort < b .sort? -1: 1});
    for (let group of accounts .filter (a => {return a .type == AccountType .GROUP && a .cashFlow}))
      this._addGroup (group .name, accounts .filter (a => {return a .group == group._id}))
    this._addNetToZero();
  }

  async addHtml (toHtml) {
    await this._model .find();
    this._view .addHtml (toHtml, () => {this._buildHtml()});
    this._buildHtml();
  }
}

/**
 * Accounts Model
 *     name
 *     type                 AccountType; GROUP or ACCOUNT
 *     form                 CASH_FLOW, ASSET_LIABILITY, INCOME_SOURCE
 *     sort
 *  ACCOUNT only:
 *     group                account id of group
 *     number               bank number used to match transactions when importing
 *     balance              $
 *     balanceDate          effective date of account balance (today if null or undefined)
 *     creditBalance        true if credit increases balance (chequing); false if decreases (visa)
 *     apr                  annual interest rate or null to use default rate
 *  ASSET:
 *     disTaxRate           tax rate for withdrawals
 *     liquid               true iff liquid asset / liability
 *     taxDeferred          true ifff asset is taxDeferred
 *  LIABILITY:
 *     rateType             type of rate calculation (e.g., simple interest or canadian mortgage)
 *     paymentFrequency     regular payment frequency, needed for canadian mortgage interest calculation
 *     accruedInterest      interest through balanceDate (including that date) that is unpaid
 *  CASH_FLOW:
 *     pendingTransactions  []
 *  ASSET / LIABILITY:
 *     category             savings: asset contribution or liability principal
 *     disCategory          withdrawal if asset or liability (disbursement or loan add-on)
 *     intCategory          expense; only for liabilities (entire payment or just interest part, depending)
 *     incCategory          income category use for income-source accounts
 *     traCategory          transfer category
 *
 *  BalanceHistory Model
 *     account
 *     date
 *     amount
 *
 * RateFuture Model
 *     account
 *     date
 *     rate
 *
 * Institutions Model
 *     name
 *     importColumns (column number for each of the following)
 *         account
 *         date
 *         payee
 *         description
 *         amount
 *         debit
 *         credit
 */

class AccountsModel extends Observable {
  constructor (budgetModel) {
    super();
    this._budgetModel = budgetModel;
    this._model = new Model ('accounts');
    this._model .addObserver (this, this._onModelChange);
    this._tranModel = new TransactionModel();
    this._tranModel .observe ();
    this._tranModel .addObserver (this, this._onTranModelChange);
    this._balanceHistoryModel  = new Model ('balanceHistory');
    this._balanceHistoryModel .addObserver (this, this._onBalanceHistoryModelChange);
    this._rateFutureModel = new Model ('rateFuture');
    this._rateFutureModel .addObserver (this, this._onRateFutureModelChange);
    this._taxParametersModel = new Model ('taxParameters');
    this._taxParametersModel .addObserver (this, this._onTaxParametersModelChange);
    this._domParser = new DOMParser();
    this._budgetObserver = this._budgetModel .addObserver (this, this._onBudgetModelChange);
    this._preferencesObserver = PreferencesInstance .addObserver (this, this._onPreferencesModelChange);
  }

  delete() {
    this._model               .delete();
    this._tranModel           .delete();
    this._balanceHistoryModel .delete();
    this._rateFutureModel     .delete();
    this._taxParametersModel  .delete();
    this._budgetModel .deleteObserver (this._budgetObserver);
    PreferencesInstance .deleteObserver (this._preferencesObserver);
    if (this._actualsObserver)
      this._actualsModel .deleteObserver (this._actualsObserver);
  }

  async _onModelChange (eventType, doc, arg) {
    if (eventType == ModelEvent .UPDATE) {
      let account = this .getAccount (doc._id);
      for (let f of Object .keys (arg))
        if (! f .startsWith ('_'))
          account [f] = arg [f];
      let schModel = this._budgetModel .getSchedulesModel();
      if (account .isLiabilityAccount() && account .intCategory && arg .category !== undefined)
        await schModel .update (account .intCategory, {name: account .name + (arg .category? ' Interest': '')})
      else if (account .isPrincipalInterestLiabilityAccount() && arg .creditBalance !== undefined )
        await schModel .update (account .intCategory, {name: account .name + (arg .creditBalance? '': ' Interest')});
    } else
      await this._updateModel();
    this._balanceCacheConsistencyCheck ('accounts', eventType, doc, arg);
  }

  async _onBalanceHistoryModelChange (eventType, doc, arg) {
    await this._updateBalanceHistoryModel();
    this._notifyObservers (eventType, doc, arg);
    this._balanceCacheConsistencyCheck ('balanceHistory', eventType, doc, arg);
  }

  async _onRateFutureModelChange (eventType, doc, arg) {
    await this._updateRateFutureModel();
    this._notifyObservers (eventType, doc, arg);
    this._balanceCacheConsistencyCheck ('accounts', eventType, doc, arg);
  }

  async _onTaxParametersModelChange (eventType, doc, arg) {
    await this._updateTaxParametersModel();
    this._notifyObservers (eventType, doc, arg);
    this._balanceCacheConsistencyCheck ('accounts', eventType, doc, arg);
  }

  _onActualsModelChange (eventType, doc, arg, source) {
    this._balanceCacheConsistencyCheck ('actuals', eventType, doc, arg);
  }

  _onBudgetModelChange (eventType, doc, arg, source) {
    this._balanceCacheConsistencyCheck ('budget', eventType, doc, arg);
  }

  _onPreferencesModelChange (eventType, doc, arg, source) {
    this._balanceCacheConsistencyCheck ('preferences', eventType, doc, arg);
  }

  _balanceCacheConsistencyCheck (modelName, eventType, doc, arg) {
    for (let account of this._accounts || []) {
      let cc = account._balanceCacheConsistencyCheck (modelName, eventType, doc, arg);
      if (cc)
        this._notifyObservers (cc .eventType, cc .doc, cc .arg);
    }
  }

  _balanceHistoryForAccount (a) {
    return this._balanceHistory && this._balanceHistory
      .filter (b => {return b .account == a._id})
      .map    (b => {return {date: b .date, amount: b .amount * (a .creditBalance? 1: -1)}})
  }

  _rateFutureForAccount (a) {
    return this._rateFuture && this._rateFuture
      .filter (r => {return r .account == a._id});
  }

  _taxParametersForAccount (a) {
    return this._taxParameters && this._taxParameters
      .filter (p => {return p .account == a._id});
  }

  async _updateModel() {
    const accounts = await this._model .find();

    // ROBUSTNESS Each form need at least one group
    const formsWithNoGroup = AccountForms .filter (f => ! accounts .find (a => a .form == f && a .type == AccountType .GROUP));
    if (formsWithNoGroup .length) {
      accounts .push (... await this._model .insertList (formsWithNoGroup .map (f => ({
        name: 'Default Group',
        type: AccountType .GROUP,
        form: f,
        sort: 1
      }))))
    }

    this._accounts = accounts .map (a => {
      return new Account (this, a, this._budgetModel, this._actualsModel, this._balanceHistoryForAccount (a), this._rateFutureForAccount (a));
    });

    await this._updateBalanceHistoryModel();
    await this._updateRateFutureModel();
    await this._updateTaxParametersModel();
  }

  async _updateBalanceHistoryModel() {
    this._balanceHistory = (await this._balanceHistoryModel .find ())
      .filter (h     => {return h .date})
      .map    (h     => {h .amount = h .amount || 0; return h;})
      .sort   ((a,b) => {return a .date < b .date? -1: a .date == b .date? 0: 1});
    if (this._accounts)
      for (let account of this._accounts)
        account .setBalanceHistory (this._balanceHistoryForAccount (account));
  }

  async _updateRateFutureModel() {
    this._rateFuture = (await this._rateFutureModel .find())
      .sort ((a,b) => {return a .date < b .date? 1: a .date == b .date? 0: -1})
    if (this._accounts)
      for (let account of this._accounts)
        account .setRateFuture (this._rateFutureForAccount (account));
  }

  async _updateTaxParametersModel() {
    this._taxParameters = (await this._taxParametersModel .find())
      .sort ((a,b) => {return a .date < b .date? 1: a .date == b .date? 0: -1});
    if (this._accounts)
      for (let account of this._accounts)
        account .setTaxParameters (this._taxParametersForAccount (account));
  }

  async _onTranModelChange (eventType, doc, arg, source) {
    if (doc .account) {
      let acc  = this._accounts .find (a => {return a._id == doc .account});
      if (acc.balance === undefined)
        acc.balance = 0;
      if (acc) {
        let sign = acc .creditBalance? -1: 1;
        switch (eventType) {
          case ModelEvent .UPDATE:
            if (arg .debit != null)
              acc .balance += (arg .debit  - (arg._original_debit || 0)) * sign;
            if (arg .credit != null)
              acc .balance -= (arg .credit - (arg._original_credit || 0)) * sign;
            if (arg .account != null) {
              acc .balance += ((doc .debit || 0) - (doc .credit || 0)) * sign;
              var pacc = this._accounts .find (a => {return a._id == arg ._original_account});
              if (pacc) {
                pacc .balance -= ((doc .debit || 0) - (doc .credit || 0)) * sign;
                await this._notifyObserversAsync (ModelEvent .UPDATE, pacc, {balance: pacc .balance});
                await this._model._notifyObserversAsync (ModelEvent .UPDATE, pacc, {balance: pacc .balance});
              }
            }
            break;
          case ModelEvent .INSERT:
            acc .balance += ((doc .debit || 0) - (doc .credit || 0)) * sign;
            break;
          case ModelEvent .REMOVE:
            acc .balance -= ((doc .debit || 0) - (doc .credit || 0)) * sign;
            break;
        }
        await this._notifyObserversAsync (ModelEvent .UPDATE, acc, {balance: acc .balance});
        await this._model._notifyObserversAsync (ModelEvent .UPDATE, acc, {balance: acc .balance});
      }
    }
    let acc = null;
    for (let cid of [doc .category, arg && arg._original_category]) {
      if (cid) {
        let cat = this._budgetModel .getCategories() .get (cid);
        if (cat .account) {
          let a = this._accounts .find (a => {return a._id == cat .account});
          if (a .category && a .intCategory && [a .category, a .intCategory, a .disCategory, a .traCategory] .includes (cid)) {
            acc = a;
            break;
          }
        }
      }
    }
    if (acc)
      await acc .handleTransaction (eventType, doc, arg);
  }

  _smartLowerCase (s) {
    var allCaps      = [
      'UBC', 'CA', 'BC', 'AB', 'WWW', 'DDA', 'IDP', 'IBC', 'DCGI', 'ICBC', 'IGA', 'SA', 'RBC', 'NY',
      'EI', 'UNA', 'PAP', 'EB', 'US', 'USA', 'WA', 'ICBC'
    ];
    var allCapsAtEnd = ['ON','DE','IN','TO'];
    var noCaps       = ['e', 'a', 'is', 'in', 'to', 'for', 'the', 'de', 'on', 'of', 'by'];
    s = this._domParser .parseFromString ('<!doctype html><body>' + s, 'text/html') .body .textContent;
    var words = s .split (' ') .map (s => {return s .trim()});
    for (let i = 0; i < words .length; i++) {
      if (! allCaps .includes (words [i]) && (i != words .length -1 || ! allCapsAtEnd .includes (words [i])))
        words [i] = words [i] .toLowerCase();
      if (! noCaps .includes (words [i]) && words [i] .length)
        words [i] = words [i][0] .toUpperCase() + words [i] .slice (1);
      for (let p of ['.','&','-']) {
        let subwords = words [i] .split (p);
        for (let j = 0; j < subwords .length; j++)
          if (subwords [j] .length)
            subwords [j] = subwords [j][0] .toUpperCase() + subwords [j] .slice (1);
        words [i] = subwords .join (p);
      }
    }
    return words .join (' ');
  }

  setActualsModel (actualsModel) {
    if (this._actualsObserver && this._actualsModel)
      this._actualsModel .deleteObserver (this._actualsObserver);
    this._actualsModel = actualsModel;
    this._actualsObserver = this._actualsModel .addObserver (this, this._onActualsModelChange);
  }

  /**
   * parse transactions from input file
   */
  parseTransactions (data) {
    const transactions     = [];
    const cashFlowAccounts = this._accounts .filter (a => a .form == AccountForm .CASH_FLOW && a .type == AccountType .ACCOUNT);
    for (const item of data)
      processItem: for (const account of cashFlowAccounts)
        if (account .importColumns && account .importColumns .date !== undefined && account .importColumns .payee !== undefined)
          if (account .number && account .number == item [account .importColumns .account]) {
            const tran = Object .entries (account .importColumns) .reduce ((o, [field, column]) =>  Object .assign (o, {[field]: item [column]}), {});
            delete tran .account;
            if (tran .amount !== undefined) {
              tran .debit  = tran .amount < 0? -tran .amount: 0;
              tran .credit = tran .amount > 0? tran .amount: 0;
              delete tran .amount;
            }
            tran .date        = Types .dateMDY .fromString (tran .date);
            tran .payee       = this._smartLowerCase ((tran .payee || '') .trim());
            tran .debit       = Types .moneyDC .fromString (String (tran .debit || 0));
            tran .credit      = Types .moneyDC .fromString (String (tran .credit || 0));
            tran .account     = account._id;
            tran .description = this._smartLowerCase ((tran .description || '') .trim());
            tran .category    = undefined;
            transactions .push (tran);
            break processItem;
          }
    return transactions;
  }

  getAccounts() {
    return this._accounts;
  }

  getCashFlowBalance() {
    return this._accounts
      .filter (a => {return a .isCashFlowAccount()})
      .reduce ((b, a) => {return b + (a .balance || 0) * (a .creditBalance? 1: -1)}, 0)
  }

  async find() {
    await this._updateModel();
  }

  getModel() {
    return this._model;
  }

  getToolTip (aid, cat) {
    let account = this .getAccount (aid);
    if (account)
      return account .getToolTip (cat);
    return '';
  }

  getAccount (aid) {
    return this._accounts && this._accounts .find (a => {return a._id == aid});
  }
}


/**
 *
 * Account
 */

class Account {
  constructor (model, modelData, budgetModel, actualsModel, balanceHistory, rateFuture) {
    this._model            = model;
    this._budget           = budgetModel;
    this._actuals          = actualsModel;
    this._balanceHistory   = balanceHistory;
    this._rateFuture       = rateFuture;
    this._balances         = [];
    for (let p of Object .keys (modelData))
      this [p] = modelData [p];
  }

  isCashFlowAccount() {
    return this .type == AccountType .ACCOUNT && this .form == AccountForm .CASH_FLOW;
  }

  isAssetAccount() {
    return this .type == AccountType .ACCOUNT && this .form == AccountForm .ASSET_LIABILITY && this .creditBalance;
  }

  isLiabilityAccount() {
    return this .type == AccountType .ACCOUNT && this .form == AccountForm .ASSET_LIABILITY && ! this .creditBalance;
  }

  isPrincipalInterestLiabilityAccount() {
    return this .isLiabilityAccount() && this .intCategory && this .category;
  }

  _balanceCacheConsistencyCheck (modelName, eventType, doc, arg) {
    let getDescendants = cl => {
      let children = cl .reduce ((l,c) => {return l .concat (c .children || [])}, []);
      return children .length? children .concat (getDescendants (children)): [];
    }
    let getAncestors = cl => {
      let parents = cl .reduce ((l,c) => {return l .concat (c .parent || [])}, []);
      return parents .length? parents .concat (getAncestors (parents)): [];
    }
    let getFamily = cl => {
      return getAncestors (cl) .concat (cl) .concat (getDescendants (cl))
    }
    switch (modelName) {
      case 'balanceHistory':
        if (doc .account == this._id)
          this._invalidateBalanceCache();
        break;
      case 'accounts':
        if (doc._id == this._id)
          this._invalidateBalanceCache();
        break;
      case 'preferences':
        if (arg .apr !== undefined || arg .inflation !== undefined || arg .presentValue !== undefined)
          this._invalidateBalanceCache();
        break;
      case 'budget':
      case 'actuals':
        let possibleAffectedCats = getFamily (
          [this .category, this .intCategory, this .disCategory, this .traCategory]
            .filter (cid => {return cid})
            .map    (cid => {return this._budget .getCategories() .get (cid)})
        );
        let isAffected = possibleAffectedCats .find (c => {
          return [doc .category, arg && arg .category, arg && arg._original_category] .includes (c._id);
        })
        if (isAffected)
          this._invalidateBalanceCache();
        break;
    }
  }

  _invalidateBalanceCache() {
    this._balances = [];
    for (let cid of [this .category, this .intCategory, this .disCategory, this .incCategory, this .traCategory])
      if (cid)
        this._model._notifyObservers (AccountsModelEvent .CATEGORY_CHANGE, {
          id: cid
        });
    this._model._notifyObservers (AccountsModelEvent .BALANCE_CHANGE, {
      id: this._id
    });
  }

  setBalanceHistory (balanceHistory) {
    this._balanceHistory = balanceHistory;
  }

  setRateFuture (rateFuture) {
    this._rateFuture = rateFuture;
  }

  setTaxParameters (taxParameters) {
    this._taxParameters = taxParameters;
  }

  async handleTransaction (eventType, tran, update) {
    if (this. isPrincipalInterestLiabilityAccount()) {
      let categories = [this .category, this .intCategory];
      if (categories .includes (tran .category) || (update && categories .includes (update._original_category))) {
        let tranAmount = - ((tran .debit || 0) - (tran .credit || 0));
        let delta = 0, origDelta = 0;
        if (eventType == ModelEvent .REMOVE || eventType == ModelEvent .INSERT)
          delta = (eventType == ModelEvent .REMOVE? -1: 1) * tranAmount;
        else if (eventType == ModelEvent .UPDATE) {
          if (update .debit !== undefined) {
            let amt = -(update .debit - (update._original_debit || 0));
            if (update .category === undefined)
              delta += amt;
            else
              origDelta += amt;
          }
          if (update .credit !== undefined) {
            let amt = update .credit - (update._original_credit || 0);
            if (update .category === undefined)
              delta += amt;
            else
              origDelta += amt;
          }
          if (update .category !== undefined) {
            delta     += categories .includes (tran .category)? tranAmount: 0;
            origDelta -= categories .includes (update._original_category)? tranAmount: 0;
          }
        }
        if (tran .date > this .balanceDate || delta || origDelta) {
          let balanceDelta  = (tran .category == this .category? delta: 0)    + (update && update._original_category == this .category? origDelta: 0);
          let interestDelta = (tran .category == this .intCategory? delta: 0) + (update && update._original_category == this .intCategory? origDelta: 0);
          if (tran .date > this .balanceDate)
            interestDelta += this._getInterest (this .balance || 0, tran .date, Types .date .subDays (tran .date, this .balanceDate));
          await this._model._model .update (this._id, {
            balance:         (this .balance || 0)         + balanceDelta,
            accruedInterest: (this .accruedInterest || 0) + interestDelta,
            balanceDate:     Math .max (tran .date, this .balanceDate)
          })
        }
      }
    }
  }

  /**
   *
   * get interest of balance for specified number of days
   */
  _getInterest (balance, date, days) {
    let rate = this._rateFuture && this._rateFuture .find (r => {return r .date && date >= r .date});
    if (rate != null)
      rate = rate .rate;
    else if (this .apr != null)
      rate = this .apr;
    else
      rate = PreferencesInstance .get() .apr;
    switch (this .rateType || 0) {
      case RateType .SIMPLE:
        rate =  rate / 3650000;
        break;
      case RateType .CANADIAN_MORTGAGE:
        rate = Math .pow (1 + rate / 2.0 / 10000.0, 2);
        let ppy = PAYMENTS_PER_YEAR [this .paymentFrequency || 0];
        rate = (Math .pow (rate, (1.0 / ppy)) - 1) * ppy / 365;
        break;
    }
    return Math .round (balance * rate * days);
  }

  getInterestDue (date) {
    if (this .isPrincipalInterestLiabilityAccount()) {
      let calcInterest = (date > this .balanceDate)? this._getInterest (this .balance, date, Types .date .subDays (date, this .balanceDate)): 0;
      return calcInterest + (this .accruedInterest || 0);
    } else
      return 0;
  }

  /**
   * Get budget amount for cat between start and end where amount is the normal scheduled amount for this period
   *    - asset: amount is net (before-tax) amount
   *    - liability: amount is payment full payment amount
   *       - cat == account .category: return principal portion of amount
   *       - cat == intCategory and account .category != null: return interest portion of amount
   *    - income source:
   *        - if cat == incCategory && ! intCategory; return net after tax amount
   *        - if cat == intCateogry; return tax amount
   * returns [budgetAmount, accountAmount] pair
   *    - accountAmount is normally undefined, but for taxable asset, it is the gross amount
   */
  getAmount (cat, start, end, amount) {
    end = Types .date .monthEnd (end);

    if (this .isPrincipalInterestLiabilityAccount() && [this .category, this .intCategory] .includes (cat._id)) {
      let st  = Types .date .monthStart (Types .date .addMonthStart (end, -1));
      let en  = Types .date .monthEnd   (st);
      let bal = this .getBalance  (st, en);
      let int = Math .max (0, this._getInterest (bal .amount, start, Types .date .subDays (end, start) + 1) * (this .creditBalance? 1: -1));
      if (cat._id == this .intCategory)
        return Math .min (amount, int);
      else {
        let pri = this._budget .getAmount (this._budget .getCategories() .get (this .intCategory), start, end, true);
        amount += Math .max (0, (pri .month? pri .month .amount: 0) + (pri .year? pri .year .amount / 12 * (Types .date._difMonths (end, start)): 0));
        return Math .max (0, amount - int);
      }

    } else if (this .form == AccountForm .INCOME_SOURCE)
      return -this._getIncomeSourceAmount (cat, start, end, -amount);

    else
      return amount;
  }

  getGrossAmount (cat, start, end, amount) {
    if (this .form == AccountForm .ASSET_LIABILITY && this .creditBalance && this .disTaxRate) {
      let taxRate = this .disTaxRate / 10000.0;
      let lastMonth = Types .date .addMonthStart (start, -1);
      if (this .taxDeferred)
        return Math .round (amount / ((1.0 - taxRate)));
      else {
        let bal = (this .creditBalance? -1: 1) * this .getBalance (lastMonth, Types .date .monthEnd (lastMonth)) .amount;
        return amount + Math .round (this._getInterest (bal, start, Types .date .subDays (end, start) + 1)) * taxRate;
      }
    }
}

  /**
   * Get income-source amount
   */
  _getIncomeSourceAmount (cat, start, end, amount) {
    if (this .form == AccountForm .INCOME_SOURCE) {

      if (this .taxType == AccountsTaxType .PERCENTAGE) {
        if (cat._id == this .incCategory && ! this .intCategory)
          amount = Math .round (amount * (1 - this .taxRate / 10000.0));
        else if (this .incCategory && this .intCategory && cat._id == this .intCategory) {
          let inc = this._budget .getAmount (this._budget .getCategories() .get (this .incCategory), start, end, true);
          amount -= (inc .month? inc .month .amount: 0) + (inc .year? inc .year .amount / 12 * (Types .date._difMonths (end, start)): 0);
          amount = Math .round (amount * (this .taxRate / 10000.0));
        }
      }

      if (this .taxType == AccountsTaxType .TABLE) {
        if (cat._id == this .intCategory) {
          let pri = this._budget .getAmount (this._budget .getCategories() .get (this .incCategory), start, end, true);
          amount -= (pri .month? pri .month .amount: 0) + (pri .year? pri .year .amount / 12 * (Types .date._difMonths (end, start)): 0);
        }
        let deduction = 0;
        let multiMonth = Types .date._difMonths (end, start) > 1;
        let monthAmount = amount;
        for (let dt = start; dt <= Types .date .monthStart (end); dt = Types .date .addMonthStart (dt, 1)) {
          if (multiMonth) {
            let mon = this._budget .getAmount (cat, dt, Types .date .monthEnd (dt), true);
            monthAmount = -((mon .month? mon .month .amount: 0) + (mon .year? mon .year .amount / 12: 0));
          }
          deduction += this._calcMonthDeduction (dt, monthAmount);
        }
        if (cat._id == this .incCategory && ! this .intCategory)
          amount -= deduction;
        else if (this .incCategory && this .intCategory && cat._id == this .intCategory)
          amount = -deduction;
      }
    }

    return amount;
  }

  _calcMonthDeduction (date, amount) {
    let taxTable = TAX_TABLES .find (t => {return t._id == this .taxTable});
    if (taxTable) {
      let year = Types .date._year (date);
      let tbl = taxTable .years .find (t => {return t .year <= year}) || taxTable .years .slice (-1) [0];
      let par = this._taxParameters .find (p => {return date >= (p .date || 0)});
      if (par) {
        let annualTaxableIncome = (amount - par .beforeTaxDeductions + par .taxableBenefits) * 12;
        let cppEarnings         = amount + par .taxableBenefits;
        if (annualTaxableIncome > 0) {

          let ps = Types .date .getYearStart  (date);
          let pe = Types .date .addMonthStart (date, -1);
          let pm = Types .date._difMonths (pe, ps);
          let pc = this._budget .getCategories() .get (this .incCategory);
          let pa = pe >= ps? this._budget .getAmount (pc, ps, Types .date .monthEnd (pe), true): {};
          let priorAmount = -(pa .month? pa .month .amount: 0) + (pa .year? pa .year .amount: 0) / 12 * pm + par .taxableBenefits * pm;

          let cppPaid = Math .min (tbl .cpp[1], (priorAmount - tbl .cpp[0] /12) * tbl .cpp[2]);
          let eiPaid  = Math .min (tbl .ei[0],  priorAmount * tbl .ei[1]);
          let cpp = Math .min (tbl .cpp[1] - cppPaid, (cppEarnings - tbl .cpp[0] / 12) * tbl .cpp [2]);
          let ei  = Math .min (tbl .ei[0] - eiPaid,   amount * tbl .ei [1]);
          let annualizedCppEi = tbl .cpp[1] + tbl .ei[0];

          let [f, fedRate, fedConst] = tbl .federalRates .find (r => {return annualTaxableIncome >= r[0]});
          let fedCredits = (par .federalClaim + annualizedCppEi + tbl .federalEmploymentCredit) * tbl .federalRates .slice (-1) [0][1];
          let fedTax = annualTaxableIncome * fedRate - fedConst - fedCredits;

          let [p, proRate, proConst] = tbl .provincialRates .find (r => {return annualTaxableIncome >= r[0]});
          let proCredits = (par .provincialClaim + annualizedCppEi) * tbl .provincialRates .slice (-1) [0][1];
          let proTax = annualTaxableIncome * proRate - proConst - proCredits;

          return Math .round ((fedTax + proTax) / 12 + cpp + ei + par .beforeTaxDeductions + par .afterTaxDeductions);
        }
      }
    }
    return 0;
  }

  /**
   * Returns account balance on last day of specified month
   */
  getBalance (startDate, endDate) {

    /*** helper functions ***/

    // get balance for specified date from list of balances
    let getHistoryBalance = date => {
      let getAmountFromInterval = (st, en, date) => {
        if (en .date == st .date)
          return en .amount;
        let slope = (en .amount - st .amount) / Types .date .subDays (en .date, st .date);
        return Math .round (st .amount + slope * Types .date .subDays (date, st .date));
      }
      if (this._balanceHistory .length == 1)
        return this._balanceHistory [0] .amount;
      let upi = this._balanceHistory .findIndex (h => {return date <= h .date });
      if (upi == -1)
        return getAmountFromInterval (this._balanceHistory [this._balanceHistory .length - 2], this._balanceHistory [this._balanceHistory .length - 1], date);
      else if (this._balanceHistory [upi] .date == date)
        return this._balanceHistory [upi] .amount;
      else if (upi == 0)
        return 0;
      else
        return getAmountFromInterval (this._balanceHistory [upi - 1], this._balanceHistory [upi], date);
    }

    // get actual amount (up/down) for category
    // allocates up-stream amounts evenly to account children
    let getAmount = (cat, start, end, get, getRecursively) => {
      let getAmountUp = (cat, child) => {
        if (cat) {
          let amt = get (cat, start, end) + getAmountUp (cat .parent, cat);
          let nas = (cat .children || []) .concat (cat .zombies || []) .filter (c => {return c .account || c._id == child._id}) .length;
          return Math .round (amt / nas);
        } else
          return 0;
      }
      return getRecursively (cat, start, end) + getAmountUp (cat .parent, cat);
    }
    let getActual = (cat, start, end, recursive = true) => {return getAmount (cat, start, end,
      (c,s,e) => {return this._actuals .getAmount (c,s,e)},
      (c,s,e) => {return recursive? this._actuals .getAmountRecursively (c,s,e): 0}
    )}
    let getBudgetMonth = (cat, start, end) => {return getAmount (cat, start, end,
      (c,s,e) => {return (this._budget .getIndividualAmount(c,s,e) .month || {}) .amount || 0},
      (c,s,e) => {return (this._budget .getAmount (c,s,e) .month || {}) .amount || 0}
    )}
    let getBudgetYear = (cat, start, end) => {return getAmount (cat, start, end,
      (c,s,e) => {return (this._budget .getIndividualAmount(c,s,e) .year || {}) .amount || 0},
      (c,s,e) => {return (this._budget .getAmount (c,s,e) .year || {}) .amount || 0}
    )}
    let getBudget = (cat, start, end, yearlyProRata) => {
      let yr = getBudgetYear (cat, start, end);
      if (yr && end <= this._budget .getEndDate()) {
        // reduce yearly budget by any yearly actuals before start
        let ds = this._budget .getStartDate();
        let de = Types .date .monthEnd (Types .date .addMonthStart (end, -1));
        yr -= this._actuals .getAmountRecursively (cat, ds, de, undefined, false, true);  // remove all year actual amounts
        yr = Math .max (0, yr);
      }
      return getBudgetMonth (cat, start, end) + Math .round (yr / yearlyProRata);
    }

    /*** getBalance body ***/

    let addCat = this .category    && this._budget .getCategories() .get (this .category);
    let subCat = this .disCategory && this._budget .getCategories() .get (this .disCategory);
    let intCat = this .intCategory && this._budget .getCategories() .get (this .intCategory);
    let traCat = this .traCategory && this._budget .getCategories() .get (this .traCategory);
    let baseDate = Types .date .monthEnd (endDate);
    if (baseDate != endDate)
      baseDate = Types .date .monthEnd (Types .date .addMonthStart(endDate, -1));
    let curMonthEnd = Types .date .monthEnd (Types .date .today());
    let sign        = this .creditBalance? 1: -1;

    let balanceEntry = this._balances .find (b => {return b .date == baseDate});

    if (balanceEntry == null && (this._balances .length == 0 || baseDate > this._balances .slice (-1) [0] .date)) {

      // determine where we need to start
      let mStart, balance;
      if (this._balances .length) {
        let b = this._balances .slice (-1) [0];
        mStart  = Types .date .addMonthStart (b .date, 1);
        balance = b .balance;
      } else if (this._balanceHistory .length) {
        mStart  = Types .date .addMonthStart (this._balanceHistory [0] .date, -1);
        balance = 0;
      } else {
        mStart  = Types .date .monthStart (this._balanceDate || Types .date .today());
        balance = 0;
      }
      let adjustStartForActuals = cat => {
        if (cat) {
          let activePeriod = this._actuals .getActivePeriod (cat);
          if (! activePeriod .none)
            mStart = Math .min (mStart, activePeriod .start);
          adjustStartForActuals (cat .parent);
        }
      }
      if (this._balances .length == 0)
        [addCat, subCat, intCat] .forEach (cat => {adjustStartForActuals (cat)});

      // compute balance for every missing month up to current date
      let budgetEndDate       = this._budget .getEndDate();
      let monthsLeftInCurYear = Types .date._difMonths (budgetEndDate, curMonthEnd);
      while (mStart <= baseDate) {
        let mEnd = Types .date .monthEnd (mStart);
        let add, sub, int, inf=0;

        if (mEnd < curMonthEnd) {
          // use actuals for prior periods
          int = - (intCat? getActual (intCat, mStart, mEnd): 0);
          add = (addCat? getActual (addCat, mStart, mEnd): 0) - int;
          sub = subCat? getActual (subCat, mStart, mEnd): 0;
          if (this .balance != null && mEnd == Types .date .monthEnd (this .balanceDate)) {
            let actToBal = (addCat? getActual (addCat, mStart, this .balanceDate): 0) + (subCat? getActual (subCat, mStart, this .balanceDate): 0);
            int = this .balance * sign - (balance + actToBal) + this._getInterest (this .balance * sign, this .balanceDate, Types .date .subDays (mEnd, this .balanceDate));
          } else  if (this._balanceHistory .length && mEnd <= this._balanceHistory .slice (-1) [0] .date)
            int = getHistoryBalance (mEnd) - balance - add - sub;
          else
            int = this._getInterest (balance, mStart, Types .date .subDays (mEnd, mStart) + 1)

        } else {
          // use plan for current and future periods
          let yearlyProRata = mStart <= budgetEndDate? monthsLeftInCurYear : 12;
          add = (addCat? getBudget (addCat, mStart, mEnd, yearlyProRata): 0) + (intCat? getBudget (intCat, mStart, mEnd, yearlyProRata): 0);
          sub = subCat? getBudget (subCat, mStart, mEnd, yearlyProRata): 0;
          let tra = traCat? getBudget (traCat, mStart, mEnd, yearlyProRata): 0;
          if (tra > 0)
            add += tra;
          else
            sub += tra;
          let days = Types .date .subDays (mEnd, mStart) + 1;
          int = this._getInterest (balance, mStart, days);
          if (this .balance != null && mEnd == Types .date .monthEnd (this .balanceDate || Types .date .today())) {
            let curMonthStart = Types .date .monthStart (curMonthEnd);
            let balDate = this .balanceDate || Types .date .today();
            let actToBal = (addCat? getActual (addCat, curMonthStart, balDate): 0)
              - (intCat? getActual (intCat, curMonthStart, balDate): 0)
              + (subCat? getActual (subCat, curMonthStart, balDate): 0);
            int = this .balance * sign - (balance + actToBal);
          }
          if (PreferencesInstance .get() .presentValue && mEnd != curMonthEnd)
            inf = - balance * PreferencesInstance .get() .inflation / 3650000  * days;
        }
        if (sub && this .disTaxRate) {
          if (this .taxDeferred)
            sub /= (1.0 - this .disTaxRate / 10000.0)
          else
            sub -= int * this .disTaxRate / 10000.0;
        }
        balance += add + sub + int + inf;
        this._balances .push ({
          date:    mEnd,
          balance: balance,
          add:     add,
          sub:     sub,
          int:     int,
          inf:     inf
        })
        mStart = Types .date .addMonthStart (mStart, 1);
      }

      balanceEntry = this._balances .find (b => {return b .date == baseDate});
    }

    let int = 0, add = 0, sub = 0, inf = 0;
    for (let bal of this._balances)
      if (bal .date >= startDate && bal .date <= endDate) {
        int += bal .int;
        add += bal .add;
        sub += bal .sub;
        inf += bal .inf;
      }

    if (endDate != baseDate) {
      let st = Types .date .monthStart (startDate);
      int += intCat? getActual (intCat, st, endDate): 0;
      add += addCat? getActual (addCat, st, endDate): 0;
      sub += subCat? getActual (subCat, st, endDate): 0;
    }

    return {
      amount: balanceEntry? balanceEntry .balance: 0,
      detail: {
        intAmt: int,
        infAmt: inf,
        addAmt: add,
        subAmt: sub,
        id:     this._id,
        addCat: addCat,
        subCat: subCat,
        intCat: intCat
      }
    };
  }

  getBalances (dates) {
    let bs       = this._budget .getStartDate();
    let be       = this._budget .getEndDate();
    let balances = dates .map (d => {return this .getBalance (Types .dateFY .getFYStart (d, bs, be), Types .dateFY .getFYEnd (d, bs , be))});
    return {
      curBal:      this .balance * (this .creditBalance? 1: -1),
      liquid:      this .liquid,
      amounts:     balances .map (d => {return d && d .amount}),
      detail:      balances .map (d => {return d && d .detail}),
      isLiability: this .type == AccountType .ACCOUNT && this .form == AccountForm .ASSET_LIABILITY && ! this .creditBalance
    }
  }

  static getZeroBalances (dates) {
    return {
      curBal:  0,
      liquid:  true,
      amounts: dates .map (() => {return 0}),
      detail:  dates .map (() => {return {}})
    }
  }

  getToolTip (cat) {
    let tip = 'ACCOUNT: ' + this .name;
    if (this .form == AccountForm .INCOME_SOURCE) {
      if (cat._id == this .incCategory) {
        if (! this .intCategory)
          tip += ' Net Income &mdash; Calculated from <b><em>gross income</em></b> entered here'
        else
          tip += ' Gross Income'
      } else {
        let incCat = this .incCategory && this._budget .getCategories() .get (this .incCategory);
        tip += ' Income Tax and Deductions &mdash; Calculated from ' + (incCat? ' entered under ' + incCat .name: ' entered elsewhere');
      }
    } else if (this .creditBalance) {
      if (cat._id == this .category)
        tip += ' Contributions';
      else if (cat._id == this .traCategory)
        tip += ' Transfers';
      else {
        tip += ' Withdrawals';
        if (this .disTaxRate)
          tip += ' After Tax';
      }
    } else {
      let intCat = this .intCategory && this._budget .getCategories() .get (this .intCategory);
      if (cat._id == this .category)
        tip += ' Principal &mdash; Calculated from payments' + (intCat? ' entered under ' + intCat .name : ' entered elsewhere');
      else if (cat._id == this .intCategory)
        tip += this .category? ' Interest &mdash; Calculated from <b><em>total</em></b> payments (interest and principal) entered here': ' Payments'
      else
        tip += ' Advances';
    }
    return tip;
  }

  getCategoryName (cid) {
    let name = this .name;
    if (this .isPrincipalInterestLiabilityAccount()) {
      if (cid == this .intCategory)
        name += ' Interest'
      else if (cid == this .category)
        name += ' Principal'
      else if (cid == this .traCategory)
        name += ' Transfers'
    } else if (this .form == AccountForm .INCOME_SOURCE && cid == this .intCategory)
      name += ' Taxes'
    return name;
  }
}

const AccountType = {
  GROUP:   0,
  ACCOUNT: 1
}

const AccountForm = {
  CASH_FLOW:       0,
  ASSET_LIABILITY: 1,
  INCOME_SOURCE:   2
}

const AccountForms = [AccountForm .CASH_FLOW, AccountForm .ASSET_LIABILITY, AccountForm .INCOME_SOURCE];

const RateType = {
  SIMPLE: 0,
  CANADIAN_MORTGAGE: 1
}

const AccountsModelEvent = {
  BALANCE_CHANGE:  500,
  CATEGORY_CHANGE: 501
}

const PaymentFrequency = {
  MONTHLY: 0,
  SEMI_MONTHLY: 1,
  BI_WEEKLY: 2,
  WEEKLY: 3
}

const PAYMENTS_PER_YEAR = [12, 24, 365.0 / 14, 365.0 / 7]

const AccountsTaxType = {
  NONE:       0,
  PERCENTAGE: 1,
  TABLE:      2
}
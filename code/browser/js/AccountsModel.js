/**
 * Accounts Model
 *     name
 *     type                 AccountType; GROUP or ACCOUNT
 *     cashFlow             true if account is used for cashflow for transactions
 *     sort
 *  ACCOUNT only:
 *     group                account id of group
 *     number               bank number used to match transactions when importing
 *     balance              $
 *     balanceDate          effective date of account balance (today if null or undefined)
 *     creditBalance        true if credit increases balance (chequing); false if decreases (visa)
 *     apr                  annual interest rate or null to use default rate
 *  Liability only:
 *     rateType             type of rate calculation (e.g., simple interest or canadian mortgage)
 *  Cash-Flow only:
 *     pendingTransactions  []
 *  Non Cash-Flow only:
 *     liquid               true iff liquid asset / liability
 *     category             savings: asset contribution or liability principal
 *     disCategory          withdrawal if asset or liability (disbursement or loan add-on)
 *     intCategory          expense; only for liabilities (entire payment or just interest part, depending)
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
    this._domParser = new DOMParser();
    this._budgetObserver = this._budgetModel .addObserver (this, this._onBudgetModelChange);
    this._preferencesObserver = PreferencesInstance .addObserver (this, this._onPreferencesModelChange);

  }

  delete() {
    this._model               .delete();
    this._tranModel           .delete();
    this._balanceHistoryModel .delete();
    this._rateFutureModel     .delete();
    this._budgetModel .removeObserver (this._budgetObserver);
    PreferencesInstance .removeObserver (this._preferencesObserver);
    if (this._actualsObserver)
      this._actualsModel .removeObserver (this._actualsObserver);
  }

  async _onModelChange (eventType, doc, arg) {
    await this._updateModel();
    this._balanceCacheConsistencyCheck ('accounts', eventType, doc, arg);
  }

  async _onBalanceHistoryModelChange (eventType, doc, arg) {
    await this._updateBalanceHistoryModel();
    this._notifyObservers (eventType, doc, arg);
    this._balanceCacheConsistencyCheck ('accounts', eventType, doc, arg);
  }

  async _onRateFutureModelChange (eventType, doc, arg) {
    await this._updateRateFutureModel();
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
    for (let account of this._accounts) {
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

  async _updateModel() {
    this._accounts = (await this._model .find()) .map (a => {
      return new Account (this, a, this._budgetModel, this._actualsModel, this._balanceHistoryForAccount (a), this._rateFutureForAccount (a));
    });
  }

  async _updateBalanceHistoryModel() {
    this._balanceHistory = (await this._balanceHistoryModel .find ())
      .sort ((a,b) => {return a .date < b .date? -1: a .date == b .date? 0: 1});
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

  _onTranModelChange (eventType, doc, arg, source) {
    if (doc .account) {
      var acc  = this._accounts .find (a => {return a._id == doc .account});
      var sign = acc .creditBalance? -1: 1;
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
              this._notifyObservers (ModelEvent .UPDATE, pacc, {balance: pacc .balance});
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
      this._notifyObservers (ModelEvent .UPDATE, acc, {balance: acc .balance});
    }
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
      this._actualsModel .removeObserver (this._actualsObserver);
    this._actualsModel = actualsModel;
    this._actualsObserver = this._actualsModel .addObserver (this, this._onActualsModelChange);
  }

  parseTransactions (data) {
    var trans = []
    for (let tr of data .slice (1)) {
      if (tr .length == 9) {
        var amount  = Types .moneyDC .fromString (tr [6]);
        var account = this._accounts .find (a => {return a .number == tr [1]})
        if (account)
          trans .push ({
            date:         Types .dateMDY .fromString (tr [2]),
            payee:        this._smartLowerCase (tr [4] .trim()),
            debit:        amount < 0? -amount: 0,
            credit:       amount > 0? amount: 0,
            account:      account ._id,
            description:  this._smartLowerCase (tr [5]),
            category:     undefined
          })
      }
    }
    return trans;
  }

  getAccounts() {
    return this._accounts;
  }

  getCashFlowBalance() {
    return this._accounts
      .filter (a => {return a .cashFlow && a .type == AccountType .ACCOUNT})
      .reduce ((b, a) => {return b + a .balance * (a .creditBalance? 1: -1)}, 0)
  }

  async find() {
    await this._updateModel();
    await this._updateBalanceHistoryModel();
    await this._updateRateFutureModel();
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

// TODO: invalidate balance cache when model changes require
class Account {
  constructor (model, modelData, budgetModel, actualsModel, balanceHistory, rateFuture) {
    this._model            = model;
    this._categories       = budgetModel .getCategories();
    this._budget           = budgetModel;
    this._actuals          = actualsModel;
    this._balanceHistory   = balanceHistory;
    this._rateFuture       = rateFuture;
    this._balances         = [];
    for (let p of Object .keys (modelData))
      this [p] = modelData [p];
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
          [this .category, this .intCategory, this .disCategory]
            .filter (cid => {return cid})
            .map    (cid => {return this._categories .get (cid)})
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
    for (let cid of [this .category, this .intCategory, this .disCategory])
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

  /**
   *
   * date or balance?
   */
  _getInterest (balance, rateDate, compoundDays, days) {
    let getRate = (date, compoundDays) => {
      let rate = this._rateFuture && this._rateFuture .find (r => {return date >= r .date});
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
          rate = Math .pow (1 + rate / 2.0 / 10000.0, 2) - 1;  // effective semi-annual rate
          rate = (Math .pow (1 + rate, compoundDays / 365) - 1) / compoundDays;
          break;
      }
      return rate;
    }
    return balance * getRate (rateDate, compoundDays) * days;
  }

  /**
   * Return budget amount for cat between start and end where amount is the normal scheduled amount for this period
   *    - liability: amount is payment
   *        - cat == account .category: return principal portion of amount
   *        - cat == intCategory and account .category != null: return interest portion of amount
   */
  getAmount (cat, start, end, amount) {
    if (this .creditBalance)
      return amount;
    else {
      if (cat._id == this .disCategory || ! this .category || ! this .intCategory)
        return amount;
      else {
        let st  = Types .date .monthStart (Types .date .addMonthStart (end, -1));
        let en  = Types .date .monthEnd   (st);
        let bal = this .getBalance  (st, en);
        let int = this._getInterest (bal .amount, start, 365.0 / 12, Types .date .subDays (end, start) + 1) * (this .creditBalance? 1: -1);
        if (cat._id == this .intCategory)
          return Math .round (int);
        else {
          let pri = this._budget .getAmount (this._categories .get (this .intCategory), start, end, true);
          amount +=  (pri .month? pri .month .amount: 0) + (pri .year? pri .year .amount / 12 * (Types .date .subMonths (end, start) + 1): 0);
          return Math .round (Math .max (0, amount - int));
        }
      }
    }
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
    let getBalanceFromActual = date => {
      if (date == this .balanceDate)
        return this .balance;
      else {
        let st, en, sg;
        if (date < this .balanceDate) {
          st = Types .date .addDay (date, 1);
          en = this .balanceDate;
          sg = -1;
        } else {
          st = Types .date .addDay (this .balanceDate, 1);
          en = date;
          sg = 1;
        }
        return this .balance + sg * ((addCat? getAmount (addCat, st, en): 0) + (subCat? getAmount (subCat, st, en): 0))
      }
    }
    let getBudgetMonth = (cat, start, end) => {return getAmount (cat, start, end,
      (c,s,e) => {return (this._budget .getIndividualAmount(c,s,e) .month || {}) .amount || 0},
      (c,s,e) => {return (this._budget .getAmount (c,s,e) .month || {}) .amount || 0}
    )}
    let getBudgetYear = (cat, start, end) => {return getAmount (cat, start, end,
      (c,s,e) => {return (this._budget .getIndividualAmount(c,s,e) .year || {}) .amount || 0},
      (c,s,e) => {return (this._budget .getAmount (c,s,e) .year || {}) .amount || 0}
    )}
    let getBudget = (cat, start, end) => {
      let yr = getBudgetYear (cat, start, end);
      if (yr && end <= this._budget .getEndDate()) {
        // reduce yearly budget by any yearly actuals before start
        let ds = this._budget .getStartDate();
        let de = Types .date .monthEnd (Types .date .addMonthStart (end, -1));
        if (this._categories .getType (cat) == ScheduleType .YEAR)
          yr -= getActual (cat, ds, de, false);
        yr -= this._actuals .getAmountRecursively (cat, ds, de, false, true);
        yr = Math .max (0, yr);
      }
      return getBudgetMonth (cat, start, end) + Math .round (yr / 12);
    }

    /*** getBalance body ***/

    let addCat = this .category    && this._categories .get (this .category);
    let subCat = this .disCategory && this._categories .get (this .disCategory);
    let intCat = this .intCategory && this._categories .get (this .intCategory);
    let baseDate = Types .date .monthEnd (endDate);
    if (baseDate != endDate)
      baseDate = Types .date .monthEnd (Types .date .addMonthStart(endDate, -1));

    let balanceEntry = this._balances .find (b => {return b .date == baseDate});

    if (balanceEntry == null) {

      // determine where we need to start
      let mStart, balance;
      if (this._balances .length) {
        let b = this._balances .slice (-1) [0];
        mStart  = Types .date .addMonthStart (b .date, 1);
        balance = b .balance;
      } else if (this._balanceHistory .length) {
        mStart  = Types .date .monthStart (this._balanceHistory [0] .date);
        balance = 0;
      } else {
        mStart  = Types .date .monthStart (this._balanceDate || Types .date .today());
        balance = 0;
      }

      // compute balance for every missing month up to current date
      while (mStart <= baseDate) {
        let mEnd = Types .date .monthEnd (mStart);
        let add, sub, int, inf=0;
        if (mEnd <= Types .date .monthEnd (Types .date .today())) {
          // use actuals before prior periods
          int = intCat? getActual (intCat, mStart, mEnd): 0;
          add = (addCat? getActual (addCat, mStart, mEnd): 0) + int;
          sub = subCat? getActual (subCat, mStart, mEnd): 0;
          if (this._balanceHistory .length && mEnd <= this._balanceHistory .slice (-1) [0] .date)
            int = getHistoryBalance (mEnd) - balance - add - sub;
          else if (this .balance && mEnd == Types .date .monthEnd (this .balanceDate || Types .date .today()))
            int = (this .balance * (this .creditBalance? 1: -1)) - balance - add - sub;

        } else {
          add = (addCat? getBudget (addCat, mStart, mEnd): 0) + (intCat? getBudget (intCat, mStart, mEnd): 0);
          sub = subCat? getBudget (subCat, mStart, mEnd): 0;
          let days = Types .date .subDays (mEnd, mStart) + 1;
          int = this._getInterest (balance, mStart, 365.0 / 12, days);
          if (PreferencesInstance .get() .presentValue)
            inf = - balance * PreferencesInstance .get() .inflation / 3650000  * days;
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

      balanceEntry = this._balances .slice (-1) [0] || {balance: 0};
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
      amount: balanceEntry .balance,
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
      curBal:  this .balance * (this .creditBalance? 1: -1),
      liquid:  this .liquid,
      amounts: balances .map (d => {return d && d .amount}),
      detail:  balances .map (d => {return d && d .detail})
    }
  }

  getToolTip (cat) {
    let tip = 'ACCOUNT: ' + this .name + ' ';
    if (this .creditBalance) {
      if (cat._id == this .category)
        tip += 'Contributions';
      else
        tip += 'Withdrawals';
    } else {
      let intCat = this .intCategory && this._categories .get (this .intCategory);
      if (cat._id == this .category)
        tip += ' Principal &mdash; Calculated from payments' + (intCat? ' entered for ' + intCat .name : ' entered elsewhere');
      else if (cat._id == this .intCategory)
        tip += this .category? ' Interest &mdash; Calculated from <b><em>total</em></b> payments you enter here': ' Payments'
      else
        tip += ' Advances';
    }
    return tip;
  }
}

var AccountType = {
  GROUP:   0,
  ACCOUNT: 1
}

var RateType = {
  SIMPLE: 0,
  CANADIAN_MORTGAGE: 1
}

var AccountsModelEvent = {
  BALANCE_CHANGE: 500,
  CATEGORY_CHANGE: 501
}

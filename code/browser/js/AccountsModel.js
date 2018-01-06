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
 *     creditBalance        true if credit increases balance (chequing); false if decreases (visa)
 *     apr                  annual interest rate or null to use default rate
 *  Liability only:
 *     rateType             type of rate calculation (e.g., simple interest or canadian mortgage)
 *     paymentAmount
 *     paymentFrequency
 *  Cash-Flow only:
 *     pendingTransactions  []
 *     balanceDate          effective date of account balance (today if null or undefined)
 *  Non Cash-Flow only:
 *     liquid               true iff liquid asset / liability
 *     category             savings category; asset: purchase; liability: principal payment
 *     disCategory          income category; asset: sell; liability: add-on
 *     intCategory          interest category; asset: income; liability: expense, interest payment
 *
 *  BalanceHistory Model
 *     date
 *     account
 *     amount
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
    this._domParser = new DOMParser();
   }

  delete() {
    this._model               .delete();
    this._tranModel           .delete();
    this._balanceHistoryModel .delete();
  }

  async _onModelChange (eventType, doc, arg) {
    if (this._updateModel)
      await this._updateModel();
    this._notifyObservers (eventType, doc, arg);
  }

  async _onBalanceHistoryModelChange (eventType, doc, arg) {
    this._historicBalances = await this._balanceHistoryModel .find ({})
  }

  async _updateModel() {
    this._historicBalances = (await this._balanceHistoryModel .find ({})) .sort ((a,b) => {return a .date < b .date? -1: a .date == b .date? 0: 1});
    this._accounts         = (await this._model .find()) .map (a => {return new Account (a, this._budgetModel, this._actualsModel, this._historicBalances)});
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
    this._actualsModel = actualsModel;
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
  }

  getModel() {
    return this._model;
  }
}


/**
 *
 * Account
 */

class Account {
  constructor (modelData, budgetModel, actualsModel, historicBalances) {
    this._categories       = budgetModel .getCategories();
    this._budget           = budgetModel;
    this._actuals          = actualsModel;
    this._historicBalances = historicBalances;
    for (let p of Object .keys (modelData))
      this [p] = modelData [p];
    // TODO listen to model changes?
  }

  /**
   *
   * Parameters
   *     dates   a date or a sorted list of dates (in ascending date order)
   *  Returns
   *     balance or list of balances for each specified date
   */
  getBalances (dates) {

    /*** helper functions ***/

    // get balance for specified date from list of balances
    let getHistoryBalance = (history, date) => {
      let getAmountFromInterval = (st, en, date) => {
        if (en .date == st .date)
          return en .amount;
        let slope = (en .amount - st .amount) / Types .date .subDays (en .date, st .date);
        return Math .round (st .amount + slope * Types .date .subDays (date, st .date));
      }
      if (history .length == 1)
        return history [0] .amount;
      let upi = history .findIndex (h => {return date <= h .date });
      if (upi == -1)
        return getAmountFromInterval (history [history .length - 2], history [history .length - 1], date);
      else if (history [upi] .date == date)
        return history [upi] .amount;
      else if (upi == 0)
        return 0;
      else
        return getAmountFromInterval (history [upi - 1], history [upi], date);
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
    let getActual = (cat, start, end) => {return getAmount (cat, start, end,
      (c,s,e) => {return this._actuals .getAmount (c,s,e)},
      (c,s,e) => {return this._actuals .getAmountRecursively (c,s,e)}
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

    /*** getBalance body ***/

    // init
    let sign = this .creditBalance? 1: -1;
    let historyBalances = this._historicBalances
      .filter (bal => {return bal .account == this._id})
      .map    (bal => {bal .amount = bal .amount * sign; return bal});
    let rate = ((this .apr != null? this .apr: PreferencesInstance .get() .apr) - (PreferencesInstance .get() .presentValue? PreferencesInstance .get() .inflation: 0));
    switch (this._rateType || 0) {
      case RateType .SIMPLE:
        rate =  rate / 3650000;
        break;
      case RateType .CANADIAN_MORTGAGE:
        rate = Math .pow (1 + rate / 1000.0, 2) - 1; // effective semi-annual rate
        let paymentsPerYear;
        switch (this._paymentFrequency) {
          case PaymentFrequency .WEEKLY:
            paymentsPerYear = 52;
            break;
          case PaymentFrequency .BI_WEEKLY:
            paymentsPerYear = 26;
            break;
          case PaymentFrequency .SEMI_MONTHLY:
            paymentsPerYear = 24;
            break;
          case PaymentFrequency .MONTHLY:
            paymentsPerYear = 12;
            break;
        }
        rate = Math .pow (1 + rate, 1.0 / paymentsPerYear) - 1 / 365;
        break;
    }
    let bal;
    let addCat = this .category    && this._categories .get (this .category);
    let subCat = this .disCategory && this._categories .get (this .disCategory);
    let intCat = this .intCategory && this._categories .get (this .intCategory);
    this .balanceDate = this .balanceDate || Types .date .today();

    // go through dates in order
    let accountData = dates .map (endDate => {
      let pyEndDate = Types .date .addYear (endDate, -1);
      let startDate = Types .date .addMonthStart (pyEndDate, 1);

      // history
      if (historyBalances .length && endDate <= historyBalances [historyBalances .length - 1] .date) {
        bal       = getHistoryBalance (historyBalances, endDate);
        let pyBal = getHistoryBalance (historyBalances, pyEndDate);
        let add   = this .category?    getActual (addCat, startDate, endDate): 0;
        let sub   = this .disCategory? getActual (subCat, startDate, endDate): 0;
        return {
          amount: bal,
          detail: {
            id:     this._id,
            int:    (bal - add - sub) - pyBal,
            addAmt: add,
            subAmt: sub,
            addCat: addCat,
            subCat: subCat,
            intCat: intCat
          }
        }
      }

      // dates that are after last balance-history entry
      else {

        // init
        let addAmt, subAmt, intAmt = 0;
        if (! bal)
          bal = getHistoryBalance (historyBalances, pyEndDate);
        if (historyBalances .length == 0 || pyEndDate <= historyBalances [historyBalances .length - 1] .date) {
          let aBal = getBalanceFromActual (pyEndDate);
          intAmt = aBal - bal;
          bal = aBal;
        }

        // before balance date, back off using actuals
        if (endDate <= this .balanceDate) {
          addAmt  = addCat? getActual (addCat, startDate, endDate): 0;
          subAmt  = subCat? getActual (subCat, startDate, endDate): 0;
          intAmt += intCat? getActual (intCat, startDate, endDate): 0;
        }

        // on or after balance date, but in or before current month, roll forward using actuals
        else if (endDate > this._balanceDate && endDate <= Types .date .monthEnd (Types .date .today())) {

        }

        // after current month, roll forward using budget
        else {
          addAmt  = addCat? getBudget (addCat, startDate, endDate): 0;
          subAmt  = subCat? getBudget (subCat, startDate, endDate): 0;
          intAmt += intCat? getBudget (intCat, startDate, endDate): 0;
        }

        // adjust for current year transactions
        if (endDate <= this._budget .getEndDate()) {
          bal = getHistoryBalance (historyBalances, startDate);
          let actBal = (this .balance || 0) * sign;
          for (let month = Types .date .today(); month >= this._budget .getStartDate(); month = Types .date .addMonthStart (month, -1)) {
            let st  = Types .date .monthStart (month);
            let en  = Types .date .monthEnd   (month);
            let addCat = this._categories .get (this .category);
            let subCat = this._categories .get (this .disCategory);
            let add = addCat? getActual (addCat, st, en): 0;
            let sub = subCat? getActual (subCat, st, en): 0;
            actBal = (actBal - (add + sub)) / (1 + rate * Types .date .daysInMonth (month));
          }
          int = (actBal - bal);
        }

        // go through budget for each month
        let addCat = this .category    && this._categories .get (this .category);
        let subCat = this .disCategory && this._categories .get (this .disCategory);
        for (let month = startDate; month < endDate; month = Types .date .addMonthStart (month, 1)) {
          let st  = Types .date .monthStart (month);
          let en  = Types .date .monthEnd   (month);
          let add = addCat? getBudgetMonth (addCat, st, en): 0;
          let sub = subCat? getBudgetMonth (subCat, st, en): 0;
          int += bal * rate * Types .date .daysInMonth (month);
          bal += (add + sub);
          addAmt += add;
          subAmt += sub;
        }
        let add = addCat? getBudgetYear (addCat, startDate, endDate): 0
        let sub = subCat? getBudgetYear (subCat, startDate, endDate): 0;
        int = Math .round (int);
        bal += int + add + sub;
        addAmt += add;
        subAmt += sub;

        return {
          amount: bal,
          detail: {
            id:     this._id,
            int:    int,
            addAmt: addAmt,
            subAmt: subAmt,
            addCat: addCat,
            subCat: subCat
          }
        }
      }
    });
    return {
      curBal:  this .balance * sign,
      liquid:  this .liquid,
      amounts: accountData .map (d => {return d && d .amount}),
      detail:  accountData .map (d => {return d && d .detail})
    }
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

var PaymentFrequency = {
  WEEKLY: 0,
  BI_WEEKLY: 1,
  SEMI_MONTHLY: 2,
  MONTHLY: 3
}
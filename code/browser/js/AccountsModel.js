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
 *  Cash-Flow only:
 *     pendingTransactions  []
 *  Non Cash-Flow only:
 *     liquid               true iff liquid asset / liability
 *     category             category for savings deposits
 *     disCategory          category for savings withdrawals (distributions)
 *  DELETED:
 *     trackBalance
 *
 *  BalanceHistory Model
 *     date
 *     account
 *     amount
 *  DELETED:
 *     start
 *     end
 *     sort
 */

class AccountsModel extends Observable {
  constructor() {
    super();
    this._model = new Model ('accounts');
    this._model .addObserver (this, this._onModelChange);
    this._tranModel = new TransactionModel();
    this._tranModel .observe ();
    this._tranModel .addObserver (this, this._onTranModelChange);
    this._domParser = new DOMParser();
   }

  delete() {
    this._model     .delete();
    this._tranModel .delete();
  }

  async _onModelChange (eventType, doc, arg) {
    if (this._updateModel)
      await this._updateModel();
    this._notifyObservers (eventType, doc, arg);
  }

  async _updateModel() {
    this._accounts = await this._model .find();
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

var AccountType = {
  GROUP:   0,
  ACCOUNT: 1
}

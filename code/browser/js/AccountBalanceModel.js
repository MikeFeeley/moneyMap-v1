class AccountBalanceModel extends AccountsModel {

  constructor() {
    super ('accountBalance');
    this._tranModel = new TransactionModel();
    this._tranModel .observe ();
    this._tranModel .addObserver (this, this._onTranModelChange);
  }

  delete() {
    super           .delete();
    this._tranModel .delete();
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
}

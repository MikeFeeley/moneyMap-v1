class AccountsModel extends Observable {
  constructor (modelName = 'accounts') {
    super();
    this._model = new Model (modelName);
    this._model .addObserver (this, this._onModelChange);
  }

  delete() {
    this._model .delete();
  }

  async _onModelChange (eventType, doc, arg) {
    if (this._updateModel)
      this._updateModel();
    this._notifyObservers (eventType, doc, arg);
  }

  async _updateModel() {
    this._accounts = await this._model .find();
  }

  _smartLowerCase (s) {
    var allCaps      = ['UBC', 'CA', 'BC', 'AB', 'WWW', 'DDA', 'IDP', 'IBC', 'DCGI', 'ICBC', 'IGA', 'SA', 'RBC', 'NY', 'EI', 'UNA', 'PAP', 'EB', 'US'];
    var allCapsAtEnd = ['ON','DE','IN','TO'];
    var noCaps       = ['e', 'a', 'is', 'in', 'to', 'for', 'the', 'de', 'on', 'of', 'by']
    var words = s .split (' ') .map (s => {return s .trim()});
    for (let i = 0; i < words .length; i++) {
      if (words [i] == '&AMP;')
        words [i] = '&';
      if (! allCaps .includes (words [i]) && (i != words .length -1 || ! allCapsAtEnd .includes (words [i])))
        words [i] = words [i] .toLowerCase();
      if (! noCaps .includes (words [i]) && words [i] .length)
        words [i] = words [i][0] .toUpperCase() + words [i] .slice (1);
      var subwords = words [i] .split ('.');
      for (let j = 0; j < subwords .length; j++)
        if (subwords [j] .length)
          subwords [j] = subwords [j][0] .toUpperCase() + subwords [j] .slice (1);
      words [i] = subwords .join ('.');
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

  async find() {
    await this._updateModel();
  }
}

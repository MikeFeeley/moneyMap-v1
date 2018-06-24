class ImportFormatView extends Observable {

  constructor() {
    super();
  }

  addHtml() {

    $('body') .css ({overflow: 'hidden'});
    this._whiteout = $('<div>', {class: '_importFileFormatter'}) .appendTo ($('body'));
    this._popup    = $('<div>') .appendTo (this._whiteout);
    this._content = $('<div>', {class: '_popupContent'}) .appendTo (this._popup);
    $('<div>', {class: '_title', text: 'Transaction Input File Configuration'}) .appendTo (this._content);
    this._body = $('<div>', {class: '_body'}) .appendTo (this._content);
    const start = $('<div>', {class: '_start'}) .appendTo (this._body);
    $('<div>', {text: 'Download a comma (or tab) deliminted transaction file (i.e., CSV) from your bank.'}) .appendTo (start);
    $('<div>', {text: 'Drag the file here from your downloads folder to configure the import format.'}) .appendTo (start);
    $('<div>', {text: 'Then, just drag files into any window of the app to import them.'}) .appendTo (start);

    this._popup .on ({
      dragover: e => {e .preventDefault()},
      drop:     e => {
        e .preventDefault();
        e .stopPropagation();
        this._notifyObservers (ImportFormatViewEvent .FILE_LOADED, e .originalEvent .dataTransfer .files [0]);
      }
    });

    ui .ModalStack .add (
      e  => {return e && ! $.contains (this._popup [0], e .target) && this._popup [0] != e .target},
      () => {
        this._whiteout .remove();
        $('body') .css ({overflow: 'auto'});
      },
      true
    )
  }

  addTable (data, importColumns = {}) {
    this._body .empty();
    this._table = $('<div>', {class: '_table'}) .appendTo (this._body);
    $('<div>', {class: '_subtitle', text: 'Match Columns with Transaction Fields'}) .appendTo (this._table);
    const colSel        = $('<div>', {class: '_columnSelect'}) .appendTo (this._table);
    const table         = $('<table>') .appendTo (colSel);
    const numCols       = data .reduce ((m,r) => Math .max (m, r .length), 0);
    const wr            = $('<tr>') .appendTo (table);
    const fieldHeaders  = ['', 'Account Number', 'Date', 'Payee', 'Description', 'Signed Amount', 'Debit', 'Credit'];
    const fields        = [null, 'account', 'date', 'payee', 'description', 'amount', 'debit', 'credit'];
    for (let i = 0; i < numCols; i++) {
      const sel = $('<select>') .appendTo ($('<td>') .appendTo (wr))
        .change(() =>
          this._notifyObservers (ImportFormatViewEvent .COLUMN_SELECTED, {
            column:        i,
            importColumns: [... wr .find ('td > select')] .reduce ((o, s, i) =>
              Object .assign (o, s .selectedIndex > 0? {[fields [s .selectedIndex]]: i}: {}),
            {})
          })
        );
      for (const [fi, fieldHeader] of fieldHeaders .entries())
        $('<option>', {text: fieldHeader, selected: importColumns [fields [fi]] !== undefined && importColumns [fields [fi]] == i}) .appendTo (sel);
    }
    for (const line of data) {
      const tr = $('<tr>') .appendTo (table);
      for (let col of line)
        $('<td>', {text: col}) .appendTo (tr);
    }
  }

  addAccounts (numbers, accounts) {
    this .removeAccounts();
    this._accounts = $('<div>', {class: '_accounts'}) .appendTo (this._body);
    $('<div>', {class: '_subtitle', text: 'Match Account Numbers with Accounts'}) .appendTo (this._accounts);
    const accSel = $('<div>', {class: '_accountSelect'}) .appendTo (this._accounts);
    const table  = $('<table>') .appendTo (accSel);
    ($('<tr>') .appendTo ($('<thead>') .appendTo (table)))
      .append ($('<th>', {text: 'Account Number'}))
      .append ($('<th>', {text: 'Selected Account'}));
    const body = $('<tbody>') .appendTo (table);
    for (const number of numbers) {
      const tr = $('<tr>') .appendTo (body);
      $('<td>', {text: number}) .appendTo (tr);
      const sel = $('<select>') .appendTo ($('<td>') .appendTo (tr)) .append ($('<option>', {text: ''}))
        .change (() =>
          this._notifyObservers (ImportFormatViewEvent .ACCOUNT_SELECTED, {
            number: number,
            account: sel [0] .selectedIndex > 0 && accounts [sel [0] .selectedIndex - 1]
          }));
      for (const account of accounts)
        $('<option>', {text: account .name, selected: account .number == number}) .appendTo (sel);
    }
  }

  removeAccounts() {
    if (this._accounts)
      this._accounts .remove();
    this._accounts = null;
  }

  error (message) {
    console.log(message);
  }
}

const ImportFormatViewEvent = {
  FILE_LOADED: 0,
  COLUMN_SELECTED: 1,
  ACCOUNT_SELECTED: 2
}
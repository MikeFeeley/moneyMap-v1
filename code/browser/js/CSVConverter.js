class CSVConverter {
  constructor () {
    this._tables = ['accounts', 'balanceHistory', 'budgets', 'categories', 'counters', 'importRules', 'parameters', 'rateFuture', 'schedules', 'taxParameters', 'transactions'];
  }

  static _getInstance() {
    return CSVConverter_instance || (CSVConverter_instance = new CSVConverter());
  }

  _sanitize (val) {
    if (val === undefined)
      return '';
    else if (typeof val == 'string')
      return '"' + val .replace (/"/g, '""') + '"';
    else if (typeof val == 'number')
      return val;
    else if (Array .isArray (val)) {
      return '"[' + (val .map (v => '"' + this._sanitize (v) + '"') .join (',')) + ']"';
    } else {
      const json = this._sanitize (JSON .stringify (val));
      return '"JSON$' + json .slice (1, -1) + '$JSON"';
    }
  }

  async _export (name, waitMessage = 'Export in progress ...') {
    const pleaseWait = $ ('<div>', {class: '_pleaseWait'}).appendTo ($ ('body')).append ($ ('<div>', {text: waitMessage}));
    const zip      = new JSZip();
    const folder   = zip .folder (name);

    for (const table of this._tables) {
      const model = new Model (table);
      const cols = new Set();
      const rows = [];
      for (const doc of await model .find({})) {
        const row = new Map();
        for (const col of Object .keys (doc)) {
          cols .add (col);
          row  .set (col, doc [col]);
        }
        rows .push (row);
      }
      const colNames = Array .from (cols .keys()) .sort();
      const fileContent = [colNames .map (c => this._sanitize (c)) .join(',')];
      for (const row of rows) {
        const line = [];
        for (const col of colNames)
          line .push (this._sanitize (row .get (col)));
        fileContent .push (line .join(','));
      }
      model .delete();
      folder .file (table + '.csv', fileContent .join ('\n'));
    }

    const content = await zip. generateAsync ({type: 'base64'});
    pleaseWait .remove();

    Object .assign (document .createElement ('a'), {
      href:     'data:text/plain;base64,' + content,
      download: 'moneyMap.zip'
    }) .click();
  }

  async _import (file, configModel, cid, database) {
    const pleaseWait = $('<div>', {class: '_pleaseWait'}) .appendTo ($('body')) .append ($('<div>', {text: 'Import in progress ...'}));
    const zip      = new JSZip();
    const unzip    = await zip .loadAsync (file);
    const name     = Object .keys (unzip.files) [0] .slice (0, -1);
    const has      = {}
    await configModel .update (cid, {name: name});
    for (const table of this._tables) {
      let   promises = [];
      const model    = new Model (table + '$RAW', database);
      const contents = (await unzip .file (name + '/' + table + '.csv') .async ('string')) .split ('\n');
      const header   = Papa .parse (contents .splice (0,1) [0]) .data [0];
      const docs     = [];
      for (const line of contents) {
        const lineCSV = Papa .parse (line) .data [0];
        docs .push (header .reduce ((doc, field, column) => {
          let value = lineCSV [column];
          if (value) {
            if (! isNaN (value))
              value = Number (value);
            else if (value .startsWith ('[') && value .endsWith (']'))
              value = JSON .parse (value);
            else if (value .startsWith ('JSON$') && value .endsWith ('$JSON'))
              try {value = JSON .parse (value .slice (5, -5))} catch (e) {}
          } else
            value = undefined;
          return Object .assign (doc, {[field]: value});
        }, {}));
      }
      switch (table) {
        case 'accounts':
          if (docs .find (doc => doc .type == AccountType .ACCOUNT && doc .form == AccountForm .ASSET_LIABILITY))
            has .hasAssets = true;
          break;
        case 'schedules':
          if (docs .find (doc => doc .amount != 0))
            has .hasBudget = true;
          break;
        case 'transactions':
          if (docs .length > 0)
            has .hasActivity = true;
          break;
      }
      await model .insertList (docs);
      model .delete();
    }
    pleaseWait .remove();
    return has;
  }

  static async export (name, waitMessage) {
    await CSVConverter._getInstance ()._export (name, waitMessage);
  }

  static async import (file, configModel, cid, database) {
    return await CSVConverter._getInstance()._import (file, configModel, cid, database);
  }
}

let CSVConverter_instance;


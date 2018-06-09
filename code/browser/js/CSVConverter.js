class CSVConverter {
  constructor () {
    this._tables = ['accounts', 'balanceHistory', 'budgets', 'categories', 'importRules', 'parameters', 'rateFuture', 'schedules', 'taxParameters', 'transactions'];
  }

  static _getInstance() {
    return CSVConverter_instance || (CSVConverter_instance = new CSVConverter());
  }

  _sanitize (val) {
    if (! val)
      return '';
    else if (typeof val == 'string')
      return '"' + val .replace (/"/g, '""') + '"';
    else if (typeof val == 'number')
      return val;
    else if (Array .isArray (val)) {
      return '"[' + (val .map (v => '"' + this._sanitize (v) + '"') .join (',')) + ']"';
    } else
      return this._sanitize (JSON .stringify (val));
  }

  async _export (name) {
    const pleaseWait = $('<div>', {class: '_pleaseWait'}) .appendTo ($('body')) .append ($('<div>', {text: 'Export in progress ...'}));
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
    await configModel .update (cid, {name: name});
    for (const table of this._tables) {
      let   promises = [];
      const model    = new Model (table, database);
      const contents = (await unzip .file (name + '/' + table + '.csv') .async ('string')) .split ('\n');
      const header   = Papa .parse (contents .splice (0,1) [0]) .data [0];
      for (const line of contents) {
        const csv = Papa .parse (line) .data [0];
        const doc = header .reduce ((o, f, i) => Object .assign (o, {[f]: csv [i]}), {});
        promises .push (model .insert (doc));
        if (promises .length > 200) {
          await Promise .all (promises);
          promises = [];
        }
      }
      await Promise .all (promises);
      model .delete();
      console.log(table, 1);
    }
    pleaseWait .remove();
  }

  static async export (name) {
    await CSVConverter._getInstance()._export (name);
  }

  static async import (file, configModel, cid, database) {
    await CSVConverter._getInstance()._import (file, configModel, cid, database);
  }
}

let CSVConverter_instance;


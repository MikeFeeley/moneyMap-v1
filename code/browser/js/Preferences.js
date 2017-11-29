class Preferences extends Observable {

  constructor() {
    super();
    this._view = new PreferencesView();
    this._view .addObserver (this, this._onViewChange);
    this._paramModel = new Model ('parameters');
    this._paramModel .addObserver (this, this._onParamModelChange);
  }

  delete() {
    if (this._paramModel) {
      this._paramModel .delete();
      this._paramModel = 0;
    }
  }

  async _onParamModelChange (eventType, doc, arg) {
    if (eventType == ModelEvent .UPDATE) {
      let fieldName = Array .from (Object .keys (arg)) [0];
      this._view .updateField (doc._id, fieldName, arg [fieldName]);
    }
  }

  async _onViewChange (eventType, arg) {
    if (eventType == ViewEvent .UPDATE) {
      await this._paramModel .update (arg .id, {[arg .fieldName]: arg .value})
    }
  }

  /**
   * Add the Preferences menu to toHtml
   */
  showMenu (toHtml) {
    let html = $('body');
    this._view .addMenu (html, {top: 48,left: 8}, toHtml .parent(), {top: 0, left: 0});
    this._addMenuItem ('About moneyMap', () => {(async () => {await this._addAbout()}) ()});
    this._addMenuItem ('Preferences',    () => {(async () => {await this._addPreferencesEdit()}) ()});
    this._addMenuItem ('Export to CSV',  () => {(async () => {await this._addExport()}) ()});
    this._addMenuItem ('Import from CSV',  () => {(async () => {await this._addImport()}) ()});
  }

  _addMenuItem (name, action) {
    this._view .addMenuItem (name, () => {this._view .removeMenu(); action()});
  }

  async _addAbout() {
    let about = $('<div>', {class: '_about'})
      .appendTo ($('body'))
      .append ($('<div>', {text: 'moneyMap'}))
      .append ($('<div>', {text: 'Version 2.0.alpha (bd94f180614b34fe0ff6bde20f883cc260bc47f5)'}))
      .append ($('<div>', {text: '(c) 2017 Mike Feeley (feeley@cs.ubc.ca)'}));
    about.css ({top: 100, left: 50});
    ui .ModalStack .add (
      () => {return true},
      () => {about .remove()},
      true
    )
  }

  /**
   * Add Profile / Configurations edit to the view
   */
  async _addPreferencesEdit() {
    let param = (await this._paramModel .find ({name: 'rates'})) [0];
    let ae = this._view .addPreferencesEdit();
    let pr = this._view .addGroup ('Preferences', ae);
    let rrLine = this._view .addLine (pr);
    let inLine = this._view .addLine (pr);
    this._view .addField (
      new ViewTextbox ('apr', ViewFormats ('percent2'), '', '', 'Rate'),
      param._id, param .apr, rrLine, 'Investment Return'
    );
    this._view .addField (
      new ViewTextbox ('inflation', ViewFormats ('percent2'), '', '', 'Rate'),
      param._id, param .inflation, inLine, 'Inflation'
    );
    this._view .addField (
      new ViewCheckbox ('presentValue', ['Not Adjusted', 'Adjusted']),
      param._id, param .presentValue, inLine, 'Show Inflation-Adjusted Values'
    );
  }

  async _addExport() {

  }

  async _addImport() {

  }
}
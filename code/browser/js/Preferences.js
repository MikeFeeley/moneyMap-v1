var PreferencesInstance;

class Preferences extends Observable {

  constructor() {
    super();
    this._view = new PreferencesView();
    this._view .addObserver (this, this._onViewChange);
    this._paramModel = new Model ('parameters');
    this._paramModel .addObserver (this, this._onParamModelChange);
    PreferencesInstance = this;
  }

  delete() {
    if (this._paramModel) {
      this._paramModel .delete();
      this._paramModel = 0;
    }
    if (this._view) {
      this._view .delete();
      this._view = null;
    }
  }

  async _onParamModelChange (eventType, doc, arg) {
    if (eventType == ModelEvent .UPDATE) {
      let fieldName = Array .from (Object .keys (arg)) [0];
      this._view .updateField (doc._id, fieldName, arg [fieldName]);
      await this .init();
    }
    this._notifyObservers (eventType, doc, arg);
  }

  async _onViewChange (eventType, arg) {
    if (eventType == ViewEvent .UPDATE) {
      await this._paramModel .update (arg .id, {[arg .fieldName]: arg .value})
    }
  }

  async init (addPreferencesEdit) {
    this._data = (await this._paramModel .find ({name: 'rates'})) [0];
    if (addPreferencesEdit)
      await this._addPreferencesEdit();
  }

  isShowing() {
    return this._view && this._view .isShowing();
  }

  /**
   * Add the Preferences menu to toHtml
   */
  showMenu (toHtml) {
    let html = $('body');
    this._view .addMenu (html, {top: UI_BANNER_HEIGHT,left: 8}, toHtml .parent(), {top: 0, left: 0});
    this._addMenuItem ('About moneyMap', () => {(async () => {await this._addAbout()}) ()}, true);
    this._addMenuItem ('Preferences',    () => {(async () => {await this._addPreferencesEdit()}) ()}, true);
    this._addMenuItem ('Donate',         () => {this._addDonate()}, true);
    this._addMenuItem ('Help', () => Help .showCurrentPage());
  }

  _addMenuItem (name, action, underline) {
    this._view .addMenuItem (name, () => {this._view .removeMenu(); action()}, underline? '_underline': '');
  }

  get() {
    return this._data;
  }

  async _addAbout() {
    let about = $('<div>', {class: '_about'})
      .appendTo ($('body'))
      .append ($('<div>', {text: 'moneyMap'}))
      .append ($('<div>', {text: 'Version: ' + APP_VERSION_STRING}))
      .append ($('<div>', {html: '&nbsp;'}))
      .append ($('<div>', {html: '&nbsp;&nbsp;&nbsp;&nbsp; Thanks to:', css: {color: '#ccc'}}))
      .append ($('<div>', {html: '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; nodejs.org', css: {color: '#ccc'}}))
      .append ($('<div>', {html: '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; mongodb.com', css: {color: '#ccc'}}))
      .append ($('<div>', {html: '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; chartjs.org', css: {color: '#ccc'}}))
      .append ($('<div>', {html: '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; refreshless.com (noUiSlider)', css: {color: '#ccc'}}))
      .append ($('<div>', {html: '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; github.com/ilikenwf (nestedSortable)', css: {color: '#ccc'}}))
      .append ($('<div>', {html: '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; linearicons.com', css: {color: '#ccc'}}))
      .append ($('<div>', {html: '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; https://stuk.github.io/ (JSZip)', css: {color: '#ccc'}}))
      .append ($('<div>', {html: '&nbsp;'}))
      .append ($('<a>', {href: 'https://github.com/MikeFeeley/moneyMap', target: '_blank', text: 'github.com/MikeFeeley/moneyMap', css: {color: '#aaa', 'padding-bottom': '6px'}}))
      .append ($('<div>', {text: '(c) 2019 Mike Feeley (feeley@cs.ubc.ca)'}))
    about.css ({top: 100, left: 50});
    ui .ModalStack .add (
      e => e && !$.contains (about .get (0), e .target) && about .get (0) != e .target,
      () => {about .remove()},
      true
    )
  }

  async _addDonate() {
    $('<form action="https://www.paypal.com/cgi-bin/webscr" method="post" target="_blank">\n' +
    '<input type="hidden" name="cmd" value="_s-xclick">\n' +
    '<input type="hidden" name="hosted_button_id" value="D43YXJPN7454Q">\n' +
    '<input type="image" src="https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif" border="0" name="submit" alt="PayPal - The safer, easier way to pay online!">\n' +
    '<img alt="" border="0" src="https://www.paypalobjects.com/en_US/i/scr/pixel.gif" width="1" height="1">\n' +
    '</form>\n' +
    '\n') .submit();
  }

  /**
   * Add Profile / Configurations edit to the view
   */
  async _addPreferencesEdit() {
    let ae = this._view .addPreferencesEdit();
    let pr = this._view .addGroup ('Preferences', ae);
    let l0 = this._view .addLine (pr);
    let l1 = this._view .addLine (pr);
    let l2 = this._view .addLine (pr);
    this._view .addField (
      new ViewTextbox ('apr', ViewFormats ('percent2'), '', '', 'Rate'),
      this._data._id, this._data .apr, l0, 'Default Investment Return'
    );
    this._view .addField (
      new ViewTextbox ('inflation', ViewFormats ('percent2'), '', '', 'Rate'),
      this._data._id, this._data .inflation, l1, 'Inflation'
    );
    this._view .addField (
      new ViewCheckbox ('presentValue', ['Not Adjusted', 'Adjusted']),
      this._data._id, this._data .presentValue, l1, 'Show Inflation-Adjusted Values'
    );
    this._view .addField (
      new ViewTextbox ('futureYears', ViewFormats ('number', '', '', 'Years')),
      this._data._id, this._data .futureYears, l2, 'Number of Years to Project into the Future'
    );
  }

  _help() {
    Help .show ($('body') .find ('.tabs > div:not(.background):not(._nonTab) > div') .text());
  }
}
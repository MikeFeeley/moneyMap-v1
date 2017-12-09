class PreferencesView extends View {

  constructor() {
    super();
    $(window) .resize (e => {this .removeMenu()});
  }

  _getFieldHtml (id, name) {
    return this._preferencesEdit .find ('._field_' + name);
  }

  delete() {
    if (this._preferencesEdit) {
      this._preferencesEdit .remove();
      this._preferencesEdit = null;
    }
  }

  addMenu (toHtml, position, menuButton, menuButtonPosition) {
    this._menuHead = $('<div>', {class: '_preferences_menu_head'})
      .append   ($('<span>', {text: 'money'}))
      .append   ($('<span>', {text: 'Map'}))
      .appendTo (toHtml);
    this._menuHead .css (menuButtonPosition);
    this._menu = $('<div>', {class: '_preferences_menu'}) .appendTo (toHtml);
    this._menu .css (position);
    this._menuModalEntry = ui .ModalStack .add (
      e  => {return e && ! $.contains (this._menu [0], e .target) && this._menu [0] != e .target},
      () => {this._menu .remove(); this._menuHead .remove(); this._menu = null},
      true
    );
    this._menuButton = menuButton;
  }

  removeMenu() {
    if (this._menu) {
      this._menu     .remove();
      this._menuHead .remove();
      this._menu = null;
      ui .ModalStack .delete (this._menuModalEntry);
    }
  }

  addMenuItem (name, action, addClass='') {
    let item = $('<div>', {text: name, class: addClass}) .appendTo (this._menu)
    .on ('click', e => {action(); e .stopPropagation(); return false})
    .on ('mouseover', () => {item .addClass    ('_selected')})
    .on ('mouseout',  () => {item .removeClass ('_selected')})

  }

  isShowing() {
    return this._preferencesEdit != null && this._preferencesEdit .closest ('.background') .length == 0;
  }

  addPreferencesEdit() {
    this._tabs           = $('body') .find ('> .tabbed > .tabs');
    this._tabbedContents = $('body') .find ('> .tabbed > .contents > div');
    this._tabs .find           ('> div:not(._nonTab):not(.background)') .addClass ('background');
    this._tabbedContents .find ('> :not(.background)') .addClass ('background');
    if (this._preferencesEdit)
      this._preferencesEdit .remove();
    this._preferencesEdit = $('<div>')                              .appendTo (this._tabbedContents);
    let content           = $('<div>', {class: '_preferencesEdit'}) .appendTo (this._preferencesEdit);
    return content;
  }

  addGroup (title, toHtml, additionalClass) {
    let g = $('<div>', {class: '_group'})                     .appendTo (toHtml);
    $('<div>', {class: '_title', text: title})                .appendTo (g);
    return $('<div>', {class: '_content ' + additionalClass}) .appendTo (g);
  }

  addLine (toGroup) {
    return $('<div>', {class: '_line'}) .appendTo (toGroup);
  }

  addLabel (text, toLine, type) {
    return $('<div>', {text: text, class: type}) .appendTo (toLine);
  }

  addField (field, id, value, toHtml, label) {
    let f = field .newInstance (id);
    if (label) {
      toHtml = $('<div>', {class: '_labeledField'}) .appendTo (toHtml);
      $('<div>', {class: '_label', text: label}) .appendTo (toHtml);
    }
    f .addHtml (value, this, toHtml);
  }

  setLabel (label, text) {
    label .html (text);
  }

  addInput (name, value, toLine, type = 'text') {
    return $('<input>', {type: type, value: value, placeholder: name}) .appendTo (toLine);
  }

  addButton (text, onClick, toLine) {
    let b = $('<button>', {text: text}) .appendTo (toLine) .click (() => {
      onClick ((b .closest ('._group') .find ('input') .toArray()) .map (v => {return $(v) .val()}))
    });
    return b;
  }
}
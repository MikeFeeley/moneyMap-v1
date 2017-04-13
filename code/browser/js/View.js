/**
 */
class View extends Observable {
  constructor (name, fields) {
    super();
    this._name   = name;
    this._fields = this._getFields (fields)
  }

  _getFields (fields) {
    return fields;
  }

  _setFields (fields) {
    this._fields = this._getFields (fields);
  }

  addHtml (name, toHtml) {
    this._html = $('<div>', {class: name}) .appendTo (toHtml);
  }

  getHtml() {
    return this._html;
  }

  createFields (data, getToHtml) {
    var fields = [];
    for (let fieldName in data)
      if (! fieldName .startsWith ('_')) {
        var field = this._fields .find (f => {return f._name == fieldName});
        if (field) {
          field = field .newInstance (data._id);
          fields .push (field .addHtml (data [fieldName], this, getToHtml()));
        }
      }
    return fields;
  }

  _getFieldHtml (html) {}

  _getField (id, name) {
    return this._getFieldFromHtml (this._getFieldHtml (id, name));
  }

  _getFieldHtmlClass (fieldName) {
    return '_field_' + fieldName;
  }

  _getFieldFromHtml (html) {
    return html && $(html) .data ('field');
  }

  getFieldValue (id, fieldName) {
    var field = this._getField (id, fieldName)
    return field && field .get();
  }

  updateField (id, fieldName, value) {
    var field = this._getField (id, fieldName);
    if (field)
      field .set (value);
  }

  resetField (id, fieldName) {
    var field = this._getField (id, fieldName);
    if (field)
      field .reset();
  }

  update (id, data) {
    for (let field in data)
      this .updateField (id, field, data [field]);
  }

  removeField (id, fieldName) {
    this._getField (id, fieldName) .remove();
  }

  setFieldError (id, fieldName, message) {
    this._getField (id, fieldName)._setError (message);
  }

  isFieldError (id, fieldName) {
    return this._getField (id, fieldName) .hasError();
  }

  setFieldEnabled (id, fieldName, isEnabled) {
    var field = this._getField (id, fieldName);
    if (field && field .isEnabled() != isEnabled) {
      field .setEnabled (isEnabled);
      if (isEnabled)
        field .click();
      else {
        var next = field._html .next();
        if (next.length)
          next .data ('field') .click();
      }
    }
  }

  isFieldEnabled (id, fieldName) {
    return this._getField (id, fieldName) .isEnabled();
  }

  contains (target) {
    if (this._html)
      return $.contains (this._html [0], target) || this._html [0] == target;
  }

  click()          {}
  blur()           {}
  prepareToClose() {}
}

/**
 */
var ViewEvent = {
  CANCELLED: 0,
  UPDATE:    100
}

/**
 */
class ViewFormat {
  constructor (toView, fromView, toTooltip) {
    this.toView    = toView;
    this.fromView  = fromView;
    this.toTooltip = toTooltip
  }
}

/**
 */
class ViewFormatOptions extends ViewFormat {
  constructor (toView, fromView, toTooltip, getOptions) {
    super (toView, fromView, toTooltip);
    this.getOptions = getOptions;
  }
}

/**
 */
class ViewFormatOptionList extends ViewFormat {
  constructor (options) {
    super (
      value => {return (this._options .find (o => {return o [1] == value}) || []) [0]},
      view  => {return (this._options .find (o => {return o [0] == view})  || []) [1]},
      value => {}
    )
    this._options     = options;
    this._optionsView = this._options .map (o => {return o [0]})
    this .getOptions  = () => {return this._optionsView}
  }
}

/**
 */
class ViewField {
  constructor (name, format) {
    this._name   = name;
    this._format = format;
  }
  _addCoreHtml (toHtml) {
    this._html = $('<div>', {
      class: '_field ' + this._view._getFieldHtmlClass (this._name),
      data:  {field: this}
    }) .appendTo (toHtml);
    this._html .change (e => {this ._handleChange (e); return false});
    this._html .on ('focusin', ':text', e => {e .currentTarget .select()});  // XXX Select on focus ... doesn't work well on click
    var toolTip = $('<div>', {class: '_toolTip'}) .appendTo (this._html);
    var tid;
    this.clearTooltip = () => {
      if (tid) {
        clearTimeout (tid);
        tid = undefined;
      }
      if (!toolTip || typeof toolTip.stop != 'function') console.trace ('XXX DEBUG XXX', toolTip, toolTip && toolTip.stop);
      toolTip
        .stop    (true)
        .fadeOut (120);
    }
    this._html .hover (
      e => {
        if (tid)
          clearTimeout (tid);
        toolTip .stop(true);
        tid = setTimeout(() => {
          tid = undefined;
          var text = this ._toolTip;
          if (text) {
            toolTip .text (text);
            toolTip .fadeIn  (120, () => {
              setTimeout (() => {toolTip .fadeOut (120)}, 8000)
            });
          }
        }, 200);
      },
      this.clearTooltip
    );
    this._html .on ('blur', 'input', this.clearTooltip);
  }
  _handleChange (e) {
    var value = this .get();
    if (value === undefined)
      this._setError();
    else {
      this._view._notifyObservers (ViewEvent.UPDATE, {
        id:        this._id,
        fieldName: this._name,
        value:     value
      });
    }
  }
  _setError (message) {
    this._html .addClass ('_error');
    this._html .off      ('change');
    this._html .effect   ('shake');
    this._html .change   (e => {this ._handleChange (e); return false});
    if (message) {
      this._toolTip = message;
      this._html .find ('._toolTip') .addClass ('_error');
    }
  }
  _clearError() {
    this._html .removeClass ('_error');
    this._html .find ('._toolTip') .removeClass ('_error');
  }
  hasError() {
    return this._html .hasClass ('_error');
  }
  _getTooltip() {
    return this._toolTip;
  }
  newInstance (id) {
    return Object.create (this, {
      _id: {value: id}
    });
  }
  remove() {
    this._html .remove();
  }
  addHtml (value, view, toHtml) {
    this._view = view;
    this._addCoreHtml (toHtml);
    this._addHtml();
    this.set (value);
    return this._html;
  }
  setFormat (format) {
    this._format = format;
  }
  get() {
    return this._format.fromView (this._get());
  }
  set (val) {
    this._value   = val;
    this._toolTip = this._format .toTooltip? this._format.toTooltip (this._value): undefined;
    this._set (this._format.toView (val));
    this._clearError();
  }
  reset() {
    this.set (this._value);
  }
  update() {
    var view = this .get();
    if (view != this._value) {
      this .set (view);
      this._handleChange();
    }
  }
  setEnabled (isEnabled) {
    this._html .css  ('opacity', isEnabled? 1: 0);
    this._html .find (':input') .prop ('disabled', ! isEnabled);
    this._html ._isDisabled = ! isEnabled;
  }
  isEnabled() {
    return ! this._html ._isDisabled;
  }

  setSelected() {}
  isSelected()  {return true;}
  click()       {}
}

/**
 */
class ViewEmpty extends ViewField {
  _addHtml()      {}
  _handleChange() {}
  _get()          {return ''}
  _set()          {}
}

/**
 */
class ViewLabel extends ViewField {
  _addHtml (value) {
    this._label = $('<div>', {class: '_content'}) .appendTo (this._html);
  }
  _get() {
    return this._label.text();
  }
  _set (val) {
    this._label.text (val);
  }
}

/**
 */
class ViewEdit extends ViewField {
  _get() {
    return this._input.val();
  }
  _set (val) {
    this._input.val (val);
  }
  click() {
    if (this._input && document.activeElement != this._input[0]) {
      this._input.focus();
    }
  }
}

/**
 */
class ViewTextbox extends ViewEdit {
  constructor (name, format, prefix='', suffix='', placeholder='') {
    super (name, format);
    this._prefix      = prefix;
    this._suffix      = suffix;
    this._placeholder = placeholder;
  }
  _addHtml() {
    this._inputContainer = $('<div>')                                                                     .appendTo (this._html);
    $('<div>', {class: '_prefix', text: this._prefix})                                                    .appendTo (this._inputContainer);
    this._input = $('<input>', {type: 'text', class: '_content', prop: {placeholder: this._placeholder}}) .appendTo (this._inputContainer);
    $('<div>', {class: '_suffix', text: this._suffix})                                                    .appendTo (this._inputContainer);
  }
  _get() {
    return this._input.val();
  }
  _set (val) {
    this._input.val (val);
  }
  setEnabled (isEnabled) {
    super .setEnabled (isEnabled);
    if (this._inputContainer)
      this._inputContainer .prop ('disabled', !isEnabled);
  }
}

/**
 */

var ViewScalable = Base => class extends Base {
  _addHtml() {
    this._labelContainer = $('<div>') .appendTo (this._html);
    $('<div>', {class: '_prefix', text: this._prefix}) .appendTo (this._labelContainer);
    this._label = $('<div>', {class: '_content'})      .appendTo (this._labelContainer);
    $('<div>', {class: '_suffix', text: this._suffix}) .appendTo (this._labelContainer);
  }

  setSelected (isSelected) {
    if (this._isSelected != isSelected) {
      if (isSelected) {
        if (this._superAddHtml)
          this._superAddHtml();
        else
          super._addHtml();
        this._labelContainer .replaceWith (this._inputContainer);
      } else {
        this._html .find (':input') .blur();
        if (this._inputContainer)
          this._inputContainer .replaceWith (this._labelContainer);
      }
      this._isSelected = isSelected;
      if (this._isSelected)
        this._html .addClass    ('_selected')
      else
        this._html .removeClass ('_selected')
      this.reset();
    }
  }
  isSelected() {
    return this._isSelected;
  }
  _get() {
    return this._isSelected? super._get(): this._label.text();
  }
  _set (val) {
    if (this._isSelected)
      super._set (val);
    else
      this._label.text (val);
  }
}

/**
 */
class ViewScalableTextbox extends ViewScalable (ViewTextbox) {}

/**
 */
class ViewSelect extends ViewEdit {
  _addHtml() {
    this._inputContainer = this._input = $('<select>', {class: '_content'}) .appendTo (this._html)
    for (let op of this._format .getOptions())
      $('<option>', {value: op, html: op}) .appendTo (this._input);
  }
  _setError (message) {
    super._setError (message);
    this._html .removeClass ('_error');
    this._html .addClass    ('_error_widget');
  }
  _clearError() {
    super._clearError();
    this._html .removeClass ('_error_widget');
  }
}

/**
 */
class ViewCheckbox extends ViewEdit {
  constructor (name, labels) {
    super (name, ViewFormats ('boolean'));
    this._labels = labels;
  }
  _addHtml() {
    this._inputContainer = $('<div>') .appendTo (this._html);
    this._input = $('<input>', {type: 'checkbox', class: '_content'});
    if (this._labels)
      $('<label>', {class: '_content'}) .appendTo (this._inputContainer)
        .append (this._input)
        .append (this._suffix = $('<div>', {class: '_suffix'}))
    else
      this._input .appendTo (this._inputContainer);

  }
  _set (val) {
    this._input  .prop ('checked', val == true);
    if (this._labels)
      this._html .find ('._suffix') .text (this._labels [Number (val) || 0]);
  }
  _get() {
    return this._input .prop ('checked')? true: false;
  }
}

/**
 *
 */
class ViewScalableCheckbox extends ViewScalable (ViewCheckbox) {
  _set (val) {
    super._set (val);
    this._label  .text (' ');
    this._html .find ('._suffix') .text (this._labels [Number (val) || 0]);
  }
}

/**
 */
class ViewScalableSelect extends ViewScalable (ViewSelect) {}

/**
 */
function ViewFormats (type) {
  if (type == 'dateDM')
    return new ViewFormat (
      (value           => {return Types.dateDM.toString   (value)}),
      ((view, context) => {return Types.dateDM.fromString (view, context)}),
      (value           => {return Types.dateDMY.toString  (value)})
    )
  else
    return new ViewFormat (
      (value => {return Types [type] .toString   (value)}),
      (view  => {return Types [type] .fromString (view)})
    )
}

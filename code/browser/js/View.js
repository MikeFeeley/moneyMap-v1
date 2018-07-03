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
      if (data [fieldName] !== undefined && ! fieldName .startsWith ('_')) {
        var field = this._fields .find (f => {return f._name == fieldName});
        if (field) {
          field = field .newInstance (data._id);
          fields .push (field .addHtml (data [fieldName], this, getToHtml()));
        }
      }
    return fields;
  }

  _getFieldHtml (id, name) {}

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
class ViewFormatDynamicOptionList extends ViewFormat {
  constructor (getOptionList) {
    super (
      value => {return (this._options .find (o => {return o [1] == value}) || []) [0]},
      view  => {return (this._options .find (o => {return o [0] == view})  || []) [1]},
      value => {}
    )
    this .getOptions  = () => {
      this._options = getOptionList();
      return this._options .map (o => {return o [0]});
    }
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
    this._name    = name;
    this._format  = format;
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
      if (!toolTip || typeof toolTip.stop != 'function') console.trace ('XXX PANIC XXX', toolTip, toolTip && toolTip.stop);
      toolTip
        .stop    (true)
        .fadeOut (UI_TOOL_TIP_FADE_MS);
    }
    this._html .hover (
      e => {
        if (tid)
          clearTimeout (tid);
        toolTip .stop(true);
        tid = setTimeout(() => {
          tid = undefined;
          var text = this._getTooltip();
          if (text) {
            toolTip .html (text);
            toolTip .fadeIn  (UI_TOOL_TIP_FADE_MS, () => {
              setTimeout (() => {toolTip .fadeOut (UI_TOOL_TIP_FADE_MS)}, UI_TOOL_TIP_DURATION_MS)
            });
          }
        }, UI_TOOL_TIP_WAIT_MS);
      },
      this.clearTooltip
    );
    this._html .on ('blur', 'input', this.clearTooltip);
    this._html [0] .addEventListener ('keydown', e => {
      if (e .keyCode == 90 && e .metaKey && ! e .shiftKey && this._value !== undefined) {
        let stopPropagation = false;
        if (this._value != this .get()) {
          this .reset();
          stopPropagation = true;
        } else {
          let errors = this._html .closest ('.contents') .find ('._field') .toArray()
            .map    (f => {return $(f) .data ('field')})
            .filter (f => {return f && f .hasError()});
          if (errors .length) {
            for (let f of errors)
              f .reset();
            stopPropagation = true;
          }
        }
        if (stopPropagation) {
          e .preventDefault();
          e .stopPropagation();
          return false;
        }
      }
    }, false);
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
    let content = this._html .find ('._content');
    content .addClass ('_error');
    content .off      ('change');
    content .effect   ('shake');
    if (message)
      this._errorMessage = message;
    if (this._errorMessage)
      this._html .find ('._toolTip') .addClass ('_error');
  }
  _clearError() {
    let content = this._html .find ('._content');
    this._errorMessage = '';
    content .removeClass ('_error');
    this._html .find ('._toolTip') .removeClass ('_error');
  }
  hasError() {
    return this._html && this._html .find ('._content') .hasClass ('_error');
  }
  _getTooltip() {
    if (this._errorMessage)
      return this._errorMessage;
    else
      return this._format .toTooltip? this._format .toTooltip (this._value, this._id): '';
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
  isEnableable() {
    return true;
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
  isEnableable() {
    return false;
  }
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
  isEnableable() {
    return false;
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
    this._inputContainer = $('<div>', {data: {field: this}})                                              .appendTo (this._html);
    $('<div>', {class: '_prefix', text: this._prefix})                                                    .appendTo (this._inputContainer);
    this._input = $('<input>', {type: 'text', class: '_content', prop: {placeholder: this._placeholder}}) .appendTo (this._inputContainer);
    if (isFirefox) /* XXX Hack needed because firefox default border width is 3px and setting all inputs to 2px removes native format */
      this._input .css('border', '2px solid #ddd');
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

const ViewCalendar = {
  show: (date, options, html, callback) => {
    const bs = options .budget .getStartDate();
    const be = options .budget .getEndDate();

    const showMYorYear = (showDate, selDate, isEnd, otherDate) => {
      const st = Types .dateFY .getFYStart (showDate, bs, be);
      const en = Types .dateFY .getFYEnd   (showDate, bs, be);
      const content = $('<div>', {class: '_MYorYear'}) .appendTo (html)
        .click (e => e .stopPropagation());

      const selectDate = date => {
        callback (isEnd && otherDate && otherDate == date? '': date);
        selDate = date;
        setSelected();
      };

      const setSelected = () => {
        for (const cl of ['_selected', '_included'])
          content .find ('.' + cl) .removeClass (cl);
        if (selDate == Types .date._year (st)) {
          year .addClass ('_selected');
          table .find ('td') .addClass ('_included');
        } else {
          const tds = table .find ('td');
          if ((selDate >= st && selDate <= en) || (isEnd && Types .date .isBlank (selDate) && otherDate && otherDate >= st && otherDate <= en)) {
            const selMonth = Types .date .subMonths (selDate || otherDate, st);
            $(tds [selMonth]) .addClass ('_selected');
          }
          if (otherDate) {
            const s = isEnd
              ? Math .max (0, Types .date .subMonths (otherDate, st) + (Types .date .isBlank (selDate)? 1: 0))
              : Math .max (0, Types .date .subMonths (selDate, st) + 1);
            const e = isEnd
              ? (Types .date .isInfinity (selDate)? 12 : Math .min (11, Types .date .subMonths (selDate, st) - 1))
              : (Types .date .isInfinity (otherDate)? 12: Math .min (11, Types .date .subMonths (otherDate, st)));
            for (let i = s; i <= e; i++)
              $(tds [i]) .addClass ('_included');
          }
        }
      }

      const header  = $('<div>', {class: '_header'}) .appendTo (content);
      $('<div>', {class: 'lnr-chevron-left'}) .appendTo (header)
        .click (e => {
          html .empty();
          showMYorYear (Types .date .addYear (showDate, -1), selDate, isEnd, otherDate);
          e .stopPropagation();
        });
      const year = $('<div>', {text:  options .budget .getLabel ({start: st, end: en})}) .appendTo (header)
        .click (e => {
          if (! isEnd)
            selectDate (Types .date._year (st));
          e .stopPropagation();
        });
      $('<div>', {class: 'lnr-chevron-right'}) .appendTo (header)
        .click (e => {
          html .empty();
          showMYorYear (Types .date .addYear (showDate, 1), selDate, isEnd, otherDate);
          e .stopPropagation();
        });

      const table = $('<table>') .appendTo ($('<div>', {class: '_calendar'}) .appendTo (content));
      const tbody = $('<tbody>') .appendTo (table);
      let dt = st;
      for (let row = 0; row < 3; row++) {
        const tr = $('<tr>') .appendTo (tbody);
        for (let col = 0; col < 4; col++) {
          const tdt         = dt;
          const isDisabled = isEnd && otherDate && dt < otherDate;
          const td         = $('<td>', {class: isDisabled? '_disabled': ''}) .appendTo (tr) .append ($('<div>', {text: Types .dateM .toString (dt)}))
            .click (e => {
              if (! isDisabled)
                selectDate (tdt);
              e .stopPropagation();
            });
          dt = Types .date .addMonthStart (dt, 1);
        }
      }

      setSelected();
    }

    const showDM = (showDate, selDate) => {

      const setSelected = () => {
        table .find ('._selected') .removeClass ('_selected');
        table .find ('._today')    .removeClass ('_today');
        const tds = table .find ('td');
        if (selDate >= st && selDate <= en)
          $(tds [Types .date .subDays (selDate, st)]) .addClass ('_selected');
        const today = Types .date .today();
        if (today >= st && today <= en)
          $(tds [Types .date .subDays (today, st)]) .addClass ('_today');
      }

      const content = $('<div>', {class: '_DM'}) .appendTo (html)
        .on ('mousedown click', e => {
          e .stopPropagation();
          e .preventDefault();
        });
      const header  = $('<div>', {class: '_header'}) .appendTo (content);
      $('<div>', {class: 'lnr-chevron-left'}) .appendTo (header)
        .click (e => {
          html .empty();
          showDM (Types .date .addMonthStart (showDate, -1), selDate);
          e .stopPropagation();
        });
      const year = $('<div>', {text: Types .dateMonthY .toString (showDate)}) .appendTo (header);
      $('<div>', {class: 'lnr-chevron-right'}) .appendTo (header)
        .click (e => {
          html .empty();
          showDM (Types .date .addMonthStart (showDate, 1), selDate);
          e .stopPropagation();
        });

      const table = $('<table>') .appendTo ($('<div>', {class: '_calendar'}) .appendTo (content));
      const thead = $('<thead>') .appendTo (table);
      const tbody = $('<tbody>') .appendTo (table);
      let tr = $('<tr>') .appendTo (thead);
      for (const d of ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'])
        $('<th>') .appendTo (tr) .append ($('<div>', {text: d}));
      const sta = Types .date .monthStart (showDate);
      const end = Types .date .monthEnd (showDate);
      const mon = Types .date._month (sta);
      let   dat  = Types .date .addDay (sta, -Types .date .getDayOfWeek (Types .date .monthStart (sta)));
      const st = dat;
      let   col = 0;
      while (dat <= end || col) {
        const thisDat = dat;
        if (col == 0)
          tr = $('<tr>') .appendTo (tbody);
        $('<td>', {class: Types .date._month (dat) != mon? '_deemphasized': ''})
          .appendTo (tr) .append ($('<div>', {text: Types .date._day (dat)}))
          .click (e => {
            callback (thisDat);
            selDate = thisDat;
            setSelected();
            e .stopPropagation();
          })
        dat = Types .date .addDay (dat, 1);
        col = (col + 1) % 7;
      }
      const en = Types .date .addDay (dat, -1);
      setSelected();
    }

    const other = options .otherField && options .otherField .get();
    switch (options .type) {
      case 'MYorYear':
        showMYorYear (date || bs, date, false, other);
        break;
      case 'EndMY':
        showMYorYear (Types .date .isInfinity (date)? other || bs: date || other || bs, date, true, other);
        break;
      case 'DM':
        showDM (date || Types .date .today(), date);
        break;
    }
  }
}

/**
 *
 */
class ViewDate extends ViewTextbox {

  constructor (name, format, prefix='', suffix='', placeholder='', options) {
    super (name, format, prefix, suffix, placeholder);
    this._options = options;
  }

  _addHtml() {

    const removePopup = () => {
      if (popup)
        popup .removeClass ('fader_visible')
          .one ('transitionend', () => {
            if (popup) {
              popup .remove();
              popup = null;
            }
          })
    }

    super._addHtml();
    if (this._options .other)
      this._options .otherField = this._html .siblings ('._field_' + this._options .other) .data ('field');
    let popup;
    const input = this._inputContainer .find ('input');
    input
      .on ('focusin',  e => {
        if (popup)
          popup .remove();
        const toHtml = this._inputContainer .offsetParent();
        popup = $('<div>', {class: '_calendarPicker fader'}) .appendTo (toHtml);
        const content = $('<div>') .appendTo (popup);
        popup .css (ui .calcPosition (this._inputContainer, toHtml, {top: 24, left: 0}));
        ViewCalendar .show (this .get(), this._options, content, val => {this .set (val); this._handleChange(); this.click()});
        popup .addClass ('fader_visible');
        ui .scrollIntoView (popup);
        if (this._html .closest ('.ui-sortable') .length) {
          // moving element causes (1) the handler to be dropped and (2) focus to be lost, so we don't get the focusout event
          const addEventHandler = () => {
            $(this._html .closest ('._tuple') [0]) .one ('click', e => {
              if (popup && e .originalEvent .target != input [0])
                removePopup();
              else
                addEventHandler();
            })
          }
          addEventHandler();
        }
      })
   .on ('focusout', e => removePopup());
  }
}

/**
 */

var ViewScalable = Base => class extends Base {
  _addHtml() {
    this._labelContainer = $('<div>', {data: {field: this}}) .appendTo (this._html);
    $('<div>', {class: '_prefix', text: this._prefix})       .appendTo (this._labelContainer);
    this._label = $('<div>', {class: '_content'})            .appendTo (this._labelContainer);
    $('<div>', {class: '_suffix', text: this._suffix})       .appendTo (this._labelContainer);
  }

  setSelected (isSelected) {
    if (this._isSelected != isSelected) {
      if (isSelected) {
        if (this._superAddHtml)
          this._superAddHtml();
        else
          super._addHtml();
        let c = this._labelContainer;
        let d = c .data();
        this._labelContainer .replaceWith (this._inputContainer);
        c .data (d);
      } else {
        this._html .find (':input') .blur();
        if (this._inputContainer) {
          let c = this._inputContainer;
          let d = c .data();
          if (d && d .field) {
            if (d .field .hasError())
              d .field._set (d .field._value);
            let v = d .field .get();
            if (v != null)
              d .field._value = v;
          }
          this._inputContainer .replaceWith (this._labelContainer);
          c .data (d);
        }
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
class ViewScalableDate    extends ViewScalable (ViewDate) {}

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
  resetOptions() {
    this._input .find ('option') .remove();
    for (let op of this._format .getOptions())
      $('<option>', {value: op, html: op}) .appendTo (this._input);
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
    this._input  .prop ('checked', Boolean (val));
    if (this._labels)
      this._html .find ('._suffix') .text (this._labels [Number (Boolean (val)) || 0]);
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

class ListView extends SortedTupleView {

  constructor (name, fields, lineTypes, options = {}) {
    super (name, fields);
    this._lineTypes = lineTypes;
    this._options   = options;
  }

  _findField (id, fieldName) {
    var line = this._getTuple (id);
    return line && line .find ('.' + this._getFieldHtmlClass (fieldName)) .data ('field');
  }

  _findId (html) {
    return (field => {return field.length? field .data ('field') ._id: undefined}) (html .find ('._field'));
  }

  _findIdUp (html) {
    return (field => {return field.length? field .data ('field') ._id: undefined}) (html .closest ('._field'));
  }

  _moveUpDown (target, dir, firstField) {
    target .blur();
    var targetField = '.' + this._getFieldHtmlClass (target .closest ('._field') .data ('field') ._name) + ':visible';
    var cur = target .closest ('li');
    if (dir .up) {
      var next = cur .prev();
      while (cur .length) {
        if (next .length) {
          var descendents = next .find ('ul') .find (targetField);
          if (descendents .length)
            next = descendents .slice (-1) .closest ('li');
          break;
        } else {
          next = cur .closest ('ul') .closest ('li');
          if (next .find (targetField) .length && next .find (targetField) [0] != cur .find (targetField) [0])
            break;
          cur  = next;
          next = next .prev();
        }
      }
    } else if (dir.down) {
      while (cur .length) {
        var next = cur .children ('ul') .find (targetField) .closest ('li');
        if (next .length)
          break;
        else {
          var field = cur .find (targetField) [0];
          next = cur .next();
          if (next .length)
            break;
          else {
            if (cur .closest ('ul') .parent ('li') .length == 0) {
              cur = cur .closest ('ul') .closest ('li');
              continue
            } else {
              while (cur .length && cur .next() .length == 0)
                cur = cur .closest ('ul') .closest ('li');
              next = cur .next();
              break;
            }
          }
        }
      }
    }
    if (next .length) {
      var field = next .find (targetField);
      next = $(field .closest ('li') [0]);
      this._selectTuple (next, firstField? {first: true}: {field: field});
    } else
      target .focus();
  }

  _moveLeftRight (target, dir) {
    var isSelectable = f => {
      return $(f) .data ('field') .isEnabled() && $(f) .find ('li,:input') .length;
    }
    var field = target .closest ('._field');
    if (field .length) {
      target .blur();
      var next  = $(field [dir .left? 'prevAll': 'nextAll'] ('._field') .toArray() .find (isSelectable));
      var hasInner = next .find ('li') .length && (next .find ('li') .find ('._field') .toArray() .find (f => {
        return $(f) .find (':visible') .length;
      }));
      if (hasInner) {
        this._selectTuple (next .find ('li'), {first: true});
      } else if (next .length && next .find ('li') .length == 0) {
        this._selectTuple (undefined, {field: next});
      } else {
        var line = [];
        while (line .length == 0 && field .length != 0) {
          if (dir .right && field .nextAll ('ul') .find ('li') .length)
            line = $(field .nextAll ('ul') .find ('li') [0]);
          else {
            if (dir .left) {
              line = field .closest ('li') .prev();
              if (line .length) {
                while (line .find ('ul') .find ('li') .length)
                  line = line .find ('ul') .find ('li') .slice (-1);
              } else {
                line = field .parent() .closest ('._field') .closest ('li');
                if (line .length == 0) {
                  field = field .closest ('ul');
                  line  = field .closest ('li');
                  if (line .children ('div') .children ('ul') .length)
                    line = line .children ('div') .children ('ul') .children ('li') .slice (-1);
                }
                if (line .closest ('.' + this._name) .length == 0) {
                  line  = [];
                  field = [];
                }
              }
            } else {
              line = field .closest ('li') .next();
              if (!line .length)
                field = field .closest ('ul') .parent();
            }
          }
        }
        if (line .length && line .children ('._field') .children ('div:visible,input:visible') .length)
          this._selectTuple (line, {first: dir .right, last: dir .left});
        else
          target .focus();
      }
    }
  }

  _handleKeypress (e) {

    // Enter
    if (e.keyCode == 13 && e.metaKey) {
      this._notifyObservers (ListViewEvent .INSERT, {
        lineType: $(e.target) .closest ('li') .data ('lineType'),
        pos: {
          id:     this._findIdUp ($(e.target)),
          before: e.shiftKey,
          inside: e.altKey
        }
      });
      return false;

    // Next Line
    } else if (e.keyCode == 13) {
      this._moveUpDown ($(e.target), {down: true});
      return false;

    // Delete
    } else if (e.keyCode == 8 && e.metaKey) {
      this._notifyObservers (ListViewEvent .REMOVE, this._findIdUp ($(e.target)));
      return false;

      // Shift Tab
    } else if (e.keyCode == 9 && e.shiftKey) {
      this._moveLeftRight ($(e.target), {left: true})
      return false;

      // Up Arrow
    } else if (e.keyCode == 38) {
      this._moveUpDown ($(e.target), {up: true})
      return false;

      // Tab
    } else if (e.keyCode == 9 && !e.shiftKey) {
      this._moveLeftRight ($(e.target), {right: true})
      return false;

      // Down Arrow
    } else if (e.keyCode == 40) {
      this._moveUpDown ($(e.target), {down: true})
      return false;
    }
  }

  addHtml (toHtml) {
    this._html = $('<ul>') .appendTo ($('<div>', {class: '_List ' + this._name}) .appendTo (toHtml));
    $('body') .on ('click', e => {this._clearSelectedTuple()});
    if (! this._options .noMove)
      this._html .nestedSortable ({
        listType:            'ul',
        items:               'li',
        placeholder:         '_placeholder',
        forcePlaceholderSize: true,
        dropOnEmpty:          true,
        doNotClear:           true,
        opacity:              0.75,
        toleranceElement:     '> div',
        stop: (e,ui) => {
          if (Math .abs (ui .originalPosition .top - ui .position .top) >= 16 || Math .abs (ui .originalPosition .left - ui .position .left) >= 16) {
            var item = $(ui .item);
            this._notifyObservers (ListViewEvent .MOVE, {
              id:   this._findId (item),
              type: item .data ('lineType'),
              pos: {
                inType: $(item .parents ('ul') .toArray() .find (u => {return $(u) .data ('lineType')})) .data ('lineType'),
                inside: this._findId (item .closest ('ul') . closest ('li')),
                before: this._findId (item .next())
              }
            });
          } else
            return false;
        }
      })
  }

  cancelMove (id) {
    this._html .sortable ('cancel');
    if (id)
      this .flagTupleError (id);
  }

  getLineData (type, doc) {
    return this._lineTypes [type] .reduce ((o,f) => {o [f] = doc [f]; return o}, {_id: doc._id, _sort: doc .sort});
  }

  /**
   * Add tuple to html
   *   type - line type
   *   data - ordered list of field names and values to add
   *   pid  - id of parent to which to add tuple (or NULL to add to root)
   */
  addTuple (type, data, pid) {
    if (this._html) {
      var parent = pid && this._getTuple (pid);
      if (parent) {
        parent     = $(parent .children ('._field_' + type) [0] || parent);
        var toHtml = $(parent .children ('ul') [0] || ($('<ul>', {data: {lineType: type}}) .appendTo (parent)))
      } else
        var toHtml = this._html;
      var line = $('<li>', {class: '_list_line_' + type, data: {lineType: type}});
      super .addTuple (data, data ._sort, line, toHtml);
      line .on ('click', e => {
        this._selectTuple ($(e.currentTarget), {field: $(e.target) .closest ('._field')});
        e.stopPropagation();
        var p = e .target .parentElement;
        if (p) {
          var f = $(p) .data ('field');
          if (f) {
            var html   = $(e .target) .offsetParent();
            var pos    = $(e .target) .position();
            pos .top  += e .offsetY;
            pos .left += e .offsetX;
            this._notifyObservers (ListViewEvent .FIELD_CLICK, {id: f._id, name: f._name, html: html, pos: pos});
          }
        }
      });
      line .on ('keydown', e => {return this._handleKeypress (e)});
      if ($(document .activeElement) .closest ('.' + this._name) .length)
        this._selectTuple (line);
    }
  }

  moveTuple (type, id, pid) {
    var tuple  = this._tuples .get (id);
    if (tuple) {
      var parent = pid && this._tuples .get (pid);
      if (parent) {
        parent     = $(parent .children ('._field_' + type) [0] || parent);
        var toHtml = $(parent .children ('ul') [0] || ($('<ul>', {data: {lineType: type}}) .appendTo (parent)))
      } else
        var toHtml = this._html;
      super .moveTuple (tuple, toHtml);
    }
  }

  removeTuple (id) {
    var line = this._getTuple (id);
    if (line) {
      if ($(document .activeElement) .closest ('._tuple') [0] == line [0]) {
        var next = line .next() .length? line .next(): line.prev()
        if (next .length)
          this .selectTupleWithId (this._findId (next), {first: true});
      }
      super .removeTuple (id);
    }
  }

  prepareToClose() {
    var ae = document .activeElement;
    if ($.contains (this._html [0], ae))
      $(ae) .blur();
  }

  click() {
    if (! this._selected) {
      var line = this._html .find ('li');
      if (line .length)
        this._selectTuple ($(line [0]), {first: true});
    }
  }

  blur() {
    this._clearSelectedTuple();
  }
}

var ListViewEvent = Object.create (SortedTupleViewEvent, {
  MOVE:        {value: 400},
  FIELD_CLICK: {value: 401}
});




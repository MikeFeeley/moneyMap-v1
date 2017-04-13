class IndexedScheduleEntry extends IndexedList {
  constructor (indexName, listName, accounts, variance) {
    super (
      new ScheduleEntryIndex (indexName, accounts, variance, listName),
      new ScheduleEntryList  (listName,  accounts, variance),
      new BudgetYearGraph    (variance .getBudget())
    );
    this .getIndex() ._parent = this;
    this .getList()  ._parent = this;
    this .getHead()  ._parent = this;
    this._listName = listName;
    this._view .addObserver (this, this._onViewChange);
  }

  _onViewChange (eventType, arg) {
    if (eventType == IndexedListViewEvent .SCROLL && this. getIndex() .getWatchScroll()) {
      var top  = $('.' + this._listName) .parent() .scrollTop();
      var sel  = this .getIndex() .getSelected();
      var selS = (sel &&              $('#' + this._listName + sel .selected)) || [];
      var selP = (sel && sel .prev && $('#' + this._listName + sel .prev))     || [];
      if ((selS .length && (selS .position() .top - top < -48)) || (selP .length && selP .position() .top -top >= -48)) {
        var lis = $('.' + this._listName)
              .children ('ul') .children ('li._list_line_categoryLine')
              .children ('ul') .children ('li._list_line_categoryLine');
        for (let li of lis) {
          if ($(li) .position() .top - top >= -48) {
            this .getIndex() .setSelected ($(li) .data ('id'));
            break;
          }
        }
      }
    }
  }
}

class ScheduleEntryList extends ScheduleEntry {
  constructor (name, accounts, variance) {
    super (name, accounts, variance, {showVariance: true})
  }
  _onViewChange (eventType, arg) {
    super._onViewChange (eventType, arg);
    if (eventType == SortedTupleViewEvent .MOVED && this._parent .getIndex(). getSelected() && this._parent .getIndex() .getWatchScroll()) {
      var list = $('.' + this._parent._listName);
      var top  = list .parent() .scrollTop();
      var lis  = list
        .children ('ul') .children ('li._list_line_categoryLine')
        .children ('ul') .children ('li._list_line_categoryLine');
      for (let li of lis) {
        if ($(li) .position() .top - top >= -48) {
          this._parent .getIndex() .setSelected ($(li) .data ('id'));
          break;
        }
      }
    }
  }
}

class ScheduleEntryIndex extends ScheduleEntry {
  constructor (name, accounts, variance, listName) {
    super (name, accounts, variance, {depthLimit: 2, categoriesOnly: true})
    this._view ._setFields ([new ViewLink ('name', ViewFormats ('string'), this)]);
    this._name     = name;
    this._listName = listName;
    this._watchScroll = true;
  }

  addHtml (toHtml) {
    super .addHtml     (toHtml);
    this  .setSelected (this._view._html .find('li') .find ('li') .data ('id'));
  }

  setWatchScroll (watchScroll) {
    this._watchScroll = watchScroll;
  }

  getWatchScroll() {
    return this._watchScroll;
  }

  setSelected (id) {
    if (this._selected)
      $('#' + this._name + this._selected) .removeClass ('_selectedIndex');
    this._selected = id;
    if (this._selected)
      $('#' + this._name + this._selected) .addClass ('_selectedIndex')
  }

  isSelected() {
    return this._selected;
  }

  getSelected() {
    var prev;
    if (this._selected) {
      var e = $('#' + this._name + this._selected);
      if (! e .closest ('ul') .closest ('li') .length) {
        prev = e .prev() .find ('ul') .find ('li');
        prev = $(prev [prev .length - 1]);
      } else {
        prev = e .prev();
        if (! prev .length) {
          prev = e .closest ('ul') .closest ('li') .prev() .find ('ul') .find ('li');
          prev = $(prev [prev .length - 1])
        }
      }
      return {
        selected: this._selected,
        prev:     prev .length? prev .data ('id'): null
      }
    }
  }
}

class ViewLink extends ViewLabel {
  constructor (name, format, parent) {
    super (name, format);
    this._parent = parent;
  }
  _addHtml (value) {
    var anchor = $('<a>', {attr: {
      href: '#' + this._parent._listName + this._id
    }}) .appendTo (this._html);
    anchor .click (e => {
      var list = this._html .closest ('._IndexedListViewWithHead') .find ('._list');
      this._parent .setSelected    (this._id);
      this._parent .setWatchScroll (false);
      list .animate ({
        scrollTop: $('#' + this._parent._listName + this._id) .position() .top + 16
      }, {
        complete: () => {
          this._parent .setWatchScroll (true);
        }
      });
      e. preventDefault();
    });
    this._label = $('<div>', {class: '_content'}) .appendTo (anchor);
  }
}

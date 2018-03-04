class IndexedScheduleEntry extends IndexedList {
  constructor (indexName, listName, accounts, variance, options = {}) {
    super (
      options .noIndex? null: new ScheduleEntryIndex (indexName, accounts, variance, listName),
      new ScheduleEntryList  (listName,  accounts, variance, options),
      options .noHeader? null: new BudgetYearGraph    (variance .getBudget()),
    );
    this._accounts = accounts;
    this._variance = variance;
    this._options  = options;
    if (this .getIndex())
      this .getIndex() ._parent = this;
    this .getList()  ._parent = this;
    if (this .getHead())
      this .getHead()  ._parent = this;
    this._listName = listName;
    this._view .addObserver (this, this._onViewChange);
  }

  delete() {
    super .delete();
  }

  _onViewChange (eventType, arg) {
    if (eventType == IndexedListViewEvent .SCROLL && this .getIndex() && this. getIndex() .getWatchScroll()) {
      let top  = arg .scroll .scrollTop();
      let sel  = this .getIndex() .getSelected();
      let selS = (sel &&              $('#' + this._listName + sel .selected)) || [];
      let selP = (sel && sel .prev && $('#' + this._listName + sel .prev))     || [];
      let margin = Number (arg .list .css ('margin-top') .slice (0, -2));
      if ((selS .length && (selS .position() .top - top < -margin)) || (selP .length && selP .position() .top -top >= -margin)) {
        let lis = $('.' + this._listName)
              .children ('ul') .children ('li._list_line_categoryLine')
              .children ('ul') .children ('li._list_line_categoryLine');
        for (let li of lis) {
          if ($(li) .position() .top - top >= -margin) {
            this .getIndex() .setSelected ($(li) .data ('id'));
            break;
          }
        }
      }
    }
  }

async addHtml (toHtml) {
  let button;
  let addPopup = async () => {
    button .removeClass ('_disabled');
    let popup   = $('<div>', {class: '_reorganizeCategoriesPopup fader_slow_disolve'}) .appendTo (this._view._html);
    let content = $('<div>') .appendTo (popup);
    let scheduleEntry = new IndexedScheduleEntry (
      '_CategoryMenu', '_ReorganizeScheduleEntry',
      this._accounts, this._variance,
      {showVariance: false, includeZombies: true, includeZombieActiveYears: true, categoriesOnly: true, noHeader: true, noIndex: true}
    );
    await scheduleEntry .addHtml (content);
    let lis = content .closest ('._IndexedListViewWithHead') .find ('._list');
    let mar = Number (lis .css ('margin-top') .slice (0, -2)) + 100;
    let pos = $('body > .tabbed').scrollTop();
    let nms = lis .find ('._List > ul > li, ._List > ul > li > ul > li') .toArray();
    let tid = '_ReorganizeScheduleEntry' + nms .find (n => {return $(n) .position() .top - pos >= -mar}) .id .slice (this._listName .length);
    content .find ('> div > ._list') .scrollTop ($('#' + tid) .position() .top + 16);
    ui .ModalStack .add (
      e => {
          return e
            && ! $.contains (content .get (0), e .target) && content .get (0) != e .target
            && ! $.contains (this._view._index .get (0), e .target)
      },
      e => {popup .removeClass ('fader_visible') .one ('transitionend', () => {
        scheduleEntry .delete();
        popup .remove();
        button .addClass ('_disabled')})
      },
      true
    )
    setTimeout (() => {popup .addClass ('fader_visible')}, 0);
  }
  await super .addHtml (toHtml)
    if (! this._options .noHeader && this._variance .getBudget() .getCategories() .hasZombies())
      button = $('<div>', {class: 'lnr-history _disabled'})
        .appendTo ($('<div>', {class: '_reorganizeButton'}) .prependTo (this._view._html))
        .click (e => {(async () => {await addPopup()})()});
  }
}

class ScheduleEntryList extends ScheduleEntry {
  constructor (name, accounts, variance, options) {
    if (options .showVariance === undefined)
      options .showVariance = true;
    super (name, accounts, variance, options)
  }
  _onViewChange (eventType, arg) {
    super._onViewChange (eventType, arg);
    if (eventType == SortedTupleViewEvent .MOVED && this._parent .getIndex() && this._parent .getIndex() .getSelected() && this._parent .getIndex() .getWatchScroll()) {
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

  async addHtml (toHtml) {
    await super .addHtml     (toHtml);
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
    let prev, group, content;
    if (this._selected) {
      let e = $('#' + this._name + this._selected);
      if (! e .closest ('ul') .closest ('li') .length) {
        prev = e .prev() .find ('ul') .find ('li');
        prev = $(prev [prev .length - 1]);
        if (prev .length == 0)
          group = e .closest ('li');
      } else {
        prev = e .prev();
        if (prev .length == 0)
          group = e .closest ('ul') .closest ('li')
      }
      if (prev .length == 0) {
        do {
          group   = group .prev();
          content = group .find ('ul') .find ('li');
        } while (group .length && content .length == 0);
        prev = $(content [content .length -1])
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
      for (let l of list .toArray()) {
        let list = $(l);
        let listName = list .children ('._List') .get(0) .className .split (' ') .slice (-1) [0];
        let listScroll = list .data ('_listScroll');
        // TODO when listScroll is body, animation causes flashing
        listScroll .animate ({
          scrollTop: $('#' + listName + this._id) .position() .top + 16
        }, {
          complete: () => {
            this._parent .setWatchScroll (true);
          }
        });
      }
      e. preventDefault();
    });
    this._label = $('<div>', {class: '_content'}) .appendTo (anchor);
  }
}


class IndexedListView extends Observable {

  constructor (hasHead, hasIndex) {
    super();
    this._hasHead  = hasHead;
    this._hasIndex = hasIndex;
  }

  remove() {
    if (this._html) {
      this._html .remove();
      this._html = null;
      if (this._subScroll) {
        $('body > .tabbed') .css ({overflow: 'scroll'});
      }
    }
  }

  addHtml (toHtml) {
    this._html  = $('<div>', {class: '_IndexedListView' + (this._hasHead? 'WithHead': '')}) .appendTo (toHtml);
    if (this._hasIndex)
      this._index = $('<div>', {class: '_index'})         .appendTo (this._html);
    if (this._hasHead)
      this._head = $('<div>', {class: '_head'})           .appendTo (this._html);
    this._list  = $('<div>', {class: '_list'})            .appendTo (this._html);
    this._subScroll  = ui .getScrollParent (this._list .get(0)) == this._list .get (0)
    this._listScroll = this._subScroll? this._list: $(window);
    if (this._subScroll)
        $('body > .tabbed') .css ({overflow: 'hidden'});
    this._list .data ('_listScroll', this._subScroll? this._listScroll: $('body > .tabbed'));
    this._listScroll .scroll (e => {
      if (this._html .closest ('.background') .length == 0)
        this._notifyObservers (IndexedListViewEvent .SCROLL, {scroll: this._listScroll, list: this._list});
    });
  }

  getIndexHtml() {
    return this._index;
  }

  getListHtml() {
    return this._list;
  }

  getHeadHtml() {
    return this._head;
  }
}

var IndexedListViewEvent = {
  SCROLL: 100
}

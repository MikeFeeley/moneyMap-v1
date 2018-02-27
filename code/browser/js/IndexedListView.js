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
    }
  }

  addHtml (toHtml) {
    this._html  = $('<div>', {class: '_IndexedListView' + (this._hasHead? 'WithHead': '')}) .appendTo (toHtml);
    if (this._hasIndex)
      this._index = $('<div>', {class: '_index'})         .appendTo (this._html);
    if (this._hasHead)
      this._head = $('<div>', {class: '_head'})           .appendTo (this._html);
    this._list  = $('<div>', {class: '_list'})            .appendTo (this._html);
    this._list .scroll (e => {
      this._notifyObservers (IndexedListViewEvent .SCROLL, this._list .height());
    })
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

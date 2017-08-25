class IndexedList {
  constructor (index, list, head) {
    this._index = index;
    this._list  = list;
    this._head  = head;
    this._view  = new IndexedListView (head != null);
  }

  delete() {
    this._index .delete();
    this._list  .delete();
    this._view  .remove();
  }

  addHtml (toHtml) {
    this._view  .addHtml (toHtml);
    this._index .addHtml (this._view .getIndexHtml());
    if (this._head)
      this._head .addHtml (this._view .getHeadHtml());
    this._list  .addHtml (this._view .getListHtml());
  }

  getList() {
    return this._list;
  }

  getIndex() {
    return this._index;
  }

  getHead() {
    return this._head;
  }
}

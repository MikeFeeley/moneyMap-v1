class IndexedList {
  constructor (index, list, head) {
    this._index = index;
    this._list  = list;
    this._head  = head;
    this._view  = new IndexedListView (head != null, index != null);
  }

  delete() {
    if (this._index)
      this._index .delete();
    this._list  .delete();
    this._view  .remove();
  }

  async addHtml (toHtml) {
    this._view  .addHtml (toHtml);
    if (this._index)
      await this._index .addHtml (this._view .getIndexHtml());
    if (this._head)
      this._head .addHtml (this._view .getHeadHtml());
    await this._list  .addHtml (this._view .getListHtml());
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

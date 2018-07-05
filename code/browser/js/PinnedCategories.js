class PinnedCategories {
  constructor() {
    const value = localStorage .getItem (PinnedCategories_key)
    this._list = value? JSON .parse (value): [];
  }

  static getInstance() {
    if (! PinnedCategories_instance)
      PinnedCategories_instance = new PinnedCategories();
    return PinnedCategories_instance
  }

  setObserver (onChange) {
    this._onChange = onChange;
  }

  get() {
    return this._list;
  }

  add (cid) {
    if (! this._list .includes (cid)) {
      this._list .push (cid);
      localStorage .setItem (PinnedCategories_key, JSON .stringify (this._list));
      if (this._onChange)
        this._onChange();
    }
  }

  remove (cid) {
    const psn = this._list .indexOf (cid);
    if (psn != -1) {
      this._list .splice (psn, 1)
      localStorage .setItem (PinnedCategories_key, JSON .stringify (this._list));
      if (this._onChange)
        this._onChange();
    }
  }
}

let PinnedCategories_instance;
const PinnedCategories_key = 'PinnedCategories';
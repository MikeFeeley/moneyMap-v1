class PinnedCategories {
  constructor() {
    this._map = new Map();
  }

  static getInstance() {
    if (! PinnedCategories_instance)
      PinnedCategories_instance = new PinnedCategories();
    return PinnedCategories_instance
  }

  setObserver (onChange) {
    this._onChange = onChange;
  }

  _keyName() {
    return PinnedCategories_key + '$' + _default_database_id;
  }

  get() {
    let list = this._map .get (_default_database_id);
    if (! list) {
      list = JSON .parse (localStorage .getItem (this._keyName())) || [];
      this._map .set (_default_database_id, list);
    }
    return list;
  }

  add (cid, date) {
    const list = this .get();
    if (! list .find (entry => entry [0] == cid && entry [1] == date)) {
      list .push ([cid, date]);
      localStorage .setItem (this._keyName(), JSON .stringify (list));
      if (this._onChange)
        this._onChange();
    }
  }

  remove (cid, date) {
    const list = this .get();
    const psn = list .findIndex (entry => entry [0] == cid && entry [1] == date);
    if (psn != -1) {
      list .splice (psn, 1)
      localStorage .setItem (this._keyName(), JSON .stringify (list));
      if (this._onChange)
        this._onChange();
    }
  }
}

let PinnedCategories_instance;
const PinnedCategories_key = 'PinnedCategories';
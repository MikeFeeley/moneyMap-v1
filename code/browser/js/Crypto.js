class Crypto {
  constructor (password) {
    this._password = password;
    this._rules = new Map();
    this._rules .set ('importRules',    {allFields: true});
    this._rules .set ('parameters',     {allButFields: ['_id', 'name']});
    this._rules .set ('taxParameters',  {allButFields: ['_id', 'account']});
    this._rules .set ('transactions',   {fields: ['payee', 'description', 'imported']});
    this._rules .set ('rateFuture',     {fields: ['rate']})
    this._rules .set ('accounts',       {fields: ['name']})
    this._rules .set ('categories',     {fields: ['name']});
    this._rules .set ('schedules',      {fields: ['notes', 'amount']});
    this._rules .set ('configurations', {fields: ['keyTest']});
    this._rules .set ('balanceHistory', {fields: ['amount', 'date']})
    this._salt       = 'MichaelLindaCaitlinLiamJosephKayMarieSeamus';
    this._iv         = new Uint8Array ([2,8,16,32,64,128,3,9,33,65,129,4,10,34,66,130]);
    this._iterations = 1000;
    this._hash       = 'SHA-256';
  }

  _sToAb (str) {
    return new TextEncoder ("utf-8") .encode (str);
  }

  _abToS (buf) {
    return String .fromCharCode .apply (null, new Uint8Array(buf));
  }

  _getAlgorithm (iv) {
    if (! iv) {
      let ta = new Uint8Array (16);
      iv     = crypto .getRandomValues (ta);
    }
    return {name: 'AES-CBC', iv: iv};
  }

  getPassword() {
    return this._password;
  }

  async getServerPassword() {
    if (! this._serverPassword)
      this._serverPassword = await (this._transformPassword (await this .getPasswordHash (await this .getPasswordHash())));
    return this._serverPassword;
  }

  async _transformPassword (password) {
    const saltedPassword    = this._sToAb (this._salt .concat (password));
    const algorithm         = this._getAlgorithm (this._iv);
    const encryptedPassword = await crypto .subtle .encrypt (algorithm, await this._getKey(), this._sToAb(saltedPassword));
    return this._abToS (await crypto .subtle .digest (this._hash, encryptedPassword));
  }

  async getPasswordHash() {
    if (!this._passwordHash)
      this._passwordHash = await this._transformPassword (this._password);
    return this._passwordHash;
  }

  async _getKey() {
    if (! this._key) {
      let baseKey = await crypto .subtle .importKey(
        "raw",
        this._sToAb (this._password),
        {"name": "PBKDF2"},
        false,
        ["deriveKey"]
      );
      this._key = await crypto .subtle .deriveKey(
        {
          "name":       "PBKDF2",
          "salt":       this._sToAb (this._salt),
          "iterations": this._iterations,
          "hash":       this._hash
        },
        baseKey,
        {"name": "AES-CBC", "length": 128},
        true,
        ["encrypt", "decrypt"]
      );
    }
    return this._key;
  }

  async _encryptDoc (rule, doc) {
    for (let p of Object .keys (doc)) {
      const applies =
        (rule .allFields    && p != '_id') ||
        (rule .allButFields && ! rule .allButFields .includes (p)) ||
        (rule .fields       && rule .fields .includes (p));
      if (applies) {
        let al = this._getAlgorithm();
        let ct = await crypto .subtle .encrypt (al, await this._getKey(), this._sToAb (JSON .stringify (doc [p])));
        doc [p] = {
          iv: String .fromCharCode .apply (null, new Uint8Array  (al .iv)),
          ct: String .fromCharCode .apply (null, new Uint8Array (ct))
        };
      }
    }
  }

  async _decryptDoc (doc) {
    for (let p of Object .keys (doc))
      if (doc [p] && typeof doc [p] == 'object' && doc [p] .iv && doc [p] .ct) {
        let iv = new Uint8Array (doc [p] .iv .length);
        for (let i=0; i < doc [p] .iv .length; i++)
          iv[i] = doc [p] .iv .charCodeAt (i);
        let ct = new Uint8Array (doc [p] .ct .length);
        for (let i = 0; i < doc [p] .ct .length; i++)
          ct[i] = doc [p] .ct .charCodeAt (i);
        try {
          doc [p] = JSON .parse (this._abToS (await crypto .subtle .decrypt (this._getAlgorithm (iv), await this._getKey(), ct)));
        } catch (e) {
          console.log ('decryption error', doc, p)
          throw e;
        }
      } else if (doc [p] && typeof (doc [p]) == 'object')
        await this._decryptDoc (doc [p]);
  }

  async encryptRequestData (data) {
    try {
      if (data .collection) {
        let rule = this._rules .get (data .collection .split ('$') [0]); // To remove possible $RAW before checking rules
        if (rule) {
          data = JSON .parse (JSON .stringify (data));
          for (let field of ['update', 'insert'])
            if (data [field])
               await this._encryptDoc (rule, data [field]);
          if (data .list)
            for (let item of data .list)
              await this._encryptDoc (rule, item .update || item);
        }
      }
      return data;
    } catch (e) {
      console.log(e);
    }
  }

  async decryptResponseData (data) {
    try {
      if (Array .isArray (data))
        for (let doc of data)
          await this._decryptDoc (doc);
    } catch (e) {
      console.log(e);
    }
  }

  async decryptUpcalls (data) {
    try {
      if (Array .isArray (data .upcalls))
        for (let upcall of data .upcalls) {
          for (let field of ['update', 'insert'])
            if (upcall [field])
              await this._decryptDoc (upcall [field]);
          for (let listField of ['updateList', 'insertList'])
            if (upcall [listField])
              for (let item of upcall [listField])
                await this._decryptDoc (item .update || item);
        }
    } catch (e) {
      console.log (e);
    }
  }
}



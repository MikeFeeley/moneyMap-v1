class AccountsView extends View {

  constructor() {
    super();
  }

  async addHtml (toHtml, rebuild) {
    this._toHtml = toHtml;
    this._html   = $('<div>', {class: '_accountsEdit'}) .appendTo ($('<div>') .appendTo (toHtml));
    toHtml .data ('visible', async () => {
      if (this._html == null)
        await rebuild();
    });
  }

  resetHtml() {
    if (this._html) {
      this._html .remove();
      this._html = null;
    }
  }

  isVisible() {
    return this._toHtml && ! this._toHtml .hasClass ('background');
  }

  showFieldTip (id, fieldName, tipText) {
    let target = this._getField (id, fieldName)._html;
    let html   = target .offsetParent();
    let tip    = $('<div>', {class: '_fieldTip fader'}) .appendTo (html) .append ($('<div>'));
    $('<div>', {text: 'TIP'}) .appendTo (tip .children());
    for (let tl of tipText)
      $('<div>', {text: tl}) .appendTo (tip .children());
    setTimeout (() => {
      let pos = ui .calcPosition (target, html, {top: - tip .height() -16, left: -16});
      if (pos .top < 16)
        pos = ui .calcPosition (target, html, {top: 32, left: -16})
      tip .css (pos);
      ui .scrollIntoView (tip);
      tip .addClass ('fader_visible') .one ('transitionend', () => {
        let to, mo = ui .ModalStack .add (() => {return true}, () => {
          if (mo) {
            mo = null;
            if (to)
              clearTimeout (to);
            tip .removeClass ('fader_visible') .one ('transitionend', () => {tip .remove()})
          }
        }, true);
        to = setTimeout (() => {
          tip .removeClass ('fader_visible') .one ('transitionend', () => {
            tip .remove();
            if (mo)
              ui .ModalStack .delete (mo);
          })
        }, UI_FIELD_TIP_DURATION_MS);
      });
    }, 0);
  }

  remove (id, setFocus) {
    let target = $(this._html .find ('li') .toArray() .find (li => {return $(li) .data ('id') == id}));
    if (setFocus) {
      let focus = target .next ('li');
      if (focus .length == 0)
        focus = target .prev ('li');
      $(focus .find ('input') [0]) .focus();
    }
    target .remove();
  }

  addGroup (title) {
    let group = $('<div>', {class: '_group'})
      .appendTo (this._html)
      .append   ($('<div>', {class: '_title', text: title}))
    $('<ul>') .appendTo ($('<div>', {class: '_content'}) .appendTo (group))
      .nestedSortable ({
        handle:              'div',
        listType:            'ul',
        items:               'li',
        placeholder:         '_placeholder',
        forcePlaceholderSize: true,
        dropOnEmpty:          true,
        doNotClear:           true,
        opacity:              0.75,
        toleranceElement:     '> div',
        protectRoot:          true,
        maxLevels:            2,
        stop: (e,ui) => {
          let item     = $(ui .item);
          let nextItem = item .next ('li');
          this._notifyObservers (AccountsViewEvent .MOVE, {
            id:         item .data ('id'),
            before:     nextItem .length && nextItem .data ('id'),
            groupNum:   item .data ('groupNum'),
            subgroupId: item .data ('subgroupId') && item .parent() .closest ('li') .data ('id')
          })
          return true;
        }
      });
    group .on ('keydown', 'li', e => {
      let o = e .originalEvent;
      if (o .metaKey && (o .keyCode == 8 || o .keyCode == 13)) {
        let target = $(e .currentTarget);
        this._notifyObservers (o .keyCode == 8? AccountsViewEvent .REMOVE: AccountsViewEvent .INSERT, {
          id:         target .data ('id'),
          subgroupId: target .data ('subgroupId'),
          sort:       target .data ('sort'),
          inside:     e .altKey,
          before:     e .shiftKey
        })
        e .stopPropagation();
        e .preventDefault();
      }
      if (o .keyCode == 13) // not sure why this is need; seems to be only for Income and Tax groups; without this CR submits the form
        e .stopPropagation();
     });
    return group;
  }

  updateSort (id, sort) {
    $(this._html .find ('li') .toArray() .find (li => {return $(li) .data ('id') == id})) .data ('sort', sort);
  }

  setFocus (e) {
    $(e .find ('input') [0]) .focus();
  }

  addSubGroup (labelField, id, labelValue, group, groupNum, sort, setFocus) {
    let before  = group .find ('> ._content > ul > li') .toArray() .find (li => {return $(li) .data ('sort') >= sort});
    let op      = before? 'insertBefore': 'appendTo';
    let el      = before? before: group .find ('> ._content > ul');
    let li      = $('<li>', {class: '_subgroup', data: {id: id, groupNum: groupNum, sort: sort}}) [op] (el);
    let label   = $('<div>', {class: '_label'})   .appendTo (li);
    labelField .newInstance (id) .addHtml (labelValue, this, label);
    $('<ul>') .appendTo (li);
    if (setFocus)
      this .setFocus (li);
    return li;
  }

  addEntry (id, subgroupId, sort) {
    let subgroup = $(this._html .find ('._subgroup') .toArray() .find (sg => {return $(sg) .data ('id') == subgroupId}));
    let before = subgroup .find ('> ul > li') .toArray() .find (li => {return $(li) .data ('sort') >= sort});
    let op     = before? 'insertBefore': 'appendTo';
    let el     = before? before:          subgroup .find ('> ul');
    let entry = $('<form>')
      .appendTo ($('<div>', {class: '_left'})
        .appendTo ($('<div>', {class: '_leftRight'})
          .appendTo ($('<div>', {class: '_entry'})
            .appendTo ($('<li>', {data: {id: id, subgroupId: subgroupId, sort: sort}}) [op] (el)))));
    entry .on ('submit', e => {return false});
    return entry;
  }

  addHelpTable (descData, tableData, top=100, left=50) {
    let popup = $('<div>', {class: '_helpPopup'})
      .appendTo ($('body'))
      .css ({top: top, left: left});
    let help = $('<div>') .appendTo (popup);
    $('<div>', {text: 'TIP'}) .appendTo (help);
    for (let desc of descData)
      $('<div>', {text: desc}) .appendTo (help);
    let table = $('<table>') .appendTo (help);
    for (let row of tableData) {
      let tr = $('<tr>') .appendTo (table);
      for (let t of row)
        $('<td>', {text: t}) .appendTo (tr);
    }
    ui .ModalStack .add (
      e => {return true},
      e => {popup .remove()},
      true
    )
  }

  getEntry (id) {
    return $(this._html .find ('._subgroup > ul > li') .toArray() .find (e => {return $(e) .data ('id') == id}))
      .find ('> ._entry > ._leftRight > ._left > form');
  }

  getLine (entry, number) {
    return $(entry .find ('._line') .toArray() [number]);
  }

  addRight (text, entry) {
    let toHtml = entry .closest ('._leftRight');
    let right = toHtml .find ('._right');
    if (right .length == 0)
      right = $('<div>', {class: '_right'}) .appendTo (toHtml);
    let box = $('<div>') .appendTo (right)
      .append   ($('<div>', {class: '_label', text: text}))
      .append   ($('<div>', {class: '_content'}))
    return box .find ('._content');
  }

  addBottom (text, entry) {
    let toHtml = entry .closest ('._entry');
    let bottom = toHtml .find ('._bottom');
    if (bottom .length == 0)
      bottom = $('<div>', {class: '_bottom'}) .appendTo (toHtml);
    let box = $('<div>') .appendTo (bottom)
    .append   ($('<div>', {class: '_label', text: text}))
    .append   ($('<div>', {class: '_content'}))
    return box .find ('._content');
  }

  scrollRightToBottom (entry) {
    let scroll = entry .closest ('._entry') .find ('._right') .find ('._content');
    scroll .scrollTop (scroll[0] .scrollHeight);
   }

  addLabel (text, toEntry) {
    $('<div>', {text: text}) .appendTo (toEntry)
  }

  addLine (toEntry) {
    return $('<div>', {class: '_line'}) .appendTo (toEntry);
  }

  removeLine (entry, number) {
    this .getLine (entry, number) .remove();
  }

  addField (field, id, value, toLine, label) {
    let f = field .newInstance (id);
    if (label) {
      toLine = $('<div>', {class: '_labeledField'}) .appendTo (toLine);
      $('<div>', {class: '_label', text: label}) .appendTo (toLine);
    }
    f .addHtml (value, this, toLine);
  }

  removeField (fieldName, entry) {
    let f = entry .find ('._labeledField') .toArray() .find (e => {
      let field = $(e) .find ('._field') .data ('field');
      return field && field._name == fieldName
    });
    if (f)
      f .remove();
  }

  removeRight (entry) {
    entry .closest ('._entry') .find ('._right') .remove();
  }

  removeBottom (entry) {
    entry .closest ('._entry') .find ('._bottom') .remove();
  }

  _getField (id, name) {
    return Array .from (this._html .find ('._field_' + name))
     .map  (e => {return $(e) .data ('field')})
     .find (f => {return f && f._id == id});
  }

  resetOptions (fieldName) {
    for (let fieldHtml of this._html .find ('._field_' + fieldName) .toArray()) {
      let field = $(fieldHtml) .data ('field');
      if (field && field .resetOptions)
        field .resetOptions();
    }
  }
}

var AccountsViewEvent = Object.create (ViewEvent, {
  MOVE:   {value: 500},
  REMOVE: {value: 501},
  INSERT: {value: 502}
});
class NavigateView extends Observable  {
  constructor (accounts, variance) {
    super();
    this._name = '_Navigate';
    this._colors = [
      [26,101,202],
      [73, 167,46],
      [235,205,32],
      [255,113,19],
      [255,37,14],
      [113,64,158],
      [128,128,128]
    ];
    this._idSeq = 0;
  }

  addHtml (toHtml, buildHtml) {
    this._toHtml    = toHtml;
    this._buildHtml = buildHtml;
    this._createHtml();
  }

  resetHtml() {
    if (this._html) {
      this._html .remove();
      this._html = null;
      this._progressGraphs = null;
    }
    this._idSeq = 0;
    if (this._budgetYearGraph) {
      this._budgetYearGraph .delete();
      this._budgetYearGraph = null;
    }
  }

  _createHtml () {
    if (this._toHtml) {
      this._html    = $('<div>', {class: this._name }) .appendTo (this._toHtml);
      this._content = $('<div>', {class: '_list'})  .appendTo (this._html);
      this._toHtml .data ('visible', () => {
        if (this._html == null && this._toHtml)
          this._createHtml()
      });
      if (this._buildHtml)
        this._buildHtml();
    }
  }

  _resetColors() {
    this._colorIndex = 0;
  }

  _getColor (alpha) {
    return 'rgba(' + (this._colors [this._colorIndex] .concat (alpha)) .join (',') + ')'
  }

  _isVisible() {
    return this._toHtml && ! this._toHtml .hasClass ('background');
  }

  _nextColor() {
    this._colorIndex = (this._colorIndex + 1) % this._colors .length;
  }

  addHeading (text) {
    var id      = this._name + '_' + this._idSeq++;
    var anchors = [];
    var content = $('<div>', {class: '_heading', text: text, attr: {id: id}}) .appendTo (this._content);
    return content;
  }

  addSubHeading (text) {
    var id      = this._name + '_' + this._idSeq++;
    var anchors = [];
    var content = $('<div>', {class: '_text', text: text, attr: {id: id}}) .appendTo (this._content);
    return content;
  }

  addProgressGraph (to, popup, position, onClose) {
    if (!this._progressGraphs) {
      this._progressGraphs = $('<div>', {class: '_progressGraphs'}) .appendTo (this._content);
      $('<div>', {class: '_left'})   .appendTo (this._progressGraphs);
      $('<div>', {class: '_right'})  .appendTo (this._progressGraphs);
      $('<div>', {class: '_bottom'}) .appendTo (this._progressGraphs);
    }
    var container = typeof to == 'string'? this._progressGraphs .children ('._' + to): to;
    if (container .length) {
      var graph = $('<div>', {class: '_progressGraph' + (popup? ' _popup': '')}) .appendTo (container);
      if (popup) {
        graph .css (position);
        ui .ModalStack .add (
          e  => {return e && $.contains (document .body, e .target) && ! $.contains (graph .get (0), e .target)},
          () => {graph .remove(); onClose()},
          true
        );
      }
      return graph;
    }
  }

  addHeadingToProgressGraph (progressGraph, heading) {
    if (progressGraph)
      $('<div>', {class: '_heading', text: heading}) .appendTo (progressGraph);
  }

  addToProgressGraph (progressGraph, heading, data, labelWidth) {
    if (progressGraph) {
      if (heading)
        var head = $('<div>', {class: '_text', text: heading})
          .appendTo (progressGraph)
          .on ('click webkitmouseforcedown', e => {
            this._notifyObservers (NavigateViewEvent .PROGRESS_GRAPH_TITLE_CLICK, {
              data:     data,
              html:     progressGraph,
              position: {top: 50, left: 50},
              view:     this
            });
            return false;
          })
      head [0] .addEventListener ('webkitmouseforcewillbegin', e => {e .preventDefault()}, true)
      var isPopup = progressGraph .hasClass ('_popup');
      if (isPopup)
        progressGraph .removeClass ('hidden');
      var graph = new BudgetProgressGraph (
        '', progressGraph, true, false,
        {barThickness: 24, barPercentage: .85, labelWidth: labelWidth}
      );
      graph .addObserver (this, (eventType, arg) => {
        if (eventType == BudgetProgressGraphEvent .GRAPH_CLICK) {
          arg .title = arg .target .closest ('div') .prev ('._text') .text();
          arg .data  = data;
          arg .view  = this;
          this._notifyObservers (NavigateViewEvent .PROGRESS_GRAPH_CLICK, arg);
        }
      });
      graph .add (data);
      return (data, labelWidth, heading) => {
        if (this._isVisible) {
          if (heading)
            head .text (heading);
          graph .update (data, labelWidth);
        } else
          this .resetHtml();
      }
    }
  }

  emptyProgressGraph (progressGraph) {
    if (progressGraph)
      progressGraph .empty();
    if (progressGraph .hasClass ('_popup'))
      progressGraph .addClass ('hidden');
  }

  addBudgetYearGraph (budget, toHtml = this._content) {
    if (this._budgetYearGraph)
      this._budgetYearGraph .delete();
    this._budgetYearGraph = new BudgetYearGraph (budget, toHtml)
    this._budgetYearGraph .add();
  }

  addMonthsGraph (name, dataset, popup, position, onClose, toHtml) {
    return this._addBudgetGraph (name, dataset, popup, position, onClose, toHtml);
  }

  addHistoryGraph (dataset, popup, position, onClose, toHtml) {
    return this._addBudgetGraph ('_budgetHistoryGraph', dataset, popup, position, onClose, toHtml);
  }

  /**
   * Add a budget graph
   *   returns {
   *     cols:   array of column headers
   *     months: number of months (for computing average)
   *     groups: [{
   *       name: name for this group
   *       rows: [{
   *         name:     name for this row
   *         id:       category id for this row
   *         isCredit: true iff this is a credit amount
   *         amounts:  array of (id, value) pairs, one for each column
   *       }]
   *     }]
   *   }
   */

  _addBudgetGraph (name, dataset, popup, position, onClose, toHtml) {

    var processDataset = () => {
      labels = dataset .cols;
      data   = dataset .groups;
      var groups = data .map (g => {
        return g .rows .map (c => {
          return {
            label:       c .name,
            id:          c .id,
            data:        c .amounts .map (a => {return a .value}),
            borderWidth: 1,
            type:        c .type
          }
        })
      });
      var backgroundAlphas = [0.9, 0.1, 0.5];
      var borderAlphas     = [1,   0.4, 0.8];
      var stacks           = [1,2,2];
      var labelPrefixes    = data .length > 1? [data [0] .name + ': ', data [1] .name + ': ', data [2] .name + ': ']: [data [0] .name + ': '];
      for (let g of groups) {
        let idx = groups .indexOf (g);
        this._resetColors();
        for (let d of g) {
          if (d .type == 'line') {
            d .borderColor     = 'rgba(221,0,0,1)';
            d .backgroundColor = 'rgba(0,0,0,0)';
            d .pointBackgroundColor = 'rgba(221,0,0,1)';
          } else {
            d .backgroundColor = this._getColor (groups .length > 1? backgroundAlphas [idx]: 0.3);
            d .borderColor     = this._getColor (borderAlphas     [idx]);
            d .stack           = stacks [idx];
          }
          d .label           = labelPrefixes [idx] + d .label;
          if (d .type != 'line' && d .data .find (a => {return a != 0}))
            this._nextColor();
        }
      }
      datasets = groups .length > 1? groups [0] .concat (groups [2]) .concat (groups [1]): groups [0];
    }

    var setDataset = () => {
      config .data .labels   = labels;
      config .data .datasets = datasets;
    }

    var datasets;
    var labels;
    var data;
    if (toHtml)
      var container = toHtml
    else
      var container = this._content .find ('.' + name + 's');
    if (container .length == 0) {
      var container = $('<div>', {class: name + 's'});
      container .appendTo (this._content);
    }
    var graph  = $('<div>', {class: name + (popup? ' _popup': '')}) .appendTo (container)
    processDataset();
    if (popup) {
      if (data .length == 1) {
        let head = $('<div>', {class: '_heading'})
          .appendTo (graph)
          .on ('click webkitmouseforcedown', e => {
            let position = graph .position();
            position .top  += 50;
            position .left += 50;
            this._notifyObservers (NavigateViewEvent .BUDGET_GRAPH_TITLE_CLICK, {
              id:       data [0] .id,
              position: position,
              html:     container .closest ('div:not(._popup)')
            })
          })
        head [0] .addEventListener ('webkitmouseforcewillbegin', e => {e .preventDefault()}, true)
        $('<span>', {class: '_heading', text: [] .concat (data [0] .name)}) .appendTo (head);
        if (data [0] .note)
          $('<span>', {class: '_subheading', text: data [0] .note}) .appendTo (head);
      }
      if (position)
        graph .css (position)
        ui .ModalStack .add (
          e  => {return e && ! $.contains (graph .get (0), e .target) && graph .get (0) != e .target},
          () => {graph .remove(); onClose()},
          true
        );
    }
    var canvas = $('<canvas>') .appendTo (graph);
    if (data .length > 1) {
      var height = [[],[]];
      for (let i = 0; i < labels .length; i++)
        for (let ds of datasets)
          if (ds .stack)
            height [ds .stack - 1] [i] = (height [ds .stack - 1] [i] || 0) + ds .data [i];
      var max = height .reduce ((m,h) => {return Math .max (m, h .reduce ((m,v) => {return Math .max (m, v)}, 0))}, 0);
      var mu  = max / 10;
      if (mu <= 200000)
        mu = 200000;
      else if (mu <= 500000)
        mu = 500000;
      else if (mu < 1000000)
        mu = 1000000;
      else if (mu < 2000000)
        mu = 2000000;
      else
        mu = 3000000;
      max = Math .round ((max + (mu/2)) / mu) * mu;
    }
    var chart;
    var config = {
      type: 'bar',
      options: {
        legend: {display: false},
        events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove', 'webkitmouseforcedown'],
        onClick: (e, elements) => {
          var element = chart .getElementAtEvent (e);
          if (element .length) { 
            var position    = graph .position();
            position .top  += 50;
            position .left += 50;
            this._notifyObservers (NavigateViewEvent .BUDGET_GRAPH_CLICK, {
              name:       name,
              id:         datasets [element [0] ._datasetIndex] .id,
              label:      labels   [element [0] ._index],
              labelIndex: element [0] ._index,
              data:       data,
              position:   position,
              html:       container .closest ('div:not(._popup)'),
              altClick:   e .webkitForce > 1 || e .altKey,
              view:       this
            })
          }
          return false;
        },
        tooltips: {
          backgroundColor: 'rgba(0,0,0,0.6)',
          callbacks: {
            label: (t, d) => {
              return d .datasets [t .datasetIndex] .label + ': ' +Types .moneyD .toString (t .yLabel);
            }
          }
        },
        scales: {
          yAxes: [{
            stacked: true,
            ticks: {
              beginAtZero: true,
              max: max,
              userCallback: (value, index, values) => {
                return Types .moneyDZ .toString (value);
              }
            }
          }]
        }
      },
      data: {}
    };
    setDataset();
    chart = new Chart (canvas .get (0) .getContext ('2d'), config);
    if (popup)
      ui .scrollIntoView (graph, true);
    return (data) => {
      if (this._isVisible()) {
        if (data .update) {
          var ds = config .data .datasets .find (d => {return d .id == data .update .id});
          if (ds) {
            ds .label = data .update .name;
            ds .data  = data .update .amounts .map (a => {return a .value});
          }
        } else {
          dataset = data .replace;
          processDataset();
          setDataset();
        }
        chart .update();
      } else
        this .resetHtml();
    }
  }

  addGroup (name, toHtml) {
    var group = $('<div>', {class: name});
    if (toHtml)
      group .insertAfter (toHtml);
    else
      group .appendTo (this._content);
  }


  /**
   * addDoughnut
   */
  addDoughnut (data, name, popup, position, direction, onClose) {

    var setDataset = () => {
      labels   = data .cats .map (c => {return c .name});
      datasets = [{
        data:                 data .cats .map (c => {return Math .abs (c .amount)}),
        backgroundColor:      backgroundColors,
        hoverBackgroundColor: hoverBackgroundColors
      }];
      config .data .labels   = labels;
      config .data .datasets = datasets;
      config .centerLabel = [
        data .name,
        Types .moneyD .toString (data .cats .reduce ((s,c) => {
          return s + (! c .blackout? c .amount: 0)
        }, 0))
      ]
    }

    this._resetColors();
    var backgroundColors = data .cats .map (c => {
      if (c .amount != 0 && ! c .blackout) {
        var c = this._getColor (c .amount < 0? 0.2: 0.5);
        if (c .amount != 0)
          this._nextColor();
      } else
        c = 'rgba(128,128,128,0.1)';
      return c;
    });
    this._resetColors();
    var hoverBackgroundColors = data .cats .map (c => {
      if (c .amount != 0 && ! c .blackout) {
        var c = this._getColor (0.9);
          this._nextColor();
      } else
        c = 'rgba(128,128,128,0.1)';
      return c;
    });
    var container = $('<div>', {class: '_' + data .name + (popup? ' _popup': '')}) .appendTo (this._html .find ('.' + name + 's'));
    if (popup) {
      if (position)
        container .css (position);
      ui .ModalStack .add (
        e  => {return e && ! $.contains (container .get (0), e .target) && container .get (0) != e .target},
        () => {container .remove(); onClose()},
        true
      );
    }
    var labels;
    var datasets;
    var canvas = $('<canvas>', {prop: {height: 200, width: 200}}) .appendTo (container);
    var config = {
      type: 'doughnut',
      options: {
        events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove', 'webkitmouseforcedown'],
        maintainAspectRatio: false,
        legend: {display: false},
        onClick: (e, elements) => {
          var index = elements .length? elements [0] ._index: undefined;
          var position = container .position();
          var aWidth   = container .width();
          var pWidth   = 200;
          var cWidth   = this._content .width();
          if (!direction || position .left + direction * 80 < 0 || position .left + direction * 80 + pWidth > cWidth)
            direction = position .left > cWidth / 2? -1: 1;
          position .left += 80 * direction + (aWidth - pWidth) / 2;
          position .top  += 40;
          if (index != null)
            this._notifyObservers (NavigateViewEvent .BUDGET_CHART_CLICK, {
              name:      name,
              id:        data .cats [index] .id,
              position:  position,
              html:      container .closest ('div:not(._popup)'),
              direction: direction,
              altClick:  e .webkitForce > 1 || e .altKey,
              view:      this
            })
          return false;
        },
        tooltips: {
          backgroundColor: 'rgba(0,0,0,0.6)',
          callbacks: {
            title: (t, d) => {
              return d .labels [t [0] .index];
            },
            label: (t, d) => {
              return Types .moneyD .toString (d .datasets [0] .data [t.index]);
            }
          }
        }
      },
      data: {}
    }
    setDataset();
    var chart = new Chart (canvas .get (0). getContext ('2d'), config);
    return dt => {
      if (this._isVisible()) {
        if (dt .update) {
          var ds = data .cats .find (d => {return d .id == dt .update .id});
          if (ds) {
            var idx = data .cats .indexOf (ds);
            if (dt .update .name != null)
              config .data .labels [idx] = dt .update .name;
            data .cats [idx] .amount               = dt .update .amounts [0] .value;
            config .data .datasets [0] .data [idx] = dt .update .amounts [0] .value;
            config .centerLabel [1]                = Types .moneyD .toString (data .cats .reduce ((s,c) => {
              return s + (! c .blackout? c .amount: 0)
            }, 0))
          }
        } else {
          data = dt .replace;
          setDataset();
        }
        chart .update();
      } else
        this .resetHtml();
    }
  }

  addHistoryTable (dataset, skipHead, skipFoot, popup, position, toHtml, onClose) {
    return this .addBudgetTable ('_budgetHistoryTable', dataset, skipHead, skipFoot, popup, position, toHtml, onClose, false);
  }

  /**
   * Add a budget table
   *   returns {
   *     cols:   array of column headers
   *     months: number of months (for computing average)
   *     income: total income
   *     highlight: column number to highlight
   *     groups: [{
   *       name: name for this group
   *       rows: [{
   *         name:    name for this row
   *         id:      category id for this row
   *         isCredit: true iff this is a credit amount
   *         amounts: array of (id, value) pairs, one for each column
   *       }]
   *     }]
   *   }
   */
  addBudgetTable (name, dataset, skipHead, skipFoot, popup, position, toHtml, onClose, totalRows) {

    var groupTrs = [];
    var rowMap   = new Map();
    var tfoot ;

    var updateFoot = () => {
      if (! skipFoot) {
        var totals = dataset .groups .reduce ((total, group) => {
          var groupTotal = group .rows .reduce ((groupTotal, row) => {
            return row .amounts .map ((a,i) => {
              return a .value * (row .isCredit? 1: -1) + (groupTotal [i] || 0);
            })
          }, []);
          return groupTotal .map ((a,i) => {
            return a + (total [i] || 0)
          })
        }, []);
        var curBal = dataset .startBal || 0;
        var balance = totals .map (a => {curBal += a; return curBal});
        var grandTotal = totals .reduce ((s,a) => {return s + a}, 0);
        totals = totals .concat (totalRows? [grandTotal / dataset .months, grandTotal]: []);
        var feet = [
          ['Net Cash Flow'] .concat (totals  .map (a => {return Types .moneyD .toString (a)})),
          ['Cash Balance']  .concat (balance .map (a => {return Types .moneyD .toString (a)}))
        ]
        tfoot .empty();
        for (let foot of feet) {
          var tr = $('<tr>') .appendTo (tfoot);
          for (let i=0; i<foot.length; i++)
            $('<td>', {
              text:  foot [i],
              class: (foot [i] .charAt (0) == '-'? 'negative': '') + (dataset .highlight == i - 1? ' _highlight': '')
            }) .appendTo (tr);
        }
      }
    }

    var updateGroup = group => {
      if (group) {
        var tr     = groupTrs [dataset .groups .indexOf (group)];
        var totals = group .rows .reduce ((total, row) => {
          return row .amounts .map ((a,i) => {
            return a .value + (total [i] || 0)
          })
        },[])
        var grandTotal = totals .reduce ((s,a) => {return s + a}, 0);
        var vm = totals
          .concat (totalRows? [grandTotal / dataset .months, grandTotal]: [])
          .map (a => {return Types .moneyD .toString (a)});
        var values = [group .name]
          .concat (vm)
          .concat (totalRows? Types .percent .toString (grandTotal / dataset .income): [])
        tr .empty();
        for (let i=0; i<values.length; i++)
          $('<td>', {
            text: values [i],
            class: (values [i] && values [i] .charAt (0) == '-'? 'negative': '') + (dataset .highlight == i - 1? ' _highlight': '')
          }) .appendTo (tr);
      }
    }

    var updateRow = row => {
      var tr = rowMap .get (row .id);
      if (tr) {
        var isCredit = row .isCredit;
        var rowTotal = row .amounts .reduce ((s,a) => {return s + a .value}, 0);
        var vm = row .amounts
          .concat (totalRows? [{value: rowTotal / dataset .months}, {value: rowTotal}] : [])
          .map    (a => {return Types .moneyD .toString (a .value)})
        var vs = [row .name]
          .concat (vm)
          .concat (totalRows? Types .percent .toString (rowTotal / dataset .income) : [])
        tr .empty();
        for (let i=0; i< vs.length; i++)
          $('<td>', {
            text: vs [i] || '',
            class: (vs [i] && vs [i] .charAt (0) == '-'? 'negative': '') + (dataset .highlight == i - 1? ' _highlight': '')
          }) .appendTo (tr);
      }
    }

    var addTable = () => {
      groupTrs  = [];
      rowMap    = new Map();
      var table = $('<table>', {class: name}) .appendTo (container);
      var thead = $('<thead>') .appendTo (table);
      var tbody = $('<tbody>') .appendTo (table);
      tfoot = $('<tfoot>') .appendTo (table);
      table [0] .addEventListener ('webkitmouseforcewillbegin', e => {e .preventDefault()}, true)
      table .on ('click webkitmouseforcedown', 'tr', e => {
        let id       = $(e .currentTarget) .data ('id');
        let target   = e .target;
        let col      = target && target .cellIndex - 1;
        if (col == -1 && dataset .cols .length <= 1) {
          col    = 0;
          target = $(target) .next() [0];
        }
        let html     = $(target) .closest ('.' + name + 's');
        let htmlo    = html .offset()
        let position = $(target) .offset();
        position .top  -= htmlo .top - 20;
        position .left -= htmlo .left;
        if (dataset .cols .length && (col == -1 || col >= dataset .cols .length)) {
          let prev = $(target) .closest ('div.' + name);
          position .left = (prev .length? prev .position() .left: 0) + 20;
        }
        if (id)
          this._notifyObservers (NavigateViewEvent .BUDGET_TABLE_CLICK, {
            name:     name,
            id:       id,
            date:     col >= 0 && col < dataset .dates .length? dataset .dates [col]: col >= 0 && col < dataset .cols .length? []: null,
            html:     html,
            position: position,
            altClick: e .originalEvent && (e .originalEvent .webkitForce > 1 || e .originalEvent .altKey),
            view:     this
          })
          return false;
      });
      var headTr = $('<tr>') .appendTo (thead);
      var cols   = ['Category'] .concat (dataset .cols) .concat (totalRows? ['Ave','Total','%Inc'] : []);
      if (! skipHead)
        for (let i=0; i<cols.length; i++)
          $('<th>', {text: cols [i], class: dataset .highlight == i - 1? '_highlight': ''}) .appendTo (headTr);
      for (let group of dataset .groups) {
        if (! skipHead) {
          groupTrs .push ($('<tr>', {class: '_subtotal'}) .appendTo (tbody));
          updateGroup (group);
        }
        for (let row of group .rows) {
          rowMap .set (row .id, $('<tr>', {data: {id: row .id}}) .appendTo (tbody));
          updateRow (row);
        }
      }
      updateFoot();
    }

    /* addBudgetTable main */
    if (! toHtml || toHtml .length == 0) {
      toHtml = this._content .find ('.' + name + 's');
      if (toHtml .length == 0)
        toHtml = $('<div>', {class: name + 's'}) .appendTo (this._content);
    }
    var container = $('<div>', {class: name + (popup? ' _popup': '')}) .appendTo (toHtml);
    if (popup && position) {
      container .css (position);
      ui .ModalStack .add (
        e  => {return e && !$.contains (container .get (0), e .target) && container .get (0) != e .target},
        () => {container .remove(); onClose()},
        true
      );
    }
    addTable ();
    return data => {
      if (this._isVisible()) {
        if (data .update) {
          outerLoop: for (let g of dataset .groups)
            for (let r of g .rows)
              if (r .id == data .update .id) {
                r .name    = data .update .name;
                r .amounts = data .update .amounts;
                var group = g;
                var row   = r;
                break outerLoop;
              }
          updateGroup (group);
          updateRow   (row);
          updateFoot();
        } else {
          dataset = data .replace;
          container .empty();
          addTable();
        }
      } else
        this .resetHtml();
    }
  }

  addNetWorthGraph (dataset, toHtml, onClose) {
    var options = {
      legend: {display: false},
      tooltips: {
        backgroundColor: 'rgba(0,0,0,0.6)',
        callbacks: {
          label: (t, d) => {
            return d .datasets [t .datasetIndex] .label + ': ' +Types .moneyD .toString (t .yLabel);
          }
        }
      },
      scales: {
        yAxes: [{
          stacked: true,
          ticks: {
            userCallback: (value, index, values) => {
              return Types .moneyD .toString (value);
            }
          }
        }]
      }
    }
    this._resetColors();this._nextColor();this._nextColor();this._nextColor();this._nextColor();
    var data = {
      labels:   dataset .cols,
      datasets: dataset .rows .map (r => {
        var ds = {
          label: r .name,
          data:  r .amounts,
          backgroundColor: this._getColor (0.05),
          borderColor: this._getColor (.5),
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 0,
          pointHitRadius: 10
        }
        this._nextColor();
        return ds;
      })
    }
    var container = $('<div>', {class: '_netWorthGraphContainer'});
    if (toHtml)
      container .insertAfter (toHtml)
    else
      container .appendTo (this._content);
    var canvas = $('<canvas>', {class: '_netWorthGraph'}) .appendTo (container)
    var chart = new Chart (canvas .get (0). getContext ('2d'), {
      type:    'line',
      data:    data,
      options: options
    });
    var cur   = $('<div>', {class: '_curNetWorth'}) .appendTo (container);
    $('<div>', {text: Types .dateLong .toString (Types .date .today()), class:'_text'}) .appendTo (cur);
    var table = $('<table>') .appendTo (cur)
    var tfoot = $('<tfoot>') .appendTo (table);
    var tbody = $('<tbody>') .appendTo (table);
    for (let c of dataset .rows) {
      var tr = $('<tr>') .appendTo (tbody);
      $('<td>', {text: c .name})                             .appendTo (tr);
      $('<td>', {text: Types .moneyD .toString (c .curBal)}) .appendTo (tr);
    }
    var fvs = [
      ['Liquid', Types .moneyD .toString (dataset .rows .filter (r => {return r .type}) .reduce ((s,r) => {return s + r .curBal}, 0))],
      ['TOTAL',  Types .moneyD .toString (dataset .rows                                 .reduce ((s,r) => {return s + r .curBal}, 0))]
    ];
    for (let fv of fvs) {
      var tr = $('<tr>') .appendTo (tfoot);
      for (let v of fv)
        $('<td>', {text: v}) .appendTo (tr);
    }
    return data => {
      if (!this._isVisible())
        this .resetHtml();
    }
  }

  addNetWorthTable (dataset, toHtml, onClose) {
    var table = $('<table>', {class: '_netWorthTable'});
    if (toHtml)
      table .insertAfter (toHtml);
    else
      table .appendTo (this._content);
    var thead = $('<thead>') .appendTo (table);
    var tbody = $('<tbody>') .appendTo (table);
    var tfoot = $('<tfoot>') .appendTo (table);
    var tr    = $('<tr>') .appendTo (thead);
    var cols  = ['Account'] .concat (dataset .cols);
    for (let i=0; i<cols.length; i++)
      $('<th>', {text: cols [i], class: dataset .highlight == i - 1? '_highlight': ''}) .appendTo (tr);
    var liquid = [];
    var net    = [];
    for (let row of dataset .rows) {
      var tr = $('<tr>') .appendTo (tbody);
      let vs = [row .name] .concat (
        row .amounts .map (a => {return Types .moneyK .toString (a)})
      )
      net = row .amounts .map ((a,i) => {return a + (net [i] || 0)});
      if (! [AccountType .MORTGAGE, AccountType .HOME] .includes (row .type))
        liquid = row .amounts .map ((a,i) => {return a + (liquid [i] || 0)});
      for (let i=0; i<vs.length; i++)
        $('<td>', {text: vs [i], class: dataset .highlight == i - 1? '_highlight': ''}) .appendTo (tr);
    }
    var vss = [
      ['Liquid'] .concat (liquid .map (a => {return Types .moneyK .toString (a)})),
      ['TOTAL']  .concat (net    .map (a => {return Types .moneyK .toString (a)}))
    ]
    for (let vs of vss) {
      var tr = $('<tr>') .appendTo (tfoot);
      for (let i=0; i<vs.length; i++)
        $('<td>', {text: vs [i], class: dataset .highlight == i - 1? '_highlight': ''}) .appendTo (tr);
    }
    return data => {
      if (!this._isVisible())
        this .resetHtml();
    }
  }
}

var NavigateViewEvent = Object.create (ViewEvent, {
  PROGRESS_GRAPH_CLICK:       {value: 201},
  BUDGET_CHART_CLICK:         {value: 202},
  BUDGET_GRAPH_CLICK:         {value: 203},
  BUDGET_GRAPH_TITLE_CLICK:   {value: 204},
  BUDGET_TABLE_CLICK:         {value: 205},
  PROGRESS_GRAPH_TITLE_CLICK: {value: 206}
});


var baseDoughnutController = Chart .controllers .doughnut;

Chart .controllers .doughnut = Chart .controllers .doughnut .extend ({

  draw: function() {
    baseDoughnutController .prototype .draw .apply (this, arguments);
    this._drawLabel (this .chart);
  },

  _drawLabel: function (thisChart) {
    var chart        = thisChart .chart;
    var ctx          = chart .ctx;
    var centerLabel  = thisChart .config .centerLabel;
    if (centerLabel) {
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.font         = '20px Helvetica';
      ctx.fillStyle    = '#666666';
      ctx.fillText (centerLabel [0], chart .width / 2 , chart .height / 2 - 8);
      ctx.font         = '14px Helvetica';
      ctx.fillStyle    = '#888888';
      ctx.fillText (
        centerLabel [1],
        chart .width / 2 ,
        chart .height / 2 + 10
      );
    }
  }
});




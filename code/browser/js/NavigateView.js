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
    this._idSeq    = 0;
    this._accounts = accounts;
    this._variance = variance;
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

  isVisible() {
    return this._toHtml && ! this._toHtml .hasClass ('background');
  }

  _nextColor() {
    this._colorIndex = (this._colorIndex + 1) % this._colors .length;
  }

  addHeading (text, name='', toHtml = this._content) {
    var id      = this._name + '_' + this._idSeq++;
    var anchors = [];
    var content = $('<div>', {class: '_heading ' + name, text: text, attr: {id: id}}) .appendTo (toHtml);
    return content;
  }

  addContainer (name='', toHtml = this._content) {
    return $('<div>', {class: name}) .appendTo (toHtml);
  }

  addSlider (options, toHtml) {
    $('<div>', {class: '_sliderFill', text: ' '}) .appendTo (toHtml);
    let slider = $('<div>', {class: '_slider'}) .appendTo (toHtml) [0];
    slider .addEventListener ('webkitmouseforcedown', e => {e .preventDefault(); e .stopPropagation(); e .stopImmediatePropagation(); return false}, true);
    let so = {
      range:   {min: 0, max: 0},
      start:   [],
      connect: true,
      step:    1
    };
    let values = [];
    if (options .left) {
      so .range .min = options .left .min;
      so .range .max = options .left .max;
      so .start .push (options .left .start);
    }
    if (options .right) {
      if (options .right .min)
        so .range .min = so .range .min? Math .min (so .range .min, options .right .min): options .right .min;
      if (options .right .max)
        so .range .max = so .range .max? Math .max (so .range .max, options .right .max): options .right .max;
      so .start .push (options .right .start);
    }
    noUiSlider .create (slider, so);
    let lastValues = {
      left:  options .left .start,
      right: options .right .start
    }
    slider .noUiSlider .on ('update', (values, handle) => {
      if (values [0] != lastValues .left) {
        if (values [0] > options .keep .value [0] || lastValues .right - values [0] < options .keep .count) {
          lastValues .left = Math .min (options .keep .value [0], lastValues .right - options .keep .count + 1);
          slider .noUiSlider .set ([lastValues .left, lastValues .right]);
          return;
        }
        lastValues .left = values [0];
      }
      if (values [0] == lastValues .left && values [1] != lastValues .right) {
        if (values [1] < options .keep .value [1] || values [1] - lastValues .left < options .keep .count) {
          lastValues .right = Math .max (options .keep .value [1], lastValues .left + options .keep .count - 1);
          slider .noUiSlider .set ([lastValues .left, lastValues .right]);
          return;
        }
        lastValues .right = values [1];
      }
      options .onChange (values, handle)
    });
  }

  addSubHeading (text, name = '', toHtml = this._content) {
    var id      = this._name + '_' + this._idSeq++;
    var anchors = [];
    var content = $('<div>', {class: '_text', html: text, attr: {id: id}}) .appendTo (toHtml);
    return content;
  }

  addProgressSidebar() {
    this._html .parent() .addClass ('_progressContents');
    this._content .remove();
    this._content = this._html;
    this._progressSidebar = $('<div>', {class: '_progressSidebar _sidebar_right'}) .appendTo (this._content);
    this._hideButton      = $('<button>', {class: '_sidebar_right_hide_botton', click: () => {
      this._progressSidebar .hide();
      this._showButton      .show();
    }, html: '&times;'}) .appendTo (this._progressSidebar);
  }

  _addTooltip (element, text) {
    var tt;
    if (text) {
      element .hover (
        e => {
          let toHtml = element .closest ('.contents');
          tt = $('<div>', {
            class: '_toolTipNoPosition',
            text: text,
          }) .appendTo (toHtml);
          window .setTimeout (() => {
            if (tt) {
              tt .css (ui .calcPosition (element, toHtml, {top: 30, left: -8}, tt .width())) .fadeIn (120);
            }
          })
        },
        e => {
          tt .remove();
      });
    }
  }

  addProgressSidebarGroup (name, tooltip, flag) {

    const shortListLength = 6;
    const categories      = this._variance .getBudget() .getCategories();
    var isShowingMore     = false;
    var table;
    var list              = [];
    var group             = $('<div>', {class: '_sidebar_group ' + (flag || '')}) .appendTo (this._progressSidebar);
    let heading           = $('<div>', {class: '_heading', text: name}) .appendTo (group);
    if (tooltip && tooltip .length)
      this._addTooltip (heading, tooltip);

    var buildTable = () => {
      if (table)
        table .remove();
      table = $('<table>') .appendTo (group);
      table [0] .addEventListener ('webkitmouseforcewillbegin', e => {e .preventDefault()}, true);
      for (let i = 0; i < Math .min (isShowingMore? list .length: shortListLength, list .length); i++) {
        let item = list [i];
        let tr = $ ('<tr>') .appendTo (table)
        this._addTooltip (tr, item .tooltip);
        if (item .id)
          tr .on ('click webkitmouseforcedown', e => {
            let html = this._progressGraphs;
            this._notifyObservers (NavigateViewEvent .PROGRESS_SIDEBAR_CLICK, {
              id:       item .id,
              html:     html,
              position: ui .calcPosition (tr, html, {top: 0, left: -900}),
              view:     this,
              altClick: e .originalEvent .webkitForce > 1 || e .originalEvent .altKey
            });
            e .stopPropagation();
            return false;
          })
        this._addTooltip ($('<td>', {text: item .name}) .appendTo (tr), item .nameTooltip);
        if (item .amount) {
          this._addTooltip ($('<td>', {
            text: Types .moneyDZ .toString (item .amount),
            class: item .amount < 0? 'negative': ''
          })  .appendTo (tr), item .amountTooltip)
        } else if (list [i] .percent)
          this._addTooltip ($('<td>', {text: Types .percent .toString (item .percent)}) .appendTo (tr), item .amountTooltip);
      }
      if (list .length > shortListLength)
        $('<td>', {class: '_showMoreLess', html: isShowingMore? 'Show Less&#133;': 'Show More&#133;'}) .appendTo ($('<tr>') .appendTo (table)) .after ($('<td>'))
          .click (e => {
            isShowingMore = ! isShowingMore;
            table .remove();
            buildTable();
            e .stopPropagation();
            return false;
          })
    }

    return (update) => {
      list = update;
      buildTable();
    }
  }

  addProgressGraph (to, popup, position, onClose) {
    if (!this._progressGraphs) {
      this._progressGraphs = $('<div>', {class: '_progressGraphs'}) .appendTo (this._content);
      this._showButton     = $('<button>', {class: '_sidebar_right_show_button', click: () => {
        this._progressSidebar .show();
        this._showButton      .hide();
        e .stopPropagation();
        return false;
      }, html: '&#9776;'}) .appendTo (this._progressGraphs);
      this._container = $('<div>', {class: '_container'}) .appendTo (this._progressGraphs);
    }
    var container = to || this._container;
    if (container .length) {
      var graph = $('<div>', {class: '_progressGraph' + (popup? ' _popup': '')}) .appendTo (container) .append ($('<div>', {class: '_popupContent'}));
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
      $('<div>', {class: '_heading', text: heading}) .appendTo (progressGraph .children());
  }

  addToProgressGraph (progressGraph, heading, data, labelWidth) {
    if (progressGraph) {
      if (heading)
        var head = $('<div>', {class: '_text', text: heading})
          .appendTo (progressGraph .children())
          .on ('click webkitmouseforcedown', e => {
            this._notifyObservers (NavigateViewEvent .PROGRESS_GRAPH_TITLE_CLICK, {
              data:     data,
              html:     progressGraph,
              position: {top: 50, left: 50},
              view:     this
            });
            e .stopPropagation();
            return false;
          })
      head [0] .addEventListener ('webkitmouseforcewillbegin', e => {e .preventDefault()}, true)
      var isPopup = progressGraph .hasClass ('_popup');
      if (isPopup)
        progressGraph .removeClass ('hidden');
      var graph = new BudgetProgressGraph (
        '', progressGraph .children(), true, false,
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
      if (isPopup)
        ui .scrollIntoView (progressGraph, false);
      return (data, labelWidth, heading) => {
        if (heading)
          head .text (heading);
        graph .update (data, labelWidth);
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
    var startCol, endCol;
    dataset       = Object .assign ({}, dataset);
    dataset .cols = dataset .cols .map (c => {return c});
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
      startCol = 0;
      endCol   = dataset .cols .length - 1;
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
    var graph  = $('<div>', {class: name + (popup? ' _popup': '')}) .appendTo (container) .append ($('<div>', {class: '_popupContent'}))
    processDataset();
    if (popup) {
      if (data .length == 1) {
        let head = $('<div>', {class: '_heading'})
          .appendTo (graph .children())
          .on ('click webkitmouseforcedown', e => {
            let position = graph .position();
            position .top  += 50;
            position .left += 50;
            this._notifyObservers (NavigateViewEvent .BUDGET_GRAPH_TITLE_CLICK, {
              name:     name,
              id:       data [0] .id,
              data:     data,
              position: position,
              html:     container .closest ('div:not(._popup)'),
              view:     this,
              altClick: e .originalEvent .webkitForce > 1 || e . originalEvent .altKey
            });
            e .stopPropagation();
            return false;
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
    var canvas = $('<canvas>') .appendTo (graph .children());
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
          e .stopPropagation();
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
    if (dataset .highlight != null) {
      var updating, needRedraw;
      var drawHighlightBox = (percent) => {
        let ctx          = chart .ctx;
        let chartArea    = chart .chartArea;
        let scale        = chart .scales ['x-axis-0'];
        let tickWidth    = scale .width / scale .ticks .length;
        let gco          = ctx .globalCompositeOperation;
        let margin       = 4;
        let boxWidth     = (tickWidth - margin * 2);
        let startX       = scale .left + dataset .highlight * tickWidth + (tickWidth/2) - boxWidth/2;
        ctx .beginPath();
        ctx .rect (startX, 0, boxWidth, scale .bottom);
        ctx .lineWidth   = 4;
        ctx .strokeStyle = 'rgba(255,0,0,'+(percent * 0.3)+')';
        ctx .globalCompositeOperation = 'destination-over';
        ctx .stroke();
        ctx .globalCompositeOperation = gco;
        needRedraw       = false;
      }
      config .options .animation = {
        onProgress: (ani) => {
          if (updating) {
            const start = 0.3;
            let   percent = ani .currentStep / ani .numSteps;
            if (percent > start)
              drawHighlightBox (Math .min (1, (percent - start) / (1 - start)));
          }
        },
        onComplete: () => {
          updating = false;
        }
      };
      config .plugins = [{
        beforeDatasetsUpdate: () => {updating = true},
        afterDatasetsDraw: (chart, complete) => {
          if (! updating)
            drawHighlightBox (1);
        },
        resize: () => {
          needRedraw = true;
        },
        afterDraw: () => {
          if (needRedraw) {
            drawHighlightBox (1);
            needRedraw = false;
          }
        }
      }];
    }
    setDataset();
    chart = new Chart (canvas .get (0) .getContext ('2d'), config);
    if (popup)
      ui .scrollIntoView (graph, false);
    var highlightCopy, colsCopy, datasetsCopy;
    return (updates) => {
      for (let update of updates || [])

        if (update .update) {
          var ds = config .data .datasets .find (d => {return d .id == update .update .id});
          if (ds) {
            if (update .update .name != null)
              ds .label = update .update .name;
            if (update .update .amounts != null)
              ds .data  = update .update .amounts .map (a => {return a .value});
          }
          if (data [0] .id == update .update .id && update .update .name)
            graph .find ('span._heading') .text (update .update .name)

        } else if (update .filterCols) {
          if (colsCopy == null) {
            highlightCopy = dataset .highlight;
            colsCopy      = dataset .cols .map (c => {return c});
            datasetsCopy  = datasets .map (ds => {
              ds = Object .assign ({}, ds);
              ds .data = ds .data .map (d => {return d});
              return ds;
            });
          }
          if (highlightCopy != null)
            dataset .highlight = highlightCopy - update .filterCols .start;
          if (update .filterCols .start > startCol) {
            /* remove from front */
            config .data .labels .splice (0, update .filterCols .start - startCol);
            for (let ds of config .data .datasets)
              ds .data .splice (0, update .filterCols .start - startCol);
          } else
            /* add to front */
            for (let c = startCol - 1; c >= update .filterCols .start; c--) {
              config .data .labels .splice (0, 0, colsCopy [c]);
              for (let i = 0; i < config .data .datasets .length; i++) {
                config .data .datasets [i] .data .splice (0, 0, datasetsCopy [i] .data [c]);
              }
            }
          if (update .filterCols .end < endCol) {
            /* remove from end */
            let deleteCount = endCol - update .filterCols .end;
            let spliceStart = config .data .labels .length - deleteCount;
            config .data .labels .splice (spliceStart, deleteCount);
            for (let ds of config .data .datasets)
              ds .data .splice (spliceStart, deleteCount);
          } else
            /* add to end */
            for (let c = endCol + 1; c <= update .filterCols .end; c++) {
              config .data .labels .push (colsCopy [c]);
              for (let i = 0; i < config .data .datasets .length; i++)
                config .data .datasets [i] .data .push (datasetsCopy [i] .data [c]);
            }
          startCol = update .filterCols .start;
          endCol   = update .filterCols .end;

        } else if (update .replace) {
          dataset = update .replace;
          processDataset();
          setDataset();
        }
      chart .update();
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
            });
          e .stopPropagation();
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
    return updates => {
      for (let update of updates || [])
        if (update .update) {
          var ds = data .cats .find (d => {return d .id == update .update .id});
          if (ds) {
            var idx = data .cats .indexOf (ds);
            if (update .update .name != null)
              config .data .labels [idx] = update .update .name;
            if (update .update .amounts != null) {
              data .cats [idx] .amount               = update .update .amounts [0] .value;
              config .data .datasets [0] .data [idx] = update .update .amounts [0] .value;
              config .centerLabel [1]                = Types .moneyD .toString (data .cats .reduce ((s,c) => {
                return s + (! c .blackout? c .amount: 0)
              }, 0))
            }
          }
        } else {
          data = update .replace;
          setDataset();
        }
      chart .update();
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
  addBudgetTable (name, dataset, skipHead, skipFoot, popup, position, toHtml, onClose = () => {}, totalRows) {

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
      var table = $('<table>', {class: name}) .appendTo (container .children());
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
        position .top  -= htmlo .top - 12;
        position .left -= htmlo .left + 8;
        if (dataset .cols .length && (col == -1 || col >= dataset .cols .length)) {
          let prev = $(target) .closest ('div.' + name);
          position .left = (prev .length? prev .position() .left + (prev .hasClass ('_popup')? 8: 0): 0) + 12;
        }
        if (id)
          this._notifyObservers (NavigateViewEvent .BUDGET_TABLE_CLICK, {
            name:     name,
            id:       id,
            date:     dataset .dates && (col >= 0 && col < dataset .dates .length? dataset .dates [col]: col >= 0 && col < dataset .cols .length? []: null),
            html:     html,
            position: position,
            altClick: e .originalEvent && (e .originalEvent .webkitForce > 1 || e .originalEvent .altKey),
            view:     this
          })
          e .stopPropagation();
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
      if (popup)
        ui .scrollIntoView (container);
    }

    /* addBudgetTable main */
    if (! toHtml || toHtml .length == 0) {
      toHtml = this._content .find ('.' + name + 's');
      if (toHtml .length == 0)
        toHtml = $('<div>', {class: name + 's'}) .appendTo (this._content);
    }
    var container = $('<div>', {class: name + (popup? ' _popup': '')}) .appendTo (toHtml) .append ('<div>');
    if (popup && position) {
      container .css (position);
      ui .ModalStack .add (
        e  => {return e && !$.contains (container .get (0), e .target) && container .get (0) != e .target},
        () => {container .remove(); onClose()},
        true
      );
    }
    addTable ();
    return updates => {
      for (let update of updates || [])
        if (update .update) {
          outerLoop: for (let g of dataset .groups)
            for (let r of g .rows)
              if (r .id == update .update .id) {
                if (update .update .name != null)
                  r .name    = update .update .name;
                if (update .update .amounts != null)
                  r .amounts = update .update .amounts;
                var group = g;
                var row   = r;
                break outerLoop;
              }
          updateGroup (group);
          updateRow   (row);
          updateFoot();
        } else if (update .replace) {
          dataset = update .replace;
          container .children() .empty();
          addTable();
        }
    }
  }

  /**
   * addNetWorthGraph
   */
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
    var config = {
      type:    'line',
      data:    data,
      options: options
    };
    if (dataset .highlight != null) {
      var updating, needRedraw;
      var drawHighlightBox = (percent) => {
        let hColumn      = dataset .highlight .column != null? dataset .highlight .column: dataset .highlight;
        let hScale       = dataset .highlight .column != null? dataset .highlight .percentComplete : 1;
        let ctx          = chart .ctx;
        let chartArea    = chart .chartArea;
        let scale        = chart .scales ['x-axis-0'];
        let tickWidth    = scale .width / (scale .ticks .length - 1);
        let gco          = ctx .globalCompositeOperation;
        let startX       = scale .left + hColumn * tickWidth - tickWidth * (1 - hScale);
        ctx .beginPath();
        ctx .moveTo (startX, 0);
        ctx .lineTo (startX, scale .bottom);
        ctx .lineWidth   = 4;
        ctx .strokeStyle = 'rgba(255,0,0,'+(percent * 0.3)+')';
        ctx .globalCompositeOperation = 'destination-over';
        ctx .stroke();
        ctx .globalCompositeOperation = gco;
        needRedraw       = false;
      }
      config .options .animation = {
        onProgress: (ani) => {
          if (updating) {
            const start = 0.3;
            let   percent = ani .currentStep / ani .numSteps;
            if (percent > start)
              drawHighlightBox (Math .min (1, (percent - start) / (1 - start)));
          }
        },
        onComplete: () => {
          updating = false;
        }
      };
      config .plugins = [{
        beforeDatasetsUpdate: () => {updating = true},
        afterDatasetsDraw: (chart, complete) => {
          if (! updating)
            drawHighlightBox (1);
        },
        resize: () => {
          needRedraw = true;
        },
        afterDraw: () => {
          if (needRedraw) {
            drawHighlightBox (1);
            needRedraw = false;
          }
        }
      }];
    }
    var chart = new Chart (canvas .get (0). getContext ('2d'), config);
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
    var startCol = 0;
    var endCol   = dataset .cols .length - 1;
    var highlightCopy, colsCopy, datasetsCopy;
    return updates => {
      for (let update of updates || []) {
        if (update .filterCols) {
          if (colsCopy == null) {
            highlightCopy = dataset .highlight .column != null? Object .assign ({}, dataset .highlight): dataset .highlight;
            colsCopy      = dataset .cols .map (c => {return c});
            datasetsCopy  = data. datasets .map (ds => {
              ds = Object .assign ({}, ds);
              ds .data = ds .data .map (d => {return d});
              return ds;
            });
          }
          if (highlightCopy != null) {
            if (highlightCopy .column)
              dataset .highlight .column = highlightCopy .column - update .filterCols .start;
            else
              dataset .highlight = highlightCopy - update .filterCols .start;
          }
          let config = chart .config;
          if (update .filterCols .start > startCol) {
            /* remove from front */
            config .data .labels .splice (0, update .filterCols .start - startCol);
            for (let ds of config .data .datasets)
              ds .data .splice (0, update .filterCols .start - startCol);
          } else
            /* add to front */
            for (let c = startCol - 1; c >= update .filterCols .start; c--) {
              config .data .labels .splice (0, 0, colsCopy [c]);
              for (let i = 0; i < config .data .datasets .length; i++) {
                config .data .datasets [i] .data .splice (0, 0, datasetsCopy [i] .data [c]);
              }
            }
          if (update .filterCols .end < endCol) {
            /* remove from end */
            let deleteCount = endCol - update .filterCols .end;
            let spliceStart = config .data .labels .length - deleteCount;
            config .data .labels .splice (spliceStart, deleteCount);
            for (let ds of config .data .datasets)
              ds .data .splice (spliceStart, deleteCount);
          } else
            /* add to end */
            for (let c = endCol + 1; c <= update .filterCols .end; c++) {
              config .data .labels .push (colsCopy [c]);
              for (let i = 0; i < config .data .datasets .length; i++)
                config .data .datasets [i] .data .push (datasetsCopy [i] .data [c]);
            }
          startCol = update .filterCols .start;
          endCol   = update .filterCols .end;
        }
      }
      chart .update();
    }
  }

  addNetWorthTable (dataset, toHtml, onClose) {
    var table = $('<table>', {class: '_netWorthTable'});
    if (toHtml)
      table .insertAfter (toHtml);
    else
      table .appendTo (this._content);
    var buildTable = () => {
      table.empty();
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
    }
    buildTable();
    return updates => {
      for (let update of updates || []) {
        if (update .replace) {
          dataset = update .replace;
          buildTable();
        }
      }
    }
  }
}

var NavigateViewEvent = Object.create (ViewEvent, {
  PROGRESS_GRAPH_CLICK:       {value: 201},
  BUDGET_CHART_CLICK:         {value: 202},
  BUDGET_GRAPH_CLICK:         {value: 203},
  BUDGET_GRAPH_TITLE_CLICK:   {value: 204},
  BUDGET_TABLE_CLICK:         {value: 205},
  PROGRESS_GRAPH_TITLE_CLICK: {value: 206},
  PROGRESS_SIDEBAR_CLICK:     {value: 207}
});



/*******************************/
/***** CHART JS EXTENSIONS *****/

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




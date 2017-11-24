class BudgetYearGraph {

  constructor (budget, content) {
    this._budget           = budget;
    this._content          = content;
    this._budgetObserver   = this._budget .addObserver (this, this._onBudgetChange);
    this._backgroundColors = ['rgba(73,167,46,0.6)', 'rgba(26,101,202,0.6)', 'rgba(73,167,46,0.05)', 'rgba(26,101,202,0.05)'];
    this._borderColors     = ['rgba(73,167,46,0.8)', 'rgba(26,101,202,0.8)', 'rgba(73,167,46,0.3)',  'rgba(26,101,202,0.3)'];
  }

  delete() {
    this._budget .deleteObserver (this._budgetObserver);
  }

  _onBudgetChange() {
    if (this._config) {
      this._setDataset();
      this._chart .update();
    }
  }

  _getData() {
    var data = [];
    for (let genere of [this._budget .getIncomeCategory(), this._budget .getExpenseCategory(), this._budget .getWithdrawalsCategory(), this._budget .getSavingsCategory()]) {
      data .push ({
        name:   genere .name,
        amount: this._budget .getAmount (genere, this._budget .getStartDate(), this._budget .getEndDate()) .amount *
          (this._budget .isCredit (genere)? -1: 1)
      });
    }
    return data;
  }

  _setDataset() {
    var data      = this._getData();
    var variance  = data [0] .amount + data [2] .amount - (data [1] .amount + data [3] .amount);
    var max       = Math .max (data [0] .amount + data [2] .amount, data [1] .amount + data [3] .amount);
    var norm      = data .map (d => {return Math .round (d .amount * 98 / max)});
    var datasets  = data .map ((d,i) => {
      return {
        label:           d .name,
        data:            [i%2==0? norm [i]:  0, i%2==0? 0: norm [i]],
        values:          [i%2==0? d .amount: 0, i%2==0? 0: d.amount],
        backgroundColor: this._backgroundColors [i],
        borderColor:     this._borderColors [i],
        borderWidth:     1
      }
    })
    this._config .data .datasets = datasets;
    this._suffix .html ((variance < 0? "You're Over": variance > 0? 'Unallocated': '') +'<br/>'+ Types .moneyD .toString (Math .abs (variance)));
    if (variance < 0)
      this._suffix .addClass ('negative');
    else
      this._suffix .removeClass ('negative');
  }

  addHtml (toHtml) {
    this._content = toHtml;
    this .add();
  }

  add() {
    var container       = $('<div>', {class: '_budgetYearGraph'}) .appendTo (this._content);
    var canvasContainer = $('<div>', {class: '_graph'})           .appendTo (container);
    this._suffix        = $('<div>', {class: '_suffix'})          .appendTo (container);
    var canvas = $('<canvas>', {prop: {height: 70}}) .appendTo (canvasContainer);
    this._config = {
      type: 'horizontalBar',
      options: {
        maintainAspectRatio: false,
        legend: {display: false},
        animation: {duration: 0},
        elements: {rectangle: {borderWidth: 1, borderSkipped: 'left'}},
        tooltips: {
          backgroundColor: 'rgba(0,0,0,0.6)',
          callbacks: {
            title: (t, d) => {
              return d .datasets [t [0] .datasetIndex] .label;
            },
            label: (t, d) => {
              return Types .moneyD .toString (d .datasets [t .datasetIndex] .values [t .index]);
            }
          }
        },
        scales: {
          yAxes: [{stacked: true, display: false, ticks: {max: 100}}],
          xAxes: [{
            stacked: true,
            grideLines: {zeroLineColor: 'rgba(0,0,0,0)'},
            display: false
          }],
        }
      },
      data: {
        labels:   ['','']
      }
    };
    this._setDataset();
    this._chart = new Chart (canvas .get (0) .getContext ('2d'), this._config);
  }

}

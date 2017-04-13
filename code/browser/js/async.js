/**
 * Control async procedure using promises and generators
 */
function async (_this, makeGenerator) {
  if (!makeGenerator) {
    makeGenerator = _this;
    _this         = undefined;
  }
  return function() {
    var generator = makeGenerator.apply (_this, arguments);

    function handle (result) {
      if (result.done)
        return Promise.resolve (result.value);
      else
        return Promise.resolve (result.value) .then (function (res) {
          try {
            return handle (generator .next (res));
          } catch (e) {
            console.log(e);
            return Promise.reject (e);
          }
        }, function (err) {
          return handle (generator .throw (err));
        });
    }

    try {
      return handle (generator.next());
    } catch (ex) {
      console.log(ex);
      return Promise.reject (ex);
    }
  }
}

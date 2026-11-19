fetch('/version.json').then(function (r) { return r.json(); }).then(function (v) {
  var e = document.getElementById('latest'); if (e && v.version) e.textContent = 'Current version: ' + v.version + '.';
}).catch(function () {});

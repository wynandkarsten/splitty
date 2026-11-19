fetch('/version.json').then(function (r) { return r.json(); }).then(function (v) {
  var e = document.getElementById('apkver'); if (e && v.version) e.textContent = 'Version ' + v.version;
}).catch(function () {});

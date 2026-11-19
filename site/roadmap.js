// Fills the public roadmap from /api/roadmap. Text goes in via textContent, never as HTML.
(function () {
  var box = document.getElementById('roadmap'), list = document.getElementById('roadlist');
  if (!box || !list) return;
  fetch('/api/roadmap').then(function (r) { return r.json(); }).then(function (d) {
    if (!d.items || !d.items.length) return;
    d.items.forEach(function (it) {
      var li = document.createElement('li'), t = document.createElement('span'), tag = document.createElement('span');
      t.textContent = it.title; tag.className = 'tag ' + (it.status === 'doing' ? 'doing' : it.status === 'planned' ? 'planned' : '');
      tag.textContent = it.status === 'doing' ? 'in progress' : it.status;
      li.appendChild(t); li.appendChild(tag); list.appendChild(li);
    });
    box.hidden = false;
  }).catch(function () {});
})();
